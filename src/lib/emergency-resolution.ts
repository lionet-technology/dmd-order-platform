import type {AuthUser} from "./auth";
import {db} from "./db";
import {logInternalEvent} from "./order-audit";
import {cancelOrder} from "./order-cancellation";

export function resolveEmergencyOrder(actor:AuthUser,routeId:number,holdId:number,orderId:number,action:"resume"|"cancel",reason:string){
 if(actor.role!=="ADMIN")throw Error("Chỉ Admin được xử lý Emergency Hold.");
 if(!reason.trim()||reason.length>2000)throw Error("Cần lý do xử lý hợp lệ.");
 const kind=action==="resume"?"RESUME":"CANCEL";
 return db.transaction(()=>{
  const item=db.prepare(`SELECT i.snapshot_json,i.resolved_at,i.resolution_kind,h.undone_at
   FROM emergency_hold_orders i JOIN emergency_route_holds h ON i.hold_id=h.id
   WHERE i.hold_id=? AND i.order_id=? AND h.route_id=?`).get(holdId,orderId,routeId) as
   {snapshot_json:string;resolved_at:string|null;resolution_kind:string|null;undone_at:string|null}|undefined;
  if(!item)throw Error("Order không thuộc Emergency Hold.");
  if(item.resolved_at&&item.resolution_kind===kind)return {order_id:orderId,replayed:true};
  if(item.undone_at||item.resolved_at)throw Error("Order đã được xử lý hoặc Incident đã đóng.");
  const status=JSON.parse(item.snapshot_json).workflow_status as string;
  db.prepare("UPDATE emergency_hold_orders SET resolved_at=CURRENT_TIMESTAMP,resolution_kind=?,last_error=NULL WHERE hold_id=? AND order_id=?").run(kind,holdId,orderId);
  const updated=db.prepare("UPDATE orders SET workflow_status=? WHERE id=? AND workflow_status='HOLD'").run(status,orderId);
  if(updated.changes!==1)throw Error("Order không còn ở trạng thái Emergency Hold.");
  if(action==="cancel")cancelOrder(orderId,actor,{reason:"Admin huỷ Order"});
  logInternalEvent({orderId,eventType:"EMERGENCY_HOLD_"+kind,summary:reason.trim(),actorId:actor.id,
   after:{hold_id:holdId,workflow_status:action==="cancel"?"CANCELLED":status}});
  return {order_id:orderId,replayed:false};
 }).immediate();
}
