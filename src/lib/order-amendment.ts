import {db} from './db';
import {saveOrderShipmentStructure,getOrderShipmentStructure} from './order-shipments';
import {upsertOrder} from './finance';
import {purchaseService} from './route-pricing';
import {isManualPriceRoute,setManualOrderPrice} from './manual-route-price';
import {logOrderEvent} from './order-audit';
import type {AuthUser} from './auth';
type Input=Parameters<typeof upsertOrder>[0];
/** Reprice only an unfulfilled, uncharged reservation, with its original quote in audit. */
export function amendOrderBeforeTracking(input:Input,actor:AuthUser,write?:()=>unknown){
 if(actor.role!=='ADMIN')throw Error('Forbidden');
 return db.transaction(()=>{
 const old=input.id?db.prepare('SELECT * FROM orders WHERE id=?').get(Number(input.id)) as Record<string,unknown>|undefined:undefined;
 if(!old?.pricing_snapshot_json)return write?write():upsertOrder(input);
 const id=Number(old.id),beforeStructure=getOrderShipmentStructure(Number(old.id),false);
 if(db.prepare('SELECT id FROM order_trackings WHERE order_id=? LIMIT 1').get(id)||old.purchase_completed_at||old.fulfillment_started_at)throw Error('Order đã có Tracking hoặc fulfillment; dữ liệu nhạy cảm đã khóa.');
 if(Number(input.client_user_id??old.client_user_id)!==Number(old.client_user_id))throw Error('Không chuyển Client của Order đã reserve.');
 if(db.prepare("SELECT id FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=? AND entry_type IN ('ORDER_CHARGE','PURCHASE_DELTA') LIMIT 1").get(String(id)))throw Error('Order đã charge; cần điều chỉnh riêng.');
 const reserve=db.prepare('SELECT * FROM purchase_reserves WHERE order_id=?').get(id) as Record<string,unknown>|undefined;
 if(!reserve||reserve.status!=='RESERVED')throw Error('Quote / Reserve chưa đối chiếu; không tự sửa.');
 db.prepare('INSERT INTO order_amendment_context(order_id,actor_id) VALUES (?,?)').run(id,actor.id);
 db.prepare("UPDATE purchase_reserves SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(id);
 db.prepare("UPDATE orders SET pricing_snapshot_json=NULL,pricing_version_id=NULL,pricing_config_version_id=NULL WHERE id=?").run(id);
 if(write)write();else upsertOrder(input);
 const updated=db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Record<string,unknown>;
 if(isManualPriceRoute(updated.service))setManualOrderPrice(id,input.total_due??input.sales_price??old.total_due,actor.id);
 else purchaseService(id,actor,true);
 db.prepare('DELETE FROM order_amendment_context WHERE order_id=?').run(id);
 const after=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 logOrderEvent({orderId:id,eventType:'ORDER_AMENDED_BEFORE_TRACKING',summary:'Admin sửa Order trước Tracking và thay Reserve atomically.',actorId:actor.id,before:{order:old,reserve,structure:beforeStructure},after:{order:after,structure:getOrderShipmentStructure(id,false)}});
 return after;
 }).immediate();
}
export function amendShipmentBeforeTracking(orderId:number,input:Parameters<typeof saveOrderShipmentStructure>[1],actor:AuthUser){
 return db.transaction(()=>{
  amendOrderBeforeTracking({id:orderId},actor,()=>saveOrderShipmentStructure(orderId,input));
  return getOrderShipmentStructure(orderId,false);
 }).immediate();
}
