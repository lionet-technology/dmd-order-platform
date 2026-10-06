import {deadline,slaState} from "./sla";
import {db} from "./db";
import {assertClientAccess,requireAdmin,validDay,statementOrderIds} from "./credit";
import type {AuthUser} from "./auth";
type Row=Record<string,unknown>;
db.exec(`CREATE TABLE IF NOT EXISTS operation_cases(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('EXCEPTION','HOLD','CLAIM')),severity TEXT NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','INTERNAL')),status TEXT NOT NULL DEFAULT 'OPEN',summary TEXT NOT NULL,next_action TEXT NOT NULL DEFAULT '',assigned_to INTEGER REFERENCES users(id),due_date TEXT,created_by INTEGER NOT NULL REFERENCES users(id),resolved_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS operation_case_orders(case_id INTEGER NOT NULL REFERENCES operation_cases(id),order_id INTEGER NOT NULL REFERENCES orders(id),PRIMARY KEY(case_id,order_id));
 CREATE TABLE IF NOT EXISTS operation_case_events(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operation_cases(id),actor_id INTEGER NOT NULL,event TEXT NOT NULL,visibility TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS claim_decisions(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL UNIQUE REFERENCES operation_cases(id),refund_cents INTEGER NOT NULL,compensation_cents INTEGER NOT NULL,reason TEXT NOT NULL,decided_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_case_order ON operation_case_orders(order_id,case_id);`);
for(const [name,definition] of Object.entries({hold_requested:"INTEGER NOT NULL DEFAULT 0",next_action_due_at:"TEXT",source_statement_id:"INTEGER REFERENCES credit_statements(id)"}))if(!(db.prepare('PRAGMA table_info(operation_cases)').all() as Row[]).some(r=>r.name===name))db.exec(`ALTER TABLE operation_cases ADD COLUMN ${name} ${definition}`);
export function orderAccess(user:AuthUser,id:number){const o=db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Row|undefined;if(!o)throw Error("Order không tồn tại.");if(!['ADMIN','WAREHOUSE'].includes(user.role))assertClientAccess(user,Number(o.client_user_id));return o;}
export function caseAccess(user:AuthUser,id:number){const c=db.prepare("SELECT * FROM operation_cases WHERE id=?").get(id) as Row|undefined;if(!c)throw Error("Case không tồn tại.");if(user.role==='WAREHOUSE'&&c.kind==='CLAIM')throw Error("Kho không truy cập claim tài chính.");const orders=db.prepare("SELECT order_id FROM operation_case_orders WHERE case_id=?").all(id) as {order_id:number}[];for(const o of orders)orderAccess(user,o.order_id);if(user.role==='CLIENT'&&c.visibility!=='PUBLIC')throw Error("Case nội bộ.");return c;}
export function caseEvent(id:number,user:AuthUser,event:string,data:unknown,visibility='INTERNAL'){db.prepare("INSERT INTO operation_case_events(case_id,actor_id,event,visibility,data_json) VALUES (?,?,?,?,?)").run(id,user.id,event,visibility,JSON.stringify(data));}
const slaRank=(v:unknown)=>['OVERDUE','NEAR_DUE','ON_TIME','NONE','DONE'].indexOf(String(v));
export function casesFor(user:AuthUser):Array<Row & {orders:unknown[];events:unknown[]}>{
 const all=db.prepare("SELECT c.*,u.display_name assignee_name FROM operation_cases c LEFT JOIN users u ON u.id=c.assigned_to ORDER BY c.hold_requested DESC,c.id DESC").all() as Row[];
 return all.flatMap(c=>{try{caseAccess(user,Number(c.id));}catch{return []}
 const orders=db.prepare("SELECT o.id order_id,o.system_order_code,o.order_id client_order_ref,o.customer,o.client_user_id,o.declared_value,COALESCE(NULLIF(o.declared_value,0),(SELECT SUM(ci.quantity*oi.unit_manufacturing_value) FROM order_items oi JOIN carton_items ci ON ci.order_item_id=oi.id WHERE oi.order_id=o.id),0) goods_value FROM orders o JOIN operation_case_orders co ON co.order_id=o.id WHERE co.case_id=?").all(c.id) as Row[];
 const events=db.prepare("SELECT id,event,visibility,data_json,created_at FROM operation_case_events WHERE case_id=? AND (?!='CLIENT' OR visibility='PUBLIC') AND (?='ADMIN' OR event NOT LIKE 'SUPPLIER_RECOVERY_%') ORDER BY id").all(c.id,user.role,user.role);
 const response=db.prepare("SELECT e.created_at FROM operation_case_events e JOIN users u ON u.id=e.actor_id WHERE e.case_id=? AND e.event IN ('COMMENT','FINALIZED','HOLD_REVIEWED') AND e.visibility='PUBLIC' AND u.role IN ('ADMIN','SALES') ORDER BY e.id LIMIT 1").get(c.id) as Row|undefined;
 const closed=['RESOLVED','CLOSED'].includes(String(c.status));
 const firstDue=c.kind==='CLAIM'?deadline('CLIENT_CLAIM',c.created_at):c.due_date;
 const firstStatus=slaState(firstDue,!!response||closed),nextStatus=slaState(c.next_action_due_at,closed);
 const sla=c.kind==='CLAIM'&&!response&&!closed?firstStatus:nextStatus==='NONE'&&c.kind!=='CLAIM'?slaState(c.due_date,closed):nextStatus;
 const decision=db.prepare("SELECT refund_cents,compensation_cents,reason,created_at FROM claim_decisions WHERE case_id=?").get(c.id);
 return [{...c,order_refs:orders.map(o=>String(o.customer||'')+' / '+String(o.system_order_code||o.client_order_ref)).join(', '),first_response_due_at:firstDue,first_responded_at:response?.created_at||null,first_response_sla_status:firstStatus,next_action_sla_status:nextStatus,sla_status:sla,decision:decision||null,orders,events}];
 }).sort((a:Row,b:Row)=>Number(b.hold_requested)-Number(a.hold_requested)||slaRank(a.sla_status)-slaRank(b.sla_status)||Number(b.id)-Number(a.id));
}
export function caseAction(user:AuthUser,b:Row):{id:number;hold_case_id?:number|null}{return db.transaction(()=>{
 const action=String(b.action);
 if(action==='create'){
 if(!Array.isArray(b.order_ids)||!b.order_ids.length||b.order_ids.length>200)throw Error("Chọn từ 1 đến 200 Order.");const ids=[...new Set(b.order_ids.map(Number))];for(const id of ids)orderAccess(user,id);
 if(b.statement_id){const st=db.prepare('SELECT client_id FROM credit_statements WHERE id=?').get(Number(b.statement_id)) as Row|undefined;if(!st)throw Error('Statement không tồn tại.');assertClientAccess(user,Number(st.client_id));const members=statementOrderIds(Number(b.statement_id));if(!ids.every(id=>members.includes(id)))throw Error('Order không thuộc Statement được chọn.');}
 const kind=String(b.kind||'EXCEPTION'),visibility=String(b.visibility||'INTERNAL'),severity=String(b.severity||'MEDIUM');
 if(!['EXCEPTION','HOLD','CLAIM'].includes(kind)||!['PUBLIC','INTERNAL'].includes(visibility)||!['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity))throw Error("Case không hợp lệ.");
 if(kind==='CLAIM'&&new Set(ids.map(id=>Number((db.prepare('SELECT client_user_id FROM orders WHERE id=?').get(id) as Row).client_user_id))).size!==1)throw Error('Một Claim chỉ gồm Orders của cùng Client.');
 if(user.role==='CLIENT'&&(kind!=='CLAIM'||visibility!=='PUBLIC'))throw Error("Client chỉ được mở claim công khai.");
 if(user.role==='WAREHOUSE'&&kind==='CLAIM')throw Error("Kho không mở claim.");
 const summary=String(b.summary||'').trim();if(!summary||summary.length>2000)throw Error("Nhập mô tả case tối đa 2000 ký tự.");
 const owner=db.prepare('SELECT sales_user_id FROM users WHERE id=(SELECT client_user_id FROM orders WHERE id=?)').get(ids[0]) as Row|undefined;const assignee=user.role==='CLIENT'?Number(owner?.sales_user_id)||null:b.assigned_to?Number(b.assigned_to):null;if(assignee&&!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role!='CLIENT'").get(assignee))throw Error("Người phụ trách không hợp lệ.");
 const id=Number(db.prepare("INSERT INTO operation_cases(kind,severity,visibility,summary,next_action,assigned_to,due_date,created_by) VALUES (?,?,?,?,?,?,?,?)").run(kind,b.hold_requested?'HIGH':severity,visibility,summary,user.role==='CLIENT'?'':String(b.next_action||''),assignee,deadline(kind==='CLAIM'?'CLIENT_CLAIM':kind==='HOLD'?'WAREHOUSE_HOLD':'WEIGHT_ADJUSTMENT',undefined,kind==='CLAIM'?undefined:b.due_date?validDay(b.due_date):undefined),user.id).lastInsertRowid);
 db.prepare('UPDATE operation_cases SET source_statement_id=? WHERE id=?').run(b.statement_id?Number(b.statement_id):null,id);
 db.prepare('UPDATE operation_cases SET hold_requested=?,next_action_due_at=? WHERE id=?').run(b.hold_requested?1:0,user.role!=='CLIENT'&&b.next_action_due_at?validDay(b.next_action_due_at):null,id);
 for(const orderId of ids)db.prepare("INSERT INTO operation_case_orders VALUES (?,?)").run(id,orderId);caseEvent(id,user,'CREATED',{summary,kind,order_ids:ids,hold_requested:!!b.hold_requested,statement_id:b.statement_id||null},visibility);return {id};
 }
 const id=Number(b.case_id),c=caseAccess(user,id);
 if(action==='review_hold'){
 if(!['ADMIN','SALES'].includes(user.role)||c.kind!=='CLAIM')throw Error('Sales/Admin xem xét yêu cầu Hold.');
 if(!c.hold_requested)return {id};const reason=String(b.reason||'').trim();if(!reason)throw Error('Cần lý do xem xét Hold.');
 if(!['PLACE_HOLD','NO_HOLD'].includes(String(b.decision)))throw Error('Chọn quyết định Hold.');
 let holdId:number|null=null;if(b.decision==='PLACE_HOLD'){
 const ids=(db.prepare('SELECT order_id FROM operation_case_orders WHERE case_id=?').all(id) as Row[]).map(o=>o.order_id);
 holdId=caseAction(user,{action:'create',kind:'HOLD',visibility:'INTERNAL',severity:'HIGH',summary:reason,order_ids:ids}).id;
 }
 db.prepare('UPDATE operation_cases SET hold_requested=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
 caseEvent(id,user,'HOLD_REVIEWED',{decision:b.decision,reason,hold_case_id:holdId},c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');return {id,hold_case_id:holdId};
 }
 if(action==='comment'){const message=String(b.message||'').trim();if(!message||message.length>5000)throw Error("Nhập phản hồi tối đa 5000 ký tự.");caseEvent(id,user,'COMMENT',{message},user.role==='CLIENT'?'PUBLIC':b.visibility==='PUBLIC'&&c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');return {id};}
 if(user.role==='CLIENT')throw Error("Client không sửa trạng thái / quyết định case.");
 if(action==='update'){
 const status=String(b.status||c.status);if(c.kind==='CLAIM'&&['RESOLVED','CLOSED'].includes(String(c.status))&&status!==c.status&&!(c.status==='RESOLVED'&&status==='CLOSED'&&user.role==='ADMIN'))throw Error('Claim đã finalize; không được mở lại để chi tiền lần hai.');if(!['OPEN','INVESTIGATING','WAITING_CLIENT','WAITING_SUPPLIER','DECISION_PENDING','RESOLVED','CLOSED'].includes(status))throw Error("Trạng thái không hợp lệ.");
 if(c.kind==='CLAIM'&&['RESOLVED','CLOSED'].includes(status)&&!(status==='CLOSED'&&c.status==='RESOLVED'&&user.role==='ADMIN'))throw Error("Claim phải finalize qua quyết định tài chính.");
 if(c.kind==='HOLD'&&['RESOLVED','CLOSED'].includes(status)){requireAdmin(user);}
 const assigned=b.assigned_to===undefined?c.assigned_to:b.assigned_to?Number(b.assigned_to):null;
 if(assigned&&!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role!='CLIENT'").get(assigned))throw Error("Người phụ trách không hợp lệ.");
 db.prepare('UPDATE operation_cases SET next_action_due_at=? WHERE id=?').run(b.next_action_due_at===undefined?c.next_action_due_at:b.next_action_due_at?validDay(b.next_action_due_at):null,id);
 db.prepare("UPDATE operation_cases SET status=?,next_action=?,assigned_to=?,due_date=?,resolved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,String(b.next_action??c.next_action),assigned,b.due_date?validDay(b.due_date):c.due_date,['RESOLVED','CLOSED'].includes(status)?user.id:null,id);caseEvent(id,user,'UPDATED',{status,next_action:b.next_action,assigned_to:assigned,due_date:b.due_date,next_action_due_at:b.next_action_due_at});return {id};
 }throw Error("Action không được hỗ trợ.");
 }).immediate();}
export function hasCaseHold(orderId:number){return !!db.prepare("SELECT c.id FROM operation_cases c JOIN operation_case_orders o ON o.case_id=c.id WHERE o.order_id=? AND c.kind='HOLD' AND c.status NOT IN ('RESOLVED','CLOSED') LIMIT 1").get(orderId);}
