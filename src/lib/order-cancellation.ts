import {readCancellationRules} from "./cancellation-config";
import {canCancelOrder} from "./order-transition-guards";
import {orderChargedCents,orderRefundedCents} from "./order-refunds";
import "./cases";
import { db } from "./db";
import { canAccessClient,getClientAccount,type AuthUser } from "./auth";
import { recomputeOrderFinancials } from "./order-operations";
import { logInternalEvent,publishPublicNote } from "./order-audit";

db.exec("CREATE TABLE IF NOT EXISTS cancellation_requests(order_id INTEGER PRIMARY KEY REFERENCES orders(id),requested_by INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_by INTEGER REFERENCES users(id))");

// Retain old requests without automatically moving money at startup.
db.transaction(()=>{
 db.prepare("INSERT INTO order_events(order_id,event_type,summary,before_json,after_json) SELECT order_id,'CANCELLATION_POLICY_MIGRATED','Yêu cầu huỷ cũ cần kiểm tra lại Supplier policy; không phát sinh hoàn tiền.',?,? FROM cancellation_requests WHERE status='PENDING'").run(JSON.stringify({status:"PENDING"}),JSON.stringify({status:"POLICY_RECHECK"}));
 db.prepare("UPDATE cancellation_requests SET status='POLICY_RECHECK' WHERE status='PENDING'").run();
}).immediate();

type Order=Record<string,unknown>&{id:number};
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export class CancellationError extends Error {
  constructor(message:string,public status=409){super(message)}
}
function chargedOrderAmount(orderId:number){
 return orderChargedCents(orderId)/100;
}
export function cancellationPolicy(order:Order){
  if(order.workflow_status==="CANCELLED")return {allowed:false,reason:"Đơn đã huỷ.",refund_percent:Number(order.cancellation_refund_percent||0),refund_amount:Number(order.cancellation_refund_amount||0)};
  const guard=canCancelOrder({...order,fulfillment_started_at:null});if(!guard.allowed)return {...guard,refund_percent:0,refund_amount:0};
  if(/cargo/i.test(String(order.service||"")+" "+String(order.sub_service||"")))return {allowed:false,reason:"Dịch vụ Cargo cần quy trình huỷ riêng; chưa hỗ trợ huỷ tự động.",refund_percent:0,refund_amount:0};
  const trackings=db.prepare("SELECT shipment_status,delivered_at FROM order_trackings WHERE order_id=?").all(order.id) as Array<{shipment_status:string;delivered_at:string|null}>;
  // Preserve the carrier handover boundary even if a tracking is replaced or its current status is reset.
  const history=db.prepare("SELECT after_json FROM order_events WHERE order_id=? AND event_type='SHIPMENT_STATUS_UPDATED'").all(order.id) as Array<{after_json:string|null}>;
  const delivered=trackings.some(row=>Boolean(row.delivered_at)||row.shipment_status==="DELIVERED")||history.some(row=>{try{return JSON.parse(row.after_json||"{}").shipment_status==="DELIVERED"}catch{return false}});
  if(delivered)return {allowed:false,reason:"Đơn đã giao; không thể huỷ.",refund_percent:0,refund_amount:0};
  const moved=Boolean(order.fulfillment_started_at)||trackings.some(row=>Boolean(row.delivered_at)||String(row.shipment_status||"WAITING_HANDOVER")!=="WAITING_HANDOVER")||history.some(row=>{
    try {const status=JSON.parse(row.after_json||"{}").shipment_status;return Boolean(status)&&status!=="WAITING_HANDOVER"}catch{return true}
  });
  const issued=trackings.length>0||Boolean(String(order.tracking||"").trim())||Boolean(String(order.label||"").trim())||Boolean(order.purchase_completed_at)||order.workflow_status==="PURCHASED";
  const route=db.prepare("SELECT id FROM service_route_configs WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE").get(String(order.service||""),String(order.sub_service||""),String(order.supplier||"")) as {id:number}|undefined;
  const config=route?readCancellationRules(route.id):null;
  const stage=moved?"SHIPPED":issued?"ISSUED":order.workflow_status==="PURCHASING"?"PURCHASED":"PRE_PURCHASE";
  const rule=config?.rules[stage];
  if(!rule?.allowed)return {allowed:false,reason:"Supplier policy chưa cấu hình hoặc không cho phép huỷ ở trạng thái "+stage+".",refund_percent:0,refund_amount:0};
  const percent=rule.refund_percent;
  const charged=chargedOrderAmount(order.id);
  if(!Number.isFinite(charged)||charged<0)return {allowed:false,reason:"Công nợ của đơn không hợp lệ; cần kiểm tra trước khi huỷ.",refund_percent:0,refund_amount:0};
  const previous=orderRefundedCents(order.id)/100;
  return {allowed:true,reason:"",refund_percent:percent,refund_amount:Math.max(0,Math.min(money(charged-previous),money(charged*percent/100-previous))),route_id:route!.id,policy_version:config!.version,policy_stage:stage,charged_amount:charged,previous_refunds:previous};
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
    const charged=chargedOrderAmount(orderId);
    const retained=Math.max(0,money(charged-policy.refund_amount-(policy.previous_refunds||0)));
    const at=new Date().toISOString();
    db.prepare("UPDATE orders SET workflow_status='CANCELLED',cancelled_at=?,cancelled_by_user_id=?,cancellation_reason=?,cancellation_refund_percent=?,cancellation_refund_amount=?,cancelled_original_due=?,total_due=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(at,user.id,null,policy.refund_percent,policy.refund_amount,charged,retained,user.id,orderId);
    db.prepare("UPDATE purchase_reserves SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'").run(orderId);
    db.prepare("UPDATE cancellation_requests SET status='AUTO_COMPLETED',approved_by=? WHERE order_id=?").run(user.id,orderId);
    // Cancel only in-app tracking availability. Carrier labels need separate supplier processing.
    db.prepare("UPDATE order_trackings SET status='CANCELLED',is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='ACTIVE'").run(orderId);
    if(policy.refund_amount>0)db.prepare("INSERT INTO ledger_entries(occurred_at,entry_type,direction,amount,customer,client_user_id,reference_type,reference_id,note,created_by_user_id) VALUES (?,'REFUND','CREDIT',?,?,?,'ORDER_CANCELLATION',?,?,?)")
      .run(at,policy.refund_amount,order.customer||null,order.client_user_id||null,String(orderId),"Hoàn "+policy.refund_percent+"% khi huỷ "+String(order.system_order_code||order.order_id||orderId),user.id);
    recomputeOrderFinancials(orderId);
    const summary="Đơn hàng đã được huỷ theo Supplier policy. Hoàn "+policy.refund_percent+"%: $"+policy.refund_amount.toFixed(2)+".";
    publishPublicNote({orderId,eventType:"REFUND",summary,actorId:user.id,publicData:{amount:policy.refund_amount,currency:"USD",reason:"ORDER_CANCELLATION",refund_percent:policy.refund_percent}});
    logInternalEvent({orderId,eventType:"ORDER_CANCELLED",summary:"Đơn hàng đã được huỷ.",actorId:user.id,before:{workflow_status:order.workflow_status,total_due:order.total_due},after:{workflow_status:"CANCELLED",refund_percent:policy.refund_percent,refund_amount:policy.refund_amount,retained_amount:retained,route_id:policy.route_id,policy_version:policy.policy_version,policy_stage:policy.policy_stage,previous_refunds:policy.previous_refunds}});
    return {cancelled:true,already_cancelled:false,refund_percent:policy.refund_percent,refund_amount:policy.refund_amount,retained_amount:retained};
  }).immediate();
}
