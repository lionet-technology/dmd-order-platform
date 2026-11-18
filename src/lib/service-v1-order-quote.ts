import {db} from './db';
import {publishedUpsAccountIds,upsVndShipment} from './ups-vnd-quote';
import {currentServiceV1Fx} from './service-v1-fx';
import {finalServiceBook,sourceShipmentQuote,type SourceShipment} from './service-v1-source';
import {addVnd,multiplyVnd,subtractVnd,vnd} from './vnd-money';
import {createServiceV1Net,serviceV1DecimalNumber} from './service-v1-pricing';
import {assertServiceV1Owner} from './service-v1-config';
type Row=Record<string,unknown>;
export function automaticSourceKind(service:string,sub:string):SourceShipment['service']|null {
 if(service.toUpperCase()==='UPS')return 'UPS';
 if(['YUN EXPRESS','YUNEXPRESS'].includes(service.toUpperCase()))return 'YUN';
 if(service.toUpperCase()==='EPACKET')return sub.toUpperCase().includes('EU')?'EPACKET_EU':'EPACKET_US';
 return null;
}
const subKey=(s:string)=>s.toUpperCase().replace(/^EPACKET\s+/,'').trim();
export function importFinalServiceNet(routeId:number,actorId:number,requestKey:string){
 assertServiceV1Owner(actorId);
 return db.transaction(()=>{
 const r=db.prepare('SELECT * FROM service_route_configs WHERE id=?').get(routeId) as Row|undefined;
 const config=db.prepare('SELECT * FROM service_v1_config_versions WHERE route_id=? ORDER BY revision DESC LIMIT 1').get(routeId) as Row|undefined;
 if(!r||!config)throw Error('Thiếu route/cấu hình V1.');
 const kind=automaticSourceKind(String(r.service),String(r.sub_service));
 if(!kind)throw Error('Dịch vụ chưa có nguồn.');
 if(kind==='UPS'){
  const ids=publishedUpsAccountIds(routeId,Number(config.id));
  const rows=ids.flatMap(id=>{
   const v=db.prepare('SELECT account,body_json FROM service_v1_ups_account_versions WHERE id=?').get(id) as {account:string;body_json:string};
   return (JSON.parse(v.body_json).rates as Array<{zone:string;min_kg:number;max_kg:number;rate_vnd:number}>).map(rate=>({key:v.account+':'+rate.zone+':'+rate.min_kg+':'+rate.max_kg,net_vnd:rate.rate_vnd}));
  });
  return createServiceV1Net({route_id:routeId,config_id:Number(config.id),source_excel:finalServiceBook().source.path,rows,ups_account_version_ids:ids,request_key:requestKey},actorId);
 }
 const source=finalServiceBook(),currency=kind==='EPACKET_US'?'USD':'VND';
 const rows=source.rates.filter(x=>x.service===kind&&(kind!=='EPACKET_US'||x.market===subKey(String(r.sub_service)))).map(x=>({key:kind+':'+x.market+':'+x.max_kg,...(currency==='USD'?{net_usd:Number(x.rate)}:{net_vnd:Number(x.rate)})}));
 return createServiceV1Net({route_id:routeId,config_id:Number(config.id),source_excel:source.source.path,source_currency:currency,rows,request_key:requestKey},actorId);
 }).immediate();
}
export function publishedVndRoute(routeId:number){
 const config=db.prepare('SELECT * FROM service_v1_config_versions WHERE route_id=? ORDER BY revision DESC LIMIT 1').get(routeId) as Row|undefined;
 const price=db.prepare("SELECT d.* FROM service_v1_price_events e JOIN service_v1_price_documents d ON d.id=e.document_id WHERE d.route_id=? AND d.kind='PROPOSAL' AND e.action='PUBLISH' ORDER BY e.id DESC LIMIT 1").get(routeId) as Row|undefined;
 return config&&price&&price.config_id===config.id?{config,price}:null;
}
/** Server resolves shipment and published row; callers cannot select a cheaper rate key. */
export function automaticVndOrderQuote(orderId:number){
 const o=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as Row|undefined;
 if(!o)throw Error('Order không tồn tại.');
 const kind=automaticSourceKind(String(o.service),String(o.sub_service));
 if(!kind)throw Error('Chưa nối Purchase VNĐ cho dịch vụ này.');
 const r=db.prepare('SELECT * FROM service_route_configs WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE').get(o.service,String(o.sub_service||''),o.supplier) as Row|undefined;
 if(!r)throw Error('Không có route.');
 const publishedRoute=publishedVndRoute(Number(r.id));
 if(!publishedRoute)throw Error('Chưa có Published Price theo cấu hình hiện hành.');
 const {config,price}=publishedRoute;
 const cfg=JSON.parse(String(config.config_json));
 if(cfg.adapter!==(kind==='YUN'?'YUNEXPRESS':kind==='UPS'?'UPS':'EPACKET'))throw Error('Adapter không khớp dịch vụ.');
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND service=? COLLATE NOCASE AND (sub_service=? COLLATE NOCASE OR sub_service='') ORDER BY length(sub_service) DESC LIMIT 1").get(o.client_user_id,o.service,String(o.sub_service||'')) as Row|undefined;
 const discount=Number(setting?.discount_percent);
 if(!setting?.is_enabled||!Number.isFinite(discount)||discount<0||discount>100)throw Error('Client không có dịch vụ/discount hợp lệ.');
 const netDoc=db.prepare('SELECT * FROM service_v1_price_documents WHERE id=? AND kind=\'NET\'').get(price.source_net_id) as Row|undefined;
 if(!netDoc)throw Error('Không có nguồn Net của Published Price.');
 const netBody=JSON.parse(String(netDoc.body_json)),body=JSON.parse(String(price.body_json));
 const book=finalServiceBook();
 if(netBody.source_excel!==book.source.path)throw Error('Published Price chưa dùng Excel cuối (2).');
 if(kind==='UPS'){
  const cartons=(db.prepare('SELECT * FROM order_cartons WHERE order_id=? ORDER BY id').all(orderId) as Row[]).map(c=>({id:Number(c.id),lot_id:Number(c.order_lot_id),weight:Number(c.weight),length:Number(c.length),width:Number(c.width),height:Number(c.height)}));
  const destination=db.prepare('SELECT china_region FROM vnd_destinations WHERE order_id=?').get(orderId) as {china_region:'SOUTH'|'OTHER'}|undefined;
  if(!cfg.markets.includes(String(o.country).trim().toUpperCase()))throw Error('Quốc gia chưa nằm trong market cấu hình route.');
  const input={route_id:Number(r.id),config_id:Number(config.id),country:String(o.country),china_region:destination?.china_region,sub_service:String(o.sub_service).toUpperCase(),cartons};
  const resolved=upsVndShipment({...input,account_ids:publishedUpsAccountIds(Number(r.id),Number(config.id))});
  if(!Array.isArray(netBody.ups_account_version_ids))throw Error('Published Price chưa có UPS account snapshot.');
  const sellingSource=upsVndShipment({...input,account_ids:netBody.ups_account_version_ids});
  const base=multiplyVnd(sellingSource.net_vnd,addVnd('1',serviceV1DecimalNumber(body.net_markup)));
  const retail=multiplyVnd(base,addVnd('1',serviceV1DecimalNumber(body.base_markup)));
  const selling=multiplyVnd(retail,subtractVnd('1',multiplyVnd(serviceV1DecimalNumber(discount),'0.01')));
  return {...resolved,selling_lots:sellingSource.lots,config_version_id:config.id,price_version_id:price.id,net_version_id:netDoc.id,fx_version_id:null,usd_vnd:null,base_vnd:base,retail_vnd:retail,selling_vnd:selling,total_vnd:selling,discount_percent:discount};
 }
 const expectedRates=book.rates.filter(x=>x.service===kind&&(kind!=='EPACKET_US'||x.market===subKey(String(o.sub_service))));
 const importedRows=netBody.rows as Array<{key:string;net_usd?:number;net_vnd:number}>;
 if(!Array.isArray(importedRows)||importedRows.length!==expectedRates.length||expectedRates.some(x=>{
  const row=importedRows.find(r=>r.key===kind+':'+x.market+':'+x.max_kg);
  return !row||(x.currency==='USD'?row.net_usd:row.net_vnd)!==Number(x.rate);
 }))throw Error('Nội dung Net không khớp Excel cuối (2); cần import đúng nguồn.');
 const cartons=(db.prepare('SELECT * FROM order_cartons WHERE order_id=? ORDER BY id').all(orderId) as Row[]).map(c=>({id:Number(c.id),lot_id:Number(c.order_lot_id),weight:Number(c.weight),length:Number(c.length),width:Number(c.width),height:Number(c.height)}));
 const fx=kind==='EPACKET_US'?currentServiceV1Fx():undefined;
 const resolved=sourceShipmentQuote(book,{service:kind,sub_service:subKey(String(o.sub_service)),country:String(o.country),state:String(o.state),cartons},{fx:fx?serviceV1DecimalNumber(fx.usd_vnd):undefined});
 const published=(body.rows as Array<{key:string;net_vnd:number;net_usd?:number;base_vnd:number;retail_vnd:number;base_vnd_decimal?:string;retail_vnd_decimal?:string}>).find(x=>x.key===resolved.rate_key);
 if(!published)throw Error('Thiếu dòng Published Price cho thị trường/cân.');
 // Published selling stays effective until Publish; latest NET drafts never replace it.
 // USD globals are the approved exception: reapply current FX and the published markups.
 const base=fx?multiplyVnd(resolved.net_vnd,addVnd('1',serviceV1DecimalNumber(body.net_markup))):vnd(published.base_vnd_decimal??String(published.base_vnd));
 const retail=fx?multiplyVnd(base,addVnd('1',serviceV1DecimalNumber(body.base_markup))):vnd(published.retail_vnd_decimal??String(published.retail_vnd));
 const selling=multiplyVnd(retail,subtractVnd('1',multiplyVnd(serviceV1DecimalNumber(discount),'0.01')));
 const country=String(o.country).toUpperCase().trim();
 if(!cfg.markets.includes(country))throw Error('Quốc gia chưa nằm trong market cấu hình route.');
 return {...resolved,config_version_id:config.id,price_version_id:price.id,net_version_id:netDoc.id,fx_version_id:fx?.id??null,usd_vnd:fx?.usd_vnd??null,base_vnd:base,retail_vnd:retail,selling_vnd:selling,total_vnd:addVnd(selling,resolved.surcharge_vnd),discount_percent:discount};
}
