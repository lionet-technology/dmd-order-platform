import {db} from "./db";
import type {AuthUser} from "./auth";
import {logInternalEvent} from "./order-audit";

type Row=Record<string,unknown>;
// Durable REMOVE audit preserves exported membership even after warehouse unpacks it.
export function hasExportedManifestHistory(orderId:number){
 return !!db.prepare(`SELECT 1 FROM manifest_carton_items mi
 JOIN manifest_cartons mc ON mc.id=mi.manifest_carton_id
 WHERE mi.order_id=? AND (mc.exported_at IS NOT NULL OR EXISTS(
 SELECT 1 FROM manifest_carton_events e WHERE e.manifest_carton_id=mc.id AND e.action='EXPORT'))
 UNION ALL
 SELECT 1 FROM manifest_carton_events removed
 WHERE removed.action='REMOVE' AND json_valid(removed.details_json)
 AND json_extract(removed.details_json,'$.order_id')=?
 AND EXISTS(SELECT 1 FROM manifest_carton_events exported
 WHERE exported.manifest_carton_id=removed.manifest_carton_id AND exported.action='EXPORT' AND exported.id<removed.id)
 LIMIT 1`).get(orderId,orderId);
}
export function hasShipmentMovement(orderId:number){
 const tracks=db.prepare("SELECT shipment_status,delivered_at FROM order_trackings WHERE order_id=?").all(orderId) as Row[];
 if(tracks.some(t=>t.delivered_at||String(t.shipment_status||"")!=="WAITING_HANDOVER"))return true;
 const events=db.prepare("SELECT after_json FROM order_events WHERE order_id=? AND event_type='SHIPMENT_STATUS_UPDATED'").all(orderId) as Row[];
 return events.some(e=>{try{const s=JSON.parse(String(e.after_json||"{}")).shipment_status;return !s||s!=="WAITING_HANDOVER";}catch{return true;}});
}
function admin(user:AuthUser){if(user.role!=="ADMIN")throw Error("Emergency Hold chỉ dành cho Admin.");}
export function emergencyStatus(user:AuthUser,routeId:number){
 admin(user);
 return db.prepare("SELECT * FROM emergency_route_holds WHERE route_id=? ORDER BY id DESC").all(routeId);
}
export function startEmergencyHold(user:AuthUser,routeId:number,reason:string){
 admin(user);if(!reason?.trim())throw Error("Cần lý do Emergency Hold.");
 return db.transaction(()=>{
 const existing=db.prepare("SELECT * FROM emergency_route_holds WHERE route_id=? AND undone_at IS NULL").get(routeId) as Row|undefined;
 if(existing)return existing;
 const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(routeId) as Row|undefined;
 if(!route)throw Error("Không tìm thấy route.");
 const orders=db.prepare("SELECT * FROM orders WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE AND workflow_status NOT IN ('CANCELLED','DELIVERED','CLOSED')").all(route.service,route.sub_service,route.supplier) as Row[];
 // Never infer handoff from ETD. Any historical movement, including replaced labels,
 // makes an order ineligible. Malformed movement evidence fails closed.
 const eligible=orders.filter(o=>{
 if(o.fulfillment_started_at)return false;
 // A manifest export is the operational handoff boundary. This is an order-level hold:
 // if any carton was exported, the entire order needs manual exception handling.
 if(hasExportedManifestHistory(Number(o.id)))return false;
 return !hasShipmentMovement(Number(o.id));
 });
 db.prepare("UPDATE service_route_configs SET warehouse_hold=1 WHERE id=?").run(routeId);
 const id=Number(db.prepare("INSERT INTO emergency_route_holds(route_id,actor_id,reason,prior_warehouse_hold) VALUES (?,?,?,?)").run(routeId,user.id,reason.trim(),route.warehouse_hold||0).lastInsertRowid);
 for(const o of eligible){
 db.prepare("UPDATE orders SET workflow_status='HOLD' WHERE id=?").run(o.id);
 db.prepare("INSERT INTO emergency_hold_orders(hold_id,order_id,snapshot_json) VALUES (?,?,?)").run(id,o.id,JSON.stringify(o));
 logInternalEvent({orderId:Number(o.id),eventType:"EMERGENCY_HOLD",summary:reason.trim(),actorId:user.id,before:o,after:{hold_id:id,workflow_status:"HOLD"}});
 }
 return {id,route_id:routeId,affected:eligible.length,excluded:orders.length-eligible.length};
 }).immediate();
}
export function undoEmergencyHold(user:AuthUser,routeId:number,holdId:number){
 admin(user);
 return db.transaction(()=>{
 const hold=db.prepare("SELECT * FROM emergency_route_holds WHERE id=? AND route_id=?").get(holdId,routeId) as Row|undefined;
 if(!hold)throw Error("Không tìm thấy Emergency Hold.");
 if(hold.undone_at)return {id:holdId,already_undone:true};
 const rows=db.prepare("SELECT * FROM emergency_hold_orders WHERE hold_id=? AND resolved_at IS NULL").all(holdId) as Row[];
 db.prepare("UPDATE emergency_route_holds SET undone_at=CURRENT_TIMESTAMP,undone_by=? WHERE id=?").run(user.id,holdId);
 for(const row of rows){
 const original=JSON.parse(String(row.snapshot_json));
 db.prepare("UPDATE orders SET workflow_status=? WHERE id=?").run(original.workflow_status,row.order_id);
 logInternalEvent({orderId:Number(row.order_id),eventType:"EMERGENCY_HOLD_UNDONE",summary:"Undo Emergency Hold; không thay đổi tiền.",actorId:user.id,after:{hold_id:holdId,workflow_status:original.workflow_status}});
 }
 db.prepare("UPDATE service_route_configs SET warehouse_hold=? WHERE id=?").run(hold.prior_warehouse_hold,routeId);
 return {id:holdId,restored:rows.length};
 }).immediate();
}
export function emergencyHoldDetails(user:AuthUser,routeId:number,holdId:number){
 const originals=exportEmergencyHold(user,routeId,holdId);
 return originals.map(raw=>{
  const current=db.prepare("SELECT id,system_order_code,order_id,service,sub_service,supplier,workflow_status,est_net_cost,total_due,carton_count FROM orders WHERE id=?").get(raw.source_dmd_id) as Row|undefined;
  const trackings=db.prepare(`SELECT t.id old_tracking_id,t.tracking old_tracking,t.label_url old_label,t.lot_number,
     c.carton_number FROM order_trackings t LEFT JOIN order_cartons c ON c.id=t.carton_id
     WHERE t.order_id=? AND t.status='ACTIVE' ORDER BY t.lot_number,c.carton_number,t.id`).all(raw.source_dmd_id);
  return {...raw,current,trackings};
 });
}
export function exportEmergencyHold(user:AuthUser,routeId:number,holdId:number){
 admin(user);
 if(!db.prepare("SELECT id FROM emergency_route_holds WHERE id=? AND route_id=?").get(holdId,routeId))throw Error("Không tìm thấy Emergency Hold.");
 return db.prepare("SELECT order_id,snapshot_json,resolved_at FROM emergency_hold_orders WHERE hold_id=? ORDER BY order_id").all(holdId).map(raw=>{
 const row=raw as Row,o=JSON.parse(String(row.snapshot_json));
 return {source_dmd_id:row.order_id,client_order_id:o.order_id,original_status:o.workflow_status,original_selling_price:o.total_due,source_route_id:routeId,tracking:o.tracking,label:o.label,hold_id:holdId,resolved_at:row.resolved_at,replacement_enabled:true};
 });
}
