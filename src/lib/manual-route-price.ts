import {db} from './db';
import {completeReserve,audit} from './credit';
import {assertRouteCartons} from './carton-policy';
import {logOrderEvent} from './order-audit';
import {canPurchase} from './order-transition-guards';
import {hasCaseHold} from './cases';

/** One approved customer total per Order; never a per-carton or Supplier Net amount. */
export function isManualPriceRoute(service:unknown){return /^(UPS|Chuyên tuyến)$/i.test(String(service??'').trim());}
export function setManualOrderPrice(orderId:number,amount:unknown,actorId:number){
 return db.transaction(()=>{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as Record<string,unknown>|undefined;
  if(!order||!isManualPriceRoute(order.service))throw Error('Route không hỗ trợ giá thủ công.');
  const purchasing=canPurchase(order);
  if((!purchasing.allowed&&!['PURCHASED','RECONCILED'].includes(String(order.workflow_status)))||!order.service_purchased_at)throw Error('Client chưa gửi yêu cầu mua hoặc Order không được phép cấp dịch vụ.');
  if(hasCaseHold(orderId)||db.prepare('SELECT id FROM warehouse_order_holds WHERE order_id=? AND released_at IS NULL').get(orderId))throw Error('Order đang Hold, không được cấp Tracking/Label.');
  const max=db.prepare('SELECT max_cartons_per_order FROM service_route_configs WHERE lower(service)=lower(?) AND lower(sub_service)=lower(?) AND lower(supplier)=lower(?) AND active=1').get(order.service,order.sub_service,order.supplier) as {max_cartons_per_order:number}|undefined;
  if(!max)throw Error('Route chưa được cấu hình active.');
  if((db.prepare('SELECT warehouse_hold FROM service_route_configs WHERE lower(service)=lower(?) AND lower(sub_service)=lower(?) AND lower(supplier)=lower(?) AND active=1').get(order.service,order.sub_service,order.supplier) as {warehouse_hold:number}|undefined)?.warehouse_hold)throw Error('Route đang Hold.');
  assertRouteCartons(order.service,max.max_cartons_per_order,order.carton_count);
  const value=Number(amount),cents=Math.round(value*100);
  if(!Number.isFinite(value)||!Number.isSafeInteger(cents)||cents<=0||Math.abs(value*100-cents)>0.000001)throw Error('Giá bán thủ công toàn Order phải lớn hơn 0, tối đa hai chữ số thập phân.');
  const price=Number((cents/100).toFixed(2));
  const existing=db.prepare("SELECT id FROM order_trackings WHERE order_id=? LIMIT 1").get(orderId);
  const reserve=db.prepare('SELECT status,amount_cents FROM purchase_reserves WHERE order_id=?').get(orderId) as {status:string;amount_cents:number}|undefined;
  if(order.pricing_snapshot_json){if(Number(order.total_due)===price)return price;throw Error('Đã khóa giá; dùng điều chỉnh riêng.');}
  if(reserve&&reserve.status!=='FAILED')throw Error('Reserve không có giá chốt; cần đối chiếu.');
  if(!order.client_user_id)throw Error('Order chưa có Client để ghi nhận tiền.');
  db.prepare("INSERT INTO purchase_reserves(order_id,client_id,amount_cents,status,actor_id) VALUES (?,?,?,'RESERVED',?) ON CONFLICT(order_id) DO UPDATE SET amount_cents=excluded.amount_cents,status='RESERVED',actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(orderId,order.client_user_id,cents,actorId);
  audit(Number(order.client_user_id),actorId,'MANUAL_PRICE_RESERVED',{orderId,amount_cents:cents,after_tracking:Boolean(existing)});
  const snapshot={manual:true,eligible:true,reasons:[],currency:'USD',total_charge:price,sale_price:price,surcharge:0,surcharge_breakdown:[],discount_percent:0,chargeable_weight:0,volumetric_weight:0,tier:null};
  db.prepare("UPDATE orders SET total_due=?,sales_price=?,pricing_snapshot_json=?,auto_pricing=0,service_purchased_at=COALESCE(service_purchased_at,?),workflow_status=CASE WHEN purchase_completed_at IS NOT NULL THEN workflow_status WHEN tracking IS NOT NULL THEN 'PURCHASING' ELSE 'PENDING_PURCHASE' END,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(price,price,JSON.stringify(snapshot),new Date().toISOString(),actorId,orderId);
  if(db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND status='ACTIVE' AND TRIM(COALESCE(label_url,''))<>'' LIMIT 1").get(orderId))completeReserve(orderId,actorId);
  logOrderEvent({orderId,eventType:'MANUAL_PRICE_CONFIRMED',summary:'Admin chốt giá bán thủ công toàn Order: '+price.toFixed(2)+' USD.',actorId,after:{total_due:price,currency:'USD'}});
  return price;
 }).immediate();
}
