import {db} from "./db";
export const cancellationStages=["PRE_PURCHASE","PURCHASED","ISSUED","SHIPPED"] as const;
export type CancellationRules=Partial<Record<typeof cancellationStages[number],{allowed:boolean;refund_percent:number}>>;
db.exec(`CREATE TABLE IF NOT EXISTS route_cancellation_policies(
 route_id INTEGER PRIMARY KEY REFERENCES service_route_configs(id),rules_json TEXT NOT NULL,version INTEGER NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS route_cancellation_policy_history(
 id INTEGER PRIMARY KEY,route_id INTEGER NOT NULL REFERENCES service_route_configs(id),version INTEGER NOT NULL,rules_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(route_id,version));
 CREATE TRIGGER IF NOT EXISTS immutable_cancellation_policy_update BEFORE UPDATE ON route_cancellation_policy_history BEGIN SELECT RAISE(ABORT,'Cancellation policy history is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_cancellation_policy_delete BEFORE DELETE ON route_cancellation_policy_history BEGIN SELECT RAISE(ABORT,'Cancellation policy history is immutable'); END;`);
export function parseCancellationRules(value:unknown):CancellationRules{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Policy phải có rule theo trạng thái.");
 const out:CancellationRules={};
 for(const [key,raw] of Object.entries(value)){
  if(!cancellationStages.includes(key as typeof cancellationStages[number]))throw Error("Trạng thái policy không hỗ trợ: "+key);
  const r=raw as {allowed?:unknown;refund_percent?:unknown};
  if(!r||typeof r.allowed!=="boolean"||typeof r.refund_percent!=="number"||!Number.isFinite(r.refund_percent)||r.refund_percent<0||r.refund_percent>100)throw Error("Rule cần allowed boolean và refund_percent từ 0 đến 100.");
  if(!r.allowed&&r.refund_percent!==0)throw Error("Rule từ chối phải có refund_percent=0.");
  out[key as typeof cancellationStages[number]]={allowed:r.allowed,refund_percent:r.refund_percent};
 }
 return out;
}
export function readCancellationRules(routeId:number){
 const row=db.prepare("SELECT * FROM route_cancellation_policies WHERE route_id=?").get(routeId) as {rules_json:string;version:number}|undefined;
 return row?{rules:parseCancellationRules(JSON.parse(row.rules_json)),version:row.version}:null;
}
export function saveCancellationRules(routeId:number,value:unknown,reason:unknown,actorId:number){
 const rules=parseCancellationRules(value),note=String(reason||"").trim();
 if(!note)throw Error("Cấu hình policy cần lý do và căn cứ Supplier.");
 return db.transaction(()=>{
  if(!db.prepare("SELECT id FROM service_route_configs WHERE id=?").get(routeId))throw Error("Route không tồn tại.");
  const version=(readCancellationRules(routeId)?.version||0)+1,json=JSON.stringify(rules);
  db.prepare("INSERT INTO route_cancellation_policies(route_id,rules_json,version,reason,actor_id) VALUES (?,?,?,?,?) ON CONFLICT(route_id) DO UPDATE SET rules_json=excluded.rules_json,version=excluded.version,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(routeId,json,version,note,actorId);
  db.prepare("INSERT INTO route_cancellation_policy_history(route_id,version,rules_json,reason,actor_id) VALUES (?,?,?,?,?)").run(routeId,version,json,note,actorId);
  return readCancellationRules(routeId);
 }).immediate();
}
