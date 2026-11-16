import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {addVnd,multiplyVnd,sumVnd,compareVnd,vnd} from './vnd-money';
import {upsLotBillable,upsSubServiceRounding,UPS_V1_ACCOUNT_PRIORITY} from './ups-v1-calculator';
type Rate={service:string;market:string;max_kg:string;rate:string;currency:string;cell:string};
type UpsRate={sub_service:string;account:string;zone:string;min_kg:string;max_kg:string;unit:string;rate:string|null;cell:string};
type Market={country:string;market:string;cell:string};
type Book={source:{path:string;sha256:string};rates:Rate[];epacket_markets:Market[];yun_markets:Market[];ups_rates:UpsRate[];ups_zones:Array<{code:string;country:string;zone:string;cell:string}>;ups_weight_surcharges:Array<{account:string;zone:string;rate:string;discount:string;cell:string}>;markups:Record<string,{net_base:string;base_retail:string}>;epacket_surcharges:{over55_vnd:string;over75_vnd:string;noncont_vnd:string}};
export const FINAL_SOURCE_SHA='a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2';
export function finalServiceBook():Book {
 const data=readFileSync(join(process.cwd(),'docs/data/service-v1/net-cost-final-2.json'),'utf8');
 if(createHash('sha256').update(data).digest('hex')!=='9c1accd230b1ab8f52d724cfc872c43c4fb267ba60ef546563faecaebd314679')throw Error('Dữ liệu import không khớp bản đã kiểm chứng.');
 const book=JSON.parse(data) as Book;
 if(book.source.sha256!==FINAL_SOURCE_SHA||createHash('sha256').update(readFileSync(join(process.cwd(),book.source.path))).digest('hex')!==FINAL_SOURCE_SHA)throw Error('Nguồn giá cuối (2) không khớp checksum.');
 return book;
}
export const normalizeDestination=(s:string)=>s.normalize('NFKC').replace(/[*#+]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
export function sourceMarket(book:Book,kind:'EPACKET_EU'|'YUN',country:string) {
 const key=normalizeDestination(country),rows=(kind==='YUN'?book.yun_markets:book.epacket_markets).filter(r=>normalizeDestination(r.country)===key);
 const markets=[...new Set(rows.map(r=>r.market))];
 if(markets.length!==1)throw Error('Không có mapping quốc gia/thị trường duy nhất trong Excel (2).');
 return {market:markets[0],source_cells:rows.map(r=>r.cell)};
}
export function sourceUpsZone(book:Book,country:string,chinaRegion?:'SOUTH'|'OTHER') {
 const key=normalizeDestination(country);
 // SO is a carrier-specific source code for China South, not an ISO Somalia mapping.
 if(['CN','CHINA'].includes(key)){
  if(!chinaRegion)throw Error('China cần xác định SOUTH hoặc OTHER trước tra zone; không suy đoán từ CN.');
  return {zone:chinaRegion==='SOUTH'?'10':'3',source_cells:[chinaRegion==='SOUTH'?'G261':'A189']};
 }
 const rows=book.ups_zones.filter(r=>normalizeDestination(r.code)===key||normalizeDestination(r.country)===key);
 const zones=[...new Set(rows.map(r=>r.zone))];
 if(zones.length!==1)throw Error('Không có mapping quốc gia/UPS zone duy nhất trong Excel (2).');
 return {zone:zones[0],source_cells:rows.map(r=>r.cell)};
}
type Carton={id:number;lot_id:number;weight:number;length:number;width:number;height:number};
export type SourceShipment={service:'EPACKET_US'|'EPACKET_EU'|'YUN'|'UPS';sub_service:string;country:string;state:string;cartons:Carton[];china_region?:'SOUTH'|'OTHER'};
export type SourceGlobals={fx?:string;fuel?:string;vat?:string;us_broker?:string;customs_per_kg_vnd?:string};
const onePlus=(x:string)=>addVnd('1',x);
function positive(x:number){if(!Number.isFinite(x)||x<=0)throw Error('Cần cân và đủ ba kích thước carton dương.');return x;}
export function sourceShipmentQuote(book:Book,input:SourceShipment,globals:SourceGlobals) {
 if(!input.cartons.length||new Set(input.cartons.map(c=>c.id)).size!==input.cartons.length)throw Error('Thiếu hoặc trùng carton.');
 for(const c of input.cartons)for(const x of [c.weight,c.length,c.width,c.height])positive(x);
 const surcharge:Array<{kind:string;amount:string}>=[];
 let net:string,market:string,rate_key:string;
 const lots:unknown[]=[];
 if(input.service==='UPS'){
  const zone=sourceUpsZone(book,input.country,input.china_region);market=zone.zone;rate_key='UPS:'+input.sub_service;
  for(const key of ['fuel','vat','us_broker','customs_per_kg_vnd'] as const)if(globals[key]===undefined||compareVnd(globals[key]!,'0')<0)throw Error('Chưa có UPS globals đã xác nhận.');
  const ids=[...new Set(input.cartons.map(c=>c.lot_id))];const nets:string[]=[];
  for(const id of ids){
   if(!Number.isSafeInteger(id)||id<=0)throw Error('Carton chưa được gán Lot.');
   const weight=upsLotBillable(input.cartons.filter(c=>c.lot_id===id).map(c=>({weight_kg:c.weight,length_cm:c.length,width_cm:c.width,height_cm:c.height})),upsSubServiceRounding(input.sub_service)).billable_kg;
   const accounts=[];
   for(const account of UPS_V1_ACCOUNT_PRIORITY){
    const rates=book.ups_rates.filter(r=>r.sub_service===input.sub_service&&r.account===account&&r.zone===market&&weight>Number(r.min_kg)&&weight<=Number(r.max_kg));
    if(rates.length!==1)throw Error('UPS interval thiếu/trùng, không tự bỏ account.');
    const rate=rates[0];if(rate.rate===null)continue;
    const transportation=multiplyVnd(rate.rate,rate.unit==='PER_KG'?String(weight):'1');
    const surges=book.ups_weight_surcharges.filter(r=>r.account===account&&r.zone===market);
    if(surges.length>1)throw Error('Trùng UPS surcharge.');
    const weightFee=surges.length?multiplyVnd(multiplyVnd(surges[0].rate,addVnd('1','-'+surges[0].discount)),String(weight)):'0';
    const total=addVnd(addVnd(multiplyVnd(multiplyVnd(onePlus(globals.fuel!),onePlus(globals.vat!)),addVnd(transportation,weightFee)),multiplyVnd(globals.us_broker!,transportation)),multiplyVnd(globals.customs_per_kg_vnd!,String(weight)));
    accounts.push({account,net_vnd:total,weight_kg:weight,rate,weight_surcharge_vnd:weightFee});
   }
   accounts.sort((a,b)=>compareVnd(a.net_vnd,b.net_vnd)||UPS_V1_ACCOUNT_PRIORITY.indexOf(a.account)-UPS_V1_ACCOUNT_PRIORITY.indexOf(b.account));
   if(!accounts.length)throw Error('Không có giá UPS cho sub-service/zone/cân.');
   lots.push({lot_id:id,...zone,selected:accounts[0],accounts});nets.push(accounts[0].net_vnd);
  }
  net=sumVnd(nets);
 }else{
  if(input.cartons.length!==1)throw Error('ePacket/Yun chỉ một carton mỗi Order.');
  const c=input.cartons[0],weight=Math.max(c.weight,c.length*c.width*c.height/5000);
  market=input.service==='EPACKET_US'?input.sub_service:sourceMarket(book,input.service,input.country).market;
  if(input.service==='EPACKET_US'&&!['US','UNITED STATES','UNITED STATES OF AMERICA','USA'].includes(normalizeDestination(input.country)))throw Error('ePacket US chỉ hỗ trợ US; cần route EU đúng thị trường.');
  const rates=book.rates.filter(r=>r.service===input.service&&r.market===market).sort((a,b)=>Number(a.max_kg)-Number(b.max_kg));
  const rate=rates.find(r=>weight<=Number(r.max_kg));if(!rate)throw Error('Không có giá hoặc vượt max cân nguồn.');
  rate_key=input.service+':'+market+':'+rate.max_kg;
  if(rate.currency==='USD'&&(!globals.fx||compareVnd(globals.fx,'0')<=0))throw Error('Chưa xác nhận tỷ giá.');
  net=multiplyVnd(rate.rate,rate.currency==='USD'?globals.fx!:'1');
  lots.push({lot_id:c.lot_id,weight_kg:weight,rate});
  if(input.service==='EPACKET_US'){
   const longest=Math.max(c.length,c.width,c.height);
   if(longest>55)surcharge.push({kind:'OVERSIZE',amount:longest>75?book.epacket_surcharges.over75_vnd:book.epacket_surcharges.over55_vnd});
   const state=normalizeDestination(input.state).replace(/[^A-Z0-9]/g,'');
   if(['AK','ALASKA','HI','HAWAII','PR','PUERTORICO','GU','GUAM','VI','VIRGINISLANDS','USVIRGINISLANDS','AS','AMERICANSAMOA','MP','NORTHERNMARIANAISLANDS','AA','AE','AP','ARMEDFORCESAMERICAS','ARMEDFORCESEUROPE','ARMEDFORCESPACIFIC','APO','FPO','DPO'].includes(state))surcharge.push({kind:'NON_CONT',amount:book.epacket_surcharges.noncont_vnd});
  }
 }
 return {source_sha256:book.source.sha256,market,rate_key,net_vnd:vnd(net),lots,surcharges:surcharge,surcharge_vnd:sumVnd(surcharge.map(s=>s.amount))};
}
