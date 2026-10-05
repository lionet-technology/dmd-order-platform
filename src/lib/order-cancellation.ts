import "./credit";
import { db } from "./db";
import { canAccessClient,getClientAccount,type AuthUser } from "./auth";
import { recomputeOrderFinancials } from "./order-operations";
import { logInternalEvent,publishPublicNote } from "./order-audit";

type Order=Record<string,unknown>&{id:number};
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export class CancellationError extends Error {
  constructor(message:string,public status=409){super(message)}
}
export function cancellationPolicy(order:Order){
  if(order.workflow_status==="CANCELLED")return {allowed:false,reason:"Đơn đã huỷ.",refund_percent:Number(order.cancellation_refund_percent||0),refund_amount:Number(order.cancellation_refund_amount||0)};
  if(/cargo/i.test(String(order.service||"")+" "+String(order.sub_service||"")))return {allowed:false,reason:"Dịch vụ Cargo cần quy trình huỷ riêng; chưa hỗ trợ huỷ tự động.",refund_percent:0,refund_amount:0};
  const trackings=db.prepare("SELECT shipment_status,delivered_at FROM order_trackings WHERE order_id=?").all(order.id) as Array<{shipment_status:string;delivered_at:string|null}>;
  // Preserve the carrier handover boundary even if a tracking is replaced or its current status is reset.
  const history=db.prepare("SELECT after_json FROM order_events WHERE order_id=? AND event_type='SHIPMENT_STATUS_UPDATED'").all(order.id) as Array<{after_json:string|null}>;
  const moved=Boolean(order.fulfillment_started_at)||trackings.some(row=>Boolean(row.delivered_at)||String(row.shipment_status||"WAITING_HANDOVER")!=="WAITING_HANDOVER")||history.some(row=>{
    try {const status=JSON.parse(row.after_json||"{}").shipment_status;return Boolean(status)&&status!=="WAITING_HANDOVER"}catch{return true}
  });
  if(moved)return {allowed:false,reason:"Đơn đã được tiếp nhận hoặc bắt đầu vận chuyển; không thể huỷ và không hoàn tiền.",refund_percent:0,refund_amount:0};
  const issued=trackings.length>0||Boolean(String(order.tracking||"").trim())||Boolean(String(order.label||"").trim())||Boolean(order.purchase_completed_at)||order.workflow_status==="PURCHASED";
  const percent=issued?90:100;
  const charged=Number((db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND direction='DEBIT' AND reference_type='ORDER' AND reference_id=?").get(String(order.id)) as {amount:number}).amount);
  if(!Number.isFinite(charged)||charged<0)return {allowed:false,reason:"Công nợ của đơn không hợp lệ; cần kiểm tra trước khi huỷ.",refund_percent:0,refund_amount:0};
  return {allowed:true,reason:"",refund_percent:percent,refund_amount:money(charged*percent/100)};
}
export function cancelOrder(orderId:number,user:AuthUser){
  return db.transaction(()=>{
    const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Order|undefined;
    if(!order)throw new CancellationError("Order không tồn tại.",404);
    if(user.role!=="ADMIN"){
      const client=order.client_user_id?getClientAccount(order.client_user_id):undefined;
      if(!client||!canAccessClient(user,client))throw new CancellationError("Không có quyền huỷ Order này.",403);
    }
    if(order.workflow_status==="CANCELLED")return {cancelled:true,already_cancelled:true,...cancellationPolicy(order)};
    const policy=cancellationPolicy(order);
    if(!policy.allowed)throw new CancellationError(policy.reason);
    const charged=Number((db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND direction='DEBIT' AND reference_type='ORDER' AND reference_id=?").get(String(orderId)) as {amount:number}).amount);
    const retained=money(charged-policy.refund_amount);
    const at=new Date().toISOString();
    db.prepare("UPDATE orders SET workflow_status='CANCELLED',cancelled_at=?,cancelled_by_user_id=?,cancellation_reason=?,cancellation_refund_percent=?,cancellation_refund_amount=?,cancelled_original_due=?,total_due=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(at,user.id,null,policy.refund_percent,policy.refund_amount,charged,retained,user.id,orderId);
    db.prepare("UPDATE purchase_reserves SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'").run(orderId);
    // Cancel only in-app tracking availability. Carrier labels need separate supplier processing.
    db.prepare("UPDATE order_trackings SET status='CANCELLED',is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='ACTIVE'").run(orderId);
    if(policy.refund_amount>0)db.prepare("INSERT INTO ledger_entries(occurred_at,entry_type,direction,amount,customer,client_user_id,reference_type,reference_id,note,created_by_user_id) VALUES (?,'REFUND','CREDIT',?,?,?,'ORDER_CANCELLATION',?,?,?)")
      .run(at,policy.refund_amount,order.customer||null,order.client_user_id||null,String(orderId),"Hoàn "+policy.refund_percent+"% khi huỷ "+String(order.system_order_code||order.order_id||orderId),user.id);
    recomputeOrderFinancials(orderId);
    const summary=policy.refund_percent===90
      ?"Đơn hàng đã được huỷ. Hoàn 90%: $"+policy.refund_amount.toFixed(2)+". Khấu trừ 10% do Tracking/Label đã được cấp."
      :"Đơn hàng đã được huỷ. Hoàn 100%: $"+policy.refund_amount.toFixed(2)+".";
    publishPublicNote({orderId,eventType:"REFUND",summary,actorId:user.id,publicData:{amount:policy.refund_amount,currency:"USD",reason:"ORDER_CANCELLATION",refund_percent:policy.refund_percent}});
    logInternalEvent({orderId,eventType:"ORDER_CANCELLED",summary:"Đơn hàng đã được huỷ.",actorId:user.id,before:{workflow_status:order.workflow_status,total_due:order.total_due},after:{workflow_status:"CANCELLED",refund_percent:policy.refund_percent,refund_amount:policy.refund_amount,retained_amount:retained}});
    return {cancelled:true,already_cancelled:false,refund_percent:policy.refund_percent,refund_amount:policy.refund_amount,retained_amount:retained};
  }).immediate();
}
