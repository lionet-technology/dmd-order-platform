import {db} from "./db";
import type {AuthUser} from "./auth";
import {logInternalEvent,publishPublicNote} from "./order-audit";
import {normalizeTracking} from "./order-operations";
import {assertRouteCartons} from "./carton-policy";

type Row=Record<string,unknown>;
type NewTracking={old_tracking_id:number;new_tracking:string;new_label_url:string};
export function emergencySwitchOrder(actor:AuthUser,holdId:number,orderId:number,newRouteId:number,trackings:NewTracking[],estimatedNetCost?:unknown){
 if(actor.role!=="ADMIN")throw Error("Chỉ Admin được chuyển Emergency Route.");
 return db.transaction(()=>{
  const item=db.prepare(`SELECT i.*,h.route_id,h.undone_at,h.reason hold_reason
   FROM emergency_hold_orders i JOIN emergency_route_holds h ON h.id=i.hold_id
   WHERE i.hold_id=? AND i.order_id=?`).get(holdId,orderId) as Row|undefined;
  if(!item)throw Error("Order không thuộc Emergency Hold.");
  if(item.resolved_at){
   const current=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Row|undefined;
   const original=db.prepare("SELECT old_tracking_id,new_tracking_id FROM emergency_switch_cost_pending WHERE hold_id=? AND order_id=?").all(holdId,orderId) as Row[];
   const byOld=new Map(original.map(x=>[Number(x.old_tracking_id),Number(x.new_tracking_id)]));
   const sameRoute=current&&db.prepare("SELECT id FROM service_route_configs WHERE id=? AND service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE").get(newRouteId,current.service,current.sub_service,current.supplier);
   const sameTrackings=Array.isArray(trackings)&&trackings.length===original.length&&trackings.every(t=>{
    const id=byOld.get(Number(t.old_tracking_id));if(!id)return false;
    const existing=db.prepare("SELECT tracking,label_url,status FROM order_trackings WHERE id=?").get(id) as Row|undefined;
    return existing?.status==="ACTIVE"&&normalizeTracking(existing.tracking)===normalizeTracking(t.new_tracking)&&String(existing.label_url||"")===String(t.new_label_url||"").trim();
   });
   const sameEstimate=estimatedNetCost===undefined||estimatedNetCost===null||String(estimatedNetCost).trim()===""||Number(current?.est_net_cost)===Number(estimatedNetCost);
   if(sameRoute&&sameTrackings&&sameEstimate)return {order_id:orderId,hold_id:holdId,route_id:newRouteId,updated_trackings:0,original_price:Number(current?.total_due),replayed:true};
   throw Error("Order đã được chuyển Route với thông tin khác; không thể ghi đè.");
  }
  if(item.undone_at)throw Error("Emergency Hold đã đóng, không được chuyển Route.");
  const before=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Row;
  if(!before||before.workflow_status!=="HOLD")throw Error("Order không còn ở trạng thái Emergency Hold.");
  const origin=JSON.parse(String(item.snapshot_json)) as Row;
  if([before.service,before.sub_service,before.supplier].some((v,i)=>String(v||"").toLowerCase()!==String([origin.service,origin.sub_service,origin.supplier][i]||"").toLowerCase()))throw Error("Route gốc đã thay đổi; cần kiểm tra.");
  const newRoute=db.prepare("SELECT * FROM service_route_configs WHERE id=? AND active=1 AND warehouse_hold=0").get(newRouteId) as Row|undefined;
  if(!newRoute||newRouteId===Number(item.route_id))throw Error("Route mới phải Active, không Hold và khác Route cũ.");
  assertRouteCartons(newRoute.service,newRoute.max_cartons_per_order,before.carton_count);
  if(db.prepare("SELECT id FROM manifest_carton_items WHERE order_id=? LIMIT 1").get(orderId))
   throw Error("Order đã vào thùng Manifest: kho phải bốc ra và xác minh trước khi đổi Route.");
  if(db.prepare(`SELECT 1 FROM order_trackings WHERE order_id=? AND
   (delivered_at IS NOT NULL OR COALESCE(shipment_status,'')<>'WAITING_HANDOVER') LIMIT 1`).get(orderId))
   throw Error("Tracking có bằng chứng đã bàn giao; phải xử lý ngoại lệ thủ công.");
  if(before.fulfillment_started_at)throw Error("Order đã bắt đầu fulfilment.");
  if(db.prepare("SELECT id FROM order_events WHERE order_id=? AND event_type='SHIPMENT_STATUS_UPDATED' LIMIT 1").get(orderId))
   throw Error("Order có lịch sử Shipment Status; cần xử lý ngoại lệ thủ công.");
  const previous=db.prepare("SELECT * FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id").all(orderId) as Row[];
  if(!Array.isArray(trackings)||trackings.length!==previous.length)throw Error("Phải khai báo đầy đủ Tracking mới theo từng Carton/Tracking đang Active.");
  const mapping=new Map(trackings.map(t=>[Number(t.old_tracking_id),t]));
  if(mapping.size!==previous.length)throw Error("Tracking cũ bị trùng trong file.");
  for(const old of previous){
   const item=mapping.get(Number(old.id));
   if(!item)throw Error("Thiếu Tracking thay thế cho "+old.tracking);
   const normalized=normalizeTracking(item.new_tracking);
   if(!normalized||!String(item.new_label_url||"").trim())throw Error("Tracking/Label mới bắt buộc.");
   const label=String(item.new_label_url).trim();
   if(!(label.startsWith("https://")||label.startsWith("http://")||(label.startsWith("/")&&!label.startsWith("//"))))throw Error("URL Label phải là HTTP(S) hoặc đường dẫn nội bộ hợp lệ.");
   if(db.prepare("SELECT id FROM order_trackings WHERE normalized_tracking=?").get(normalized))throw Error("Tracking mới đã tồn tại: "+item.new_tracking);
  }
  if(new Set(trackings.map(t=>normalizeTracking(t.new_tracking))).size!==trackings.length)throw Error("Tracking mới trùng trong batch.");
  const hasEstimate=estimatedNetCost!==undefined&&estimatedNetCost!==null&&String(estimatedNetCost).trim()!=="";
  const estimate=Number(estimatedNetCost);
  if(hasEstimate&&(!Number.isFinite(estimate)||estimate<0||Math.round(estimate*100)/100!==estimate))throw Error("Estimated Net Cost phải là số USD hợp lệ tối đa hai chữ số thập phân.");
  const ledgerBefore=db.prepare("SELECT COUNT(*) n FROM ledger_entries").get() as {n:number};
  const originalDue=Number(before.total_due);
  // Context is inserted and removed inside one IMMEDIATE transaction. Held order/Tracking
  // DB guards allow only this server-owned, audited financial-neutral operation.
  db.prepare("INSERT INTO emergency_route_switch_context(order_id) VALUES (?)").run(orderId);
  db.prepare(`UPDATE orders SET service=?,sub_service=?,supplier=?,
    est_net_cost=CASE WHEN ?=1 THEN ? ELSE est_net_cost END,
    updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
   .run(newRoute.service,newRoute.sub_service,newRoute.supplier,hasEstimate?1:0,hasEstimate?estimate:0,actor.id,orderId);
  const changed=[];
  for(const old of previous){
   const incoming=mapping.get(Number(old.id))!;
   const normalized=normalizeTracking(incoming.new_tracking);
   const inserted=db.prepare(`INSERT INTO order_trackings
    (order_id,lot_number,carton_id,tracking,normalized_tracking,label_url,status,is_primary,cost_match_type,cost_parent_tracking_id,created_by_user_id)
    VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?,?)`).run(orderId,old.lot_number,old.carton_id,String(incoming.new_tracking).trim(),normalized,String(incoming.new_label_url).trim(),old.is_primary,'UNKNOWN',null,actor.id);
   const fresh=Number(inserted.lastInsertRowid);
   db.prepare("INSERT INTO emergency_switch_cost_pending(new_tracking_id,old_tracking_id,order_id,lot_number,hold_id,old_supplier,new_supplier) VALUES (?,?,?,?,?,?,?)")
    .run(fresh,old.id,orderId,old.lot_number,holdId,String(before.supplier||""),String(newRoute.supplier||""));
   db.prepare("UPDATE order_trackings SET status='REPLACED',is_primary=0,replaced_by_tracking_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(fresh,old.id);
   db.prepare("UPDATE order_trackings SET cost_parent_tracking_id=? WHERE order_id=? AND cost_parent_tracking_id=?").run(fresh,orderId,old.id);
   changed.push({from:old.tracking,to:incoming.new_tracking,old_tracking_id:old.id,new_tracking_id:fresh});
  }
  const primary=db.prepare("SELECT tracking,label_url FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY is_primary DESC,lot_number,id LIMIT 1").get(orderId) as {tracking:string;label_url:string}|undefined;
  db.prepare("UPDATE orders SET tracking=?,label=?,workflow_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(primary?.tracking||null,primary?.label_url||null,origin.workflow_status,orderId);
  db.prepare("UPDATE emergency_hold_orders SET resolved_at=CURRENT_TIMESTAMP WHERE hold_id=? AND order_id=?").run(holdId,orderId);
  db.prepare("DELETE FROM emergency_route_switch_context WHERE order_id=?").run(orderId);
  const after=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Row;
  if(Number(after.total_due)!==originalDue||String(after.order_id)!==String(before.order_id)||String(after.system_order_code)!==String(before.system_order_code))
   throw Error("Emergency Switch thay đổi định danh hoặc giá bán, đã rollback.");
  const ledgerAfter=db.prepare("SELECT COUNT(*) n FROM ledger_entries").get() as {n:number};
  if(ledgerAfter.n!==ledgerBefore.n)throw Error("Emergency Switch không được ghi Ledger.");
  logInternalEvent({orderId,eventType:"EMERGENCY_ROUTE_SWITCH",summary:"Chuyển Route do Emergency Hold; giá bán và Balance không đổi.",actorId:actor.id,before:{route:[before.service,before.sub_service,before.supplier],estimated_net_cost:before.est_net_cost,trackings:previous},after:{route:[newRoute.service,newRoute.sub_service,newRoute.supplier],estimated_net_cost:after.est_net_cost,trackings:changed,hold_id:holdId}});
  publishPublicNote({orderId,eventType:"TRACKING_LABEL_CHANGED",summary:"DMD đã thay đổi Tracking/Label do điều chỉnh tuyến vận chuyển; giá bán Order không đổi.",actorId:actor.id,publicData:{hold_id:holdId,route_changed:true}});
  return {order_id:orderId,hold_id:holdId,route_id:newRouteId,updated_trackings:changed.length,original_price:originalDue};
 }).immediate();
}
