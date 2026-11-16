import {db} from './db';
import {validateOrderEnums} from './enums';
import {vndEpacketDestination} from './vnd-routing';
import {saveOrderShipmentStructure,type ShipmentCartonInput} from './order-shipments';
import {vnd,compareVnd} from './vnd-money';
type Row=Record<string,unknown>;
const fields=['service','sub_service','supplier','recipient_name','address1','address2','city','state','zip','country','phone','recipient_email','item','material'];
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
 const serviceChanged=['service','sub_service','supplier'].some(k=>String(next[k])!==String(order[k]));
 const manual=Boolean((db.prepare('SELECT manual_offer FROM vnd_auto_quotes WHERE order_id=?').get(id) as Row|undefined)?.manual_offer)||String(order.service).toLowerCase()==='chuyên tuyến';
 if(serviceChanged&&r&&manual&&!['NEW_OFFER','AUTOMATIC'].includes(String(input.price_selection)))throw Error('Đổi Service sau offer: phải chọn giá mới hoặc dùng giá tự động.');
 if(input.price_selection==='NEW_OFFER'){
  const amount=vnd(String(input.amount));
  if(compareVnd(amount,'0')<=0)throw Error('Offer mới phải dương.');
  if(r)db.prepare("UPDATE vnd_purchase_requests SET offer=?,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED',accepted_revision=NULL WHERE order_id=?").run(amount,id);
  db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json,manual_offer) VALUES (?,'{}',1) ON CONFLICT(order_id) DO UPDATE SET manual_offer=1,pricing_error=NULL").run(id);
 }else if(serviceChanged&&r){
  if(String(next.service).toLowerCase()==='chuyên tuyến')throw Error('Service Manual Quote cần chọn NEW_OFFER.');
  db.prepare('UPDATE vnd_auto_quotes SET manual_offer=0,pricing_error=NULL WHERE order_id=?').run(id);
  db.prepare("UPDATE vnd_purchase_requests SET accepted_revision=NULL,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(id);
 }
 db.prepare('UPDATE orders SET '+fields.map(k=>k+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...fields.map(k=>String(next[k]??'')),id);
 if(input.china_region!==undefined){
  if(!['SOUTH','OTHER'].includes(String(input.china_region)))throw Error('China region phải SOUTH hoặc OTHER.');
  db.prepare('INSERT INTO vnd_destinations(order_id,china_region) VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET china_region=excluded.china_region').run(id,input.china_region);
 }else if(next.country!==order.country)db.prepare('DELETE FROM vnd_destinations WHERE order_id=?').run(id);
 if(input.cartons)saveOrderShipmentStructure(id,{cartons:input.cartons as ShipmentCartonInput[]},true);
 // Reserve is intentionally retained; caller refreshes quote/consent before swapping it.
 return {serviceChanged,before:order,after:db.prepare('SELECT * FROM orders WHERE id=?').get(id)};
}
