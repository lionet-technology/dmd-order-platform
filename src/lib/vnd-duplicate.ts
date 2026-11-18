import {db} from './db';
import {upsertOrder,type OrderInput} from './finance';
import {cancelOrder} from './order-cancellation';
import {getOrderShipmentStructure,saveOrderShipmentStructure,type ShipmentCartonInput} from './order-shipments';
import type {AuthUser} from './auth';
type Row=Record<string,unknown>;
export function duplicateVndOrder(o:Row,actor:AuthUser,key:string,reason:string,refundPercent?:unknown){
 if(actor.role!=='ADMIN')throw Error('Cancel & Duplicate chỉ Admin.');
 if(o.workflow_status==='CANCELLED')throw Error('Đơn đã huỷ; dùng lại đúng request key của thao tác Duplicate.');
 const replacementCode=String(o.order_id)+'-R-'+key;
 if(db.prepare('SELECT 1 FROM orders WHERE client_user_id=? AND order_id=?').get(o.client_user_id,replacementCode))throw Error('Mã Order thay thế đã tồn tại; cần tạo Order mới.');
 const data=getOrderShipmentStructure(Number(o.id));
 cancelOrder(Number(o.id),actor,{reason,refund_percent:refundPercent});
 const keys=['service','sub_service','supplier','country','state','recipient_name','address1','address2','city','zip','phone','recipient_email','item','material','declared_value','weight','length','width','height','volume','carton_count'] as const;
 const copy=Object.fromEntries(keys.map(k=>[k,o[k]])) as OrderInput;
 const created=upsertOrder({...copy,client_user_id:Number(o.client_user_id),order_id:replacementCode},{createOnly:true}) as Row;
 const id=Number(created.id);
 const cartons=data.cartons.map(c=>({carton_number:Number(c.carton_number),lot_number:Number(data.lots.find(l=>l.id===c.order_lot_id)?.lot_number||1),weight:Number(c.weight),length:Number(c.length),width:Number(c.width),height:Number(c.height),items:data.allocations.filter(a=>a.carton_id===c.id).map(a=>({sku:String(a.sku),description:String(a.description),material:String(a.material||''),quantity:Number(a.quantity),unit_manufacturing_value:a.unit_manufacturing_value===null?null:Number(a.unit_manufacturing_value),currency:String(a.currency)}))})) as ShipmentCartonInput[];
 saveOrderShipmentStructure(id,{cartons});
 db.prepare('INSERT INTO vnd_destinations(order_id,china_region) SELECT ?,china_region FROM vnd_destinations WHERE order_id=?').run(id,o.id);
 db.prepare('INSERT INTO vnd_replacements(source_order_id,replacement_order_id,actor_id) VALUES (?,?,?)').run(o.id,id,actor.id);
 db.prepare("UPDATE orders SET workflow_status='PENDING_PURCHASE',service_purchased_at=CURRENT_TIMESTAMP,created_by_user_id=?,updated_by_user_id=? WHERE id=?").run(actor.id,actor.id,id);
 db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,confirmed_at,request_actor_id) VALUES (?,?,'AWAITING_QUOTE',?,?)").run(id,o.client_user_id,new Date().toISOString(),actor.id);
 return id;
}
