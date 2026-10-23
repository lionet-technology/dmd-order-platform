import {db} from "./db";
import type Database from "better-sqlite3";
import type {AuthUser} from "./auth";
export type RouteState="ACTIVE"|"INACTIVE"|"ARCHIVED"|"DELETED";
type Row=Record<string,unknown>;
export function installRouteLifecycleSchema(database:Database.Database){
 database.exec(`CREATE TABLE IF NOT EXISTS route_lifecycle (
  route_id INTEGER PRIMARY KEY REFERENCES service_route_configs(id),
  state TEXT NOT NULL CHECK(state IN ('ACTIVE','INACTIVE','ARCHIVED','DELETED')),
  reason TEXT NOT NULL, actor_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS route_lifecycle_events (
  id INTEGER PRIMARY KEY,route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  from_state TEXT NOT NULL,to_state TEXT NOT NULL,reason TEXT NOT NULL,
  actor_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );`);
}
export function routeState(id:number):RouteState{
 const row=db.prepare("SELECT state FROM route_lifecycle WHERE route_id=?").get(id) as {state:RouteState}|undefined;
 if(row)return row.state;
 const route=db.prepare("SELECT active FROM service_route_configs WHERE id=?").get(id) as {active:number}|undefined;
 if(!route)throw Error("Không tìm thấy Route.");
 return route.active?"ACTIVE":"INACTIVE";
}
export function setRouteState(actor:AuthUser,id:number,to:RouteState,reason:string){
 if(actor.role!=="ADMIN")throw Error("Chỉ Admin được điều chỉnh Route.");
 if(!["ACTIVE","INACTIVE","ARCHIVED","DELETED"].includes(to))throw Error("Trạng thái Route không hợp lệ.");
 if(!reason?.trim())throw Error("Cần ghi lý do thay đổi Route.");
 return db.transaction(()=>{
  const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(id) as Row|undefined;
  if(!route)throw Error("Không tìm thấy Route.");
  const before=routeState(id);
  if(before===to)return {id,state:to,replayed:true};
  if(db.prepare("SELECT id FROM emergency_route_holds WHERE route_id=? AND undone_at IS NULL").get(id))
   throw Error("Cần Undo Emergency Hold trước khi đổi trạng thái Route.");
  if(to==="DELETED"){
   if(before!=="ARCHIVED")throw Error("Chỉ Route Archived mới được đưa sang Deleted.");
   const outstanding=db.prepare(`SELECT COUNT(*) n FROM orders o
    WHERE o.service=? COLLATE NOCASE AND o.sub_service=? COLLATE NOCASE AND o.supplier=? COLLATE NOCASE
    AND o.workflow_status NOT IN ('CANCELLED','DELIVERED','CLOSED')
   `).get(route.service,route.sub_service,route.supplier) as {n:number};
   if(outstanding.n)throw Error("Route còn Order vận hành chưa hoàn tất; chỉ được Archive.");
   const missing=db.prepare(`SELECT COUNT(*) n FROM orders o
    WHERE o.service=? COLLATE NOCASE AND o.sub_service=? COLLATE NOCASE AND o.supplier=? COLLATE NOCASE
    AND EXISTS(SELECT 1 FROM order_trackings t WHERE t.order_id=o.id)
    AND o.true_net_cost IS NULL AND o.workflow_status<>'CANCELLED'`).get(route.service,route.sub_service,route.supplier) as {n:number};
   if(missing.n)throw Error("Route còn Order đã có Tracking nhưng thiếu Actual Net Cost.");
  }
  db.prepare("INSERT INTO route_lifecycle(route_id,state,reason,actor_id) VALUES (?,?,?,?) ON CONFLICT(route_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(id,to,reason.trim(),actor.id);
  db.prepare("UPDATE service_route_configs SET active=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(to==="ACTIVE"?1:0,actor.id,id);
  db.prepare("INSERT INTO route_lifecycle_events(route_id,from_state,to_state,reason,actor_id) VALUES (?,?,?,?,?)").run(id,before,to,reason.trim(),actor.id);
  return {id,from:before,state:to};
 }).immediate();
}
