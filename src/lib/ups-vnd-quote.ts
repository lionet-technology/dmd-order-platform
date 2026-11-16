import {db} from './db';
import {assertServiceV1Owner} from './service-v1-config';
import {finalServiceBook,sourceUpsZone,type Carton} from './service-v1-source';
import {saveUpsV1Account,type AccountBody} from './ups-v1-accounts';
import {UPS_V1_ACCOUNT_PRIORITY,upsLotBillable,upsSubServiceRounding,upsRateBand} from './ups-v1-calculator';
import {serviceV1DecimalNumber as dec} from './service-v1-pricing';
import {addVnd,subtractVnd,multiplyVnd,sumVnd,compareVnd} from './vnd-money';
type Row=Record<string,unknown>;
export function importFinalUpsAccounts(routeId:number,actorId:number,key:string){
 assertServiceV1Owner(actorId);
 return db.transaction(()=>{
 const route=db.prepare('SELECT * FROM service_route_configs WHERE id=?').get(routeId) as Row|undefined;
 const config=db.prepare('SELECT * FROM service_v1_config_versions WHERE route_id=? ORDER BY revision DESC LIMIT 1').get(routeId) as Row|undefined;
 if(!route||!config||String(route.service).toUpperCase()!=='UPS')throw Error('Cần route UPS.');
 const book=finalServiceBook(),sub=String(route.sub_service).toUpperCase();
 return UPS_V1_ACCOUNT_PRIORITY.map(account=>{
  const rates=book.ups_rates.filter(r=>r.account===account&&r.sub_service===sub&&r.rate!==null).map(r=>({zone:r.zone,min_kg:Number(r.min_kg),max_kg:Number(r.max_kg),min_inclusive:false,max_inclusive:true,unit:r.unit as 'FIXED'|'PER_KG',rate_vnd:Number(r.rate)}));
  const zone_components=Object.fromEntries(book.ups_weight_surcharges.filter(r=>r.account===account).map(r=>[r.zone,{weight_surcharge_vnd_per_kg:Number(r.rate),weight_discount:Number(r.discount)}]));
  return saveUpsV1Account({route_id:routeId,config_id:Number(config.id),source_excel:book.source.path,pricing:{account,rates,...(!rates.length?{unavailable:true}:{}),net_discount:0,shipment_surcharge_vnd:0,shipment_discount:0,weight_surcharge_vnd_per_kg:0,weight_discount:0,zone_components},request_key:key+':'+account},actorId);
 });
 }).immediate();
}
export function publishedUpsAccountIds(routeId:number,configId:number){
 return UPS_V1_ACCOUNT_PRIORITY.map(account=>{
  const v=db.prepare("SELECT v.* FROM service_v1_ups_account_events e JOIN service_v1_ups_account_versions v ON v.id=e.version_id WHERE v.route_id=? AND v.account=? AND e.action='PUBLISH' ORDER BY e.id DESC LIMIT 1").get(routeId,account) as Row|undefined;
  if(!v||v.config_id!==configId)throw Error('Cần Publish đủ UPS account theo cấu hình hiện hành.');
  return Number(v.id);
 });
}
export function upsVndShipment(input:{route_id:number;config_id:number;country:string;china_region?:'SOUTH'|'OTHER';sub_service:string;cartons:Carton[];account_ids:number[]}){
 const book=finalServiceBook(),zone=sourceUpsZone(book,input.country,input.china_region);
 const global=db.prepare("SELECT v.* FROM service_v1_ups_global_confirmations c JOIN service_v1_ups_global_versions v ON v.id=c.version_id ORDER BY c.id DESC LIMIT 1").get() as Row|undefined;
 if(!global)throw Error('Chưa xác nhận UPS globals.');
 const variables=JSON.parse(String(global.variables_json)) as Record<string,number>;
 const g=Object.fromEntries(Object.entries(variables).map(([k,v])=>[k,dec(v)]));
 const versions=input.account_ids.map(id=>{
  const v=db.prepare("SELECT v.* FROM service_v1_ups_account_versions v WHERE id=? AND route_id=? AND config_id=? AND EXISTS(SELECT 1 FROM service_v1_ups_account_events e WHERE e.version_id=v.id AND e.action='PUBLISH')").get(id,input.route_id,input.config_id) as Row|undefined;
  if(!v||v.source_excel!==book.source.path)throw Error('Thiếu published UPS account từ nguồn cuối (2).');
  return {id,body:JSON.parse(String(v.body_json)) as AccountBody};
 });
 if(versions.length!==3||new Set(versions.map(v=>v.body.account)).size!==3)throw Error('Cần đủ ba UPS account, không bỏ sót khi tối ưu.');
 if(!input.cartons.length||new Set(input.cartons.map(c=>c.id)).size!==input.cartons.length)throw Error('Thiếu/trùng carton.');
 const lots=[...new Set(input.cartons.map(c=>c.lot_id))].map(lot_id=>{
  if(!Number.isSafeInteger(lot_id)||lot_id<=0)throw Error('Carton chưa gán Lot.');
  const rounding=upsLotBillable(input.cartons.filter(c=>c.lot_id===lot_id).map(c=>({weight_kg:c.weight,length_cm:c.length,width_cm:c.width,height_cm:c.height})),upsSubServiceRounding(input.sub_service));
  const weight=rounding.billable_kg;
  const accounts=versions.flatMap(({id,body})=>{
   const availability=book.ups_rates.filter(r=>r.sub_service===input.sub_service.toUpperCase()&&r.account===body.account&&r.zone===zone.zone&&weight>Number(r.min_kg)&&weight<=Number(r.max_kg));
   if(availability.length!==1)throw Error('UPS interval thiếu/trùng trong nguồn cuối (2).');
   if(availability[0].rate===null)return [];
   const matches=body.rates.filter(r=>r.zone===zone.zone&&weight>r.min_kg&&weight<=r.max_kg);
   if(!matches.length){
    const raw=book.ups_rates.filter(r=>r.sub_service===input.sub_service.toUpperCase()&&r.account===body.account&&r.zone===zone.zone&&weight>Number(r.min_kg)&&weight<=Number(r.max_kg));
    if(raw.length===1&&raw[0].rate===null)return [];
    throw Error('Thiếu UPS interval, không bỏ account khi thiếu dữ liệu.');
   }
   if(matches.length!==1||matches[0].unit!==upsRateBand(weight).unit)throw Error('UPS interval/unit không hợp lệ.');
   const rate=matches[0],component=body.zone_components?.[zone.zone]??body;
   const sourceRate=book.ups_rates.find(r=>r.sub_service===input.sub_service.toUpperCase()&&r.account===body.account&&r.zone===zone.zone&&Number(r.min_kg)===rate.min_kg&&Number(r.max_kg)===rate.max_kg);
   const exactRate=sourceRate?.rate!==null&&sourceRate?.rate!==undefined&&Number(sourceRate.rate)===rate.rate_vnd?sourceRate.rate:dec(rate.rate_vnd);
   const transportation=multiplyVnd(exactRate,rate.unit==='PER_KG'?String(weight):'1');
   const discounted=multiplyVnd(transportation,subtractVnd('1',dec(body.net_discount)));
   const shipment=multiplyVnd(dec(body.shipment_surcharge_vnd),subtractVnd('1',dec(body.shipment_discount)));
   const weightFee=multiplyVnd(multiplyVnd(dec(component.weight_surcharge_vnd_per_kg),subtractVnd('1',dec(component.weight_discount))),String(weight));
   const total=addVnd(addVnd(multiplyVnd(multiplyVnd(addVnd('1',g.fuel),addVnd('1',g.vat)),sumVnd([discounted,shipment,weightFee])),multiplyVnd(g.us_broker,discounted)),multiplyVnd(g.customs_per_kg_vnd,String(weight)));
   return [{account:body.account,account_version_id:id,net_vnd:total,weight_kg:weight,rate,transportation_vnd:transportation,transportation_discounted_vnd:discounted,source_rate_cell:sourceRate?.cell,shipment_vnd:shipment,weight_surcharge_vnd:weightFee}];
  }).sort((a,b)=>compareVnd(a.net_vnd,b.net_vnd)||UPS_V1_ACCOUNT_PRIORITY.indexOf(a.account)-UPS_V1_ACCOUNT_PRIORITY.indexOf(b.account));
  if(!accounts.length)throw Error('Không có giá UPS cho sub-service/zone/cân.');
  return {lot_id,...zone,rounding,selected:accounts[0],accounts};
 });
 return {source_sha256:book.source.sha256,market:zone.zone,rate_key:'UPS:'+input.sub_service,lots,net_vnd:sumVnd(lots.map(l=>l.selected.net_vnd)),global_version_id:global.id,variables,account_versions:input.account_ids,surcharges:[],surcharge_vnd:'0'};
}
