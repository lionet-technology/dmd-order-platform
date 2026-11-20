import {db} from './db';
import {validateOrderEnums} from './enums';
import {vndEpacketDestination} from './vnd-routing';
import {saveOrderShipmentStructure,type ShipmentCartonInput} from './order-shipments';
import {vnd,compareVnd} from './vnd-money';
import {automaticVndOrderQuote,automaticSourceKind} from './service-v1-order-quote';
type Row=Record<string,unknown>;
const fields=['service','sub_service','supplier','recipient_name','address1','address2','city','state','zip','country','phone','recipient_email','item','material'];
export class ServicePriceChoiceRequired extends Error {
 constructor(readonly prices:{offer:string;automatic:string|null;automatic_error:string|null;can_keep:boolean}){
  super('Chọn giá khi xác nhận đổi Service.');
 }
}

export function editVndShipping(order:Row,input:Row){
 const id=Number(order.id),r=db.prepare('SELECT * FROM vnd_purchase_requests WHERE order_id=?').get(id) as Row|undefined;
 if(String(order.tracking||'').trim()||String(order.label||'').trim()||db.prepare('SELECT 1 FROM order_trackings WHERE order_id=?').get(id)||order.purchase_completed_at||order.fulfillment_started_at||['CANCELLED','CLOSED','DELIVERED'].includes(String(order.workflow_status))||r?.status==='CHARGED')throw Error('Edit Order chỉ trước bất kỳ Tracking/Label; dùng Cancel & Duplicate.');
 if(r&&Number(input.expected_revision)!==r.revision)throw Error('Revision đã thay đổi.');
 const patch=(input.shipping??{}) as Row;
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!fields.includes(k)))throw Error('Edit Order chỉ nhận dữ liệu vận chuyển/service.');
 let next={...order,...patch};
 const selected=vndEpacketDestination(Number(order.client_user_id),String(next.service),String(next.sub_service),String(next.supplier),String(next.country));
 next={...next,...selected};
 const enums=validateOrderEnums({service:next.service,sub_service:next.sub_service,supplier:next.supplier,country:next.country});
 next={...next,...enums};
 for(const key of ['recipient_name','address1','city','state','zip','country','phone','item','material'])if(!String(next[key]||'').trim())throw Error('Thiếu dữ liệu: '+key);
 if(r?.status==='CANCELLED')throw Error('Order đã huỷ.');
 const serviceChanged=['service','sub_service','supplier'].some(k=>String(next[k])!==String(order[k]));
 const manual=Boolean((db.prepare('SELECT manual_offer FROM vnd_auto_quotes WHERE order_id=?').get(id) as Row|undefined)?.manual_offer)||String(order.service).toLowerCase()==='chuyên tuyến';
 db.prepare('UPDATE orders SET '+fields.map(k=>k+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...fields.map(k=>String(next[k]??'')),id);
 if(input.china_region!==undefined){
  if(!['SOUTH','OTHER'].includes(String(input.china_region)))throw Error('China region phải SOUTH hoặc OTHER.');
  db.prepare('INSERT INTO vnd_destinations(order_id,china_region) VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET china_region=excluded.china_region').run(id,input.china_region);
 }else if(next.country!==order.country)db.prepare('DELETE FROM vnd_destinations WHERE order_id=?').run(id);
 if(input.cartons){
  const current=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(id) as {snapshot_json:string}|undefined;
  const quote=JSON.parse(current?.snapshot_json??'{}');
  const lotPrices=quote.source==='MANUAL_CUSTOM'?quote.lots as Array<{lot_number:number}>|undefined:undefined;
  const structure=saveOrderShipmentStructure(id,{cartons:input.cartons as ShipmentCartonInput[]},true);
  if(!serviceChanged&&lotPrices?.length){
   const lotNumbers=new Set(structure.cartons.map(carton=>Number(carton.lot_number)));
   if(lotNumbers.size!==lotPrices.length||lotPrices.some(lot=>!lotNumbers.has(lot.lot_number)))
    throw Error('Chuyển giá theo Lot lên Order trước khi thay đổi danh sách Lot.');
  }
 }
 let confirmedAutomatic:string|null=null;
 if(serviceChanged&&r&&manual&&r.offer!==null){
  let automatic:string|null=null,automatic_error:string|null=null;
  if(automaticSourceKind(String(next.service),String(next.sub_service))){
   try{
    const quote=automaticVndOrderQuote(id);
    if(compareVnd(quote.total_vnd,'0')<=0)throw Error('Giá tự động phải lớn hơn 0.');
    automatic=quote.total_vnd;
   }
   catch(error){
    if(error&&typeof error==='object'&&'code' in error)throw error;
    automatic_error=error instanceof Error?error.message:'Không có giá tự động.';
   }
  }else automatic_error='Service yêu cầu báo giá thủ công.';
  const prices={offer:String(r.offer),automatic,automatic_error,can_keep:automatic!==null||String(next.service).toLowerCase()==='chuyên tuyến'};
  if(!['KEEP_OFFER','AUTOMATIC'].includes(String(input.price_selection))||
     input.expected_offer!==prices.offer||input.expected_automatic!==prices.automatic)
   throw new ServicePriceChoiceRequired(prices);
  if(input.price_selection==='AUTOMATIC'?automatic===null:!prices.can_keep)throw Error(automatic_error??'Không có giá tự động.');
  if(input.price_selection==='AUTOMATIC')confirmedAutomatic=automatic;
 }
 if(input.price_selection==='KEEP_OFFER'){
  if(!serviceChanged||!manual||!r||r.offer===null)throw Error('Order không có offer để giữ khi đổi Service.');
  db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json,manual_offer) VALUES (?,'{}',1) ON CONFLICT(order_id) DO UPDATE SET manual_offer=1,pricing_error=NULL,snapshot_json='{}'").run(id);
  db.prepare("UPDATE vnd_purchase_requests SET revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED',accepted_revision=NULL WHERE order_id=?").run(id);
 }else if(input.price_selection==='NEW_OFFER'&&serviceChanged){
  const amount=vnd(String(input.amount));
  if(compareVnd(amount,'0')<=0)throw Error('Offer mới phải dương.');
  if(r)db.prepare("UPDATE vnd_purchase_requests SET offer=?,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED',accepted_revision=NULL WHERE order_id=?").run(amount,id);
  db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json,manual_offer) VALUES (?,'{}',1) ON CONFLICT(order_id) DO UPDATE SET manual_offer=1,pricing_error=NULL,snapshot_json=CASE WHEN ? THEN '{}' ELSE snapshot_json END").run(id,serviceChanged?1:0);
 }else if(serviceChanged&&r){
  if(String(next.service).toLowerCase()==='chuyên tuyến'){
   db.prepare('DELETE FROM vnd_auto_quotes WHERE order_id=?').run(id);
   db.prepare("UPDATE vnd_purchase_requests SET offer=NULL,accepted_revision=NULL,revision=revision+1,status='AWAITING_QUOTE' WHERE order_id=?").run(id);
  }else{
   db.prepare('UPDATE vnd_auto_quotes SET manual_offer=0,pricing_error=NULL WHERE order_id=?').run(id);
   db.prepare("UPDATE vnd_purchase_requests SET offer=COALESCE(?,offer),accepted_revision=NULL,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(confirmedAutomatic,id);
  }
 }
 // Reserve is intentionally retained; caller refreshes quote/consent before swapping it.
 return {serviceChanged,price_selection:input.price_selection,confirmed_automatic:confirmedAutomatic,reason:input.reason,before:order,after:db.prepare('SELECT * FROM orders WHERE id=?').get(id)};
}
