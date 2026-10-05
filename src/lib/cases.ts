import {db} from "./db";
import {assertClientAccess,requireAdmin,validDay} from "./credit";
import type {AuthUser} from "./auth";
type Row=Record<string,unknown>;
db.exec(`CREATE TABLE IF NOT EXISTS operation_cases(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('EXCEPTION','HOLD','CLAIM')),severity TEXT NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','INTERNAL')),status TEXT NOT NULL DEFAULT 'OPEN',summary TEXT NOT NULL,next_action TEXT NOT NULL DEFAULT '',assigned_to INTEGER REFERENCES users(id),due_date TEXT,created_by INTEGER NOT NULL REFERENCES users(id),resolved_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS operation_case_orders(case_id INTEGER NOT NULL REFERENCES operation_cases(id),order_id INTEGER NOT NULL REFERENCES orders(id),PRIMARY KEY(case_id,order_id));
 CREATE TABLE IF NOT EXISTS operation_case_events(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operation_cases(id),actor_id INTEGER NOT NULL,event TEXT NOT NULL,visibility TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_case_order ON operation_case_orders(order_id,case_id);`);
export function orderAccess(user:AuthUser,id:number){const o=db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Row|undefined;if(!o)throw Error("Order không tồn tại.");if(!['ADMIN','WAREHOUSE'].includes(user.role))assertClientAccess(user,Number(o.client_user_id));return o;}
export function caseAccess(user:AuthUser,id:number){const c=db.prepare("SELECT * FROM operation_cases WHERE id=?").get(id) as Row|undefined;if(!c)throw Error("Case không tồn tại.");if(user.role==='WAREHOUSE'&&c.kind==='CLAIM')throw Error("Kho không truy cập claim tài chính.");const orders=db.prepare("SELECT order_id FROM operation_case_orders WHERE case_id=?").all(id) as {order_id:number}[];for(const o of orders)orderAccess(user,o.order_id);if(user.role==='CLIENT'&&c.visibility!=='PUBLIC')throw Error("Case nội bộ.");return c;}
export function caseEvent(id:number,user:AuthUser,event:string,data:unknown,visibility='INTERNAL'){db.prepare("INSERT INTO operation_case_events(case_id,actor_id,event,visibility,data_json) VALUES (?,?,?,?,?)").run(id,user.id,event,visibility,JSON.stringify(data));}
export function casesFor(user:AuthUser):Array<Row & {orders:unknown[];events:unknown[]}>{const all=db.prepare("SELECT * FROM operation_cases ORDER BY due_date IS NULL,due_date,id DESC LIMIT 1000").all() as Row[];return all.flatMap(c=>{try{caseAccess(user,Number(c.id));const orders=db.prepare("SELECT order_id FROM operation_case_orders WHERE case_id=?").all(c.id);const events=db.prepare("SELECT id,event,data_json,created_at FROM operation_case_events WHERE case_id=? AND (?!='CLIENT' OR visibility='PUBLIC') AND (?='ADMIN' OR event NOT LIKE 'SUPPLIER_RECOVERY_%') ORDER BY id").all(c.id,user.role,user.role);return [{...c,orders,events}];}catch{return []}});}
export function caseAction(user:AuthUser,b:Row){return db.transaction(()=>{
 const action=String(b.action);
 if(action==='create'){
 if(!Array.isArray(b.order_ids)||!b.order_ids.length||b.order_ids.length>200)throw Error("Chọn từ 1 đến 200 Order.");const ids=[...new Set(b.order_ids.map(Number))];for(const id of ids)orderAccess(user,id);
 const kind=String(b.kind||'EXCEPTION'),visibility=String(b.visibility||'INTERNAL'),severity=String(b.severity||'MEDIUM');
 if(!['EXCEPTION','HOLD','CLAIM'].includes(kind)||!['PUBLIC','INTERNAL'].includes(visibility)||!['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity))throw Error("Case không hợp lệ.");
 if(kind==='CLAIM'&&new Set(ids.map(id=>Number((db.prepare('SELECT client_user_id FROM orders WHERE id=?').get(id) as Row).client_user_id))).size!==1)throw Error('Một Claim chỉ gồm Orders của cùng Client.');
 if(user.role==='CLIENT'&&(kind!=='CLAIM'||visibility!=='PUBLIC'))throw Error("Client chỉ được mở claim công khai.");
 if(user.role==='WAREHOUSE'&&kind==='CLAIM')throw Error("Kho không mở claim.");
 const summary=String(b.summary||'').trim();if(!summary||summary.length>2000)throw Error("Nhập mô tả case tối đa 2000 ký tự.");
 const assignee=b.assigned_to?Number(b.assigned_to):null;if(assignee&&!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role!='CLIENT'").get(assignee))throw Error("Người phụ trách không hợp lệ.");
 const id=Number(db.prepare("INSERT INTO operation_cases(kind,severity,visibility,summary,next_action,assigned_to,due_date,created_by) VALUES (?,?,?,?,?,?,?,?)").run(kind,severity,visibility,summary,String(b.next_action||''),assignee,b.due_date?validDay(b.due_date):null,user.id).lastInsertRowid);
 for(const orderId of ids)db.prepare("INSERT INTO operation_case_orders VALUES (?,?)").run(id,orderId);caseEvent(id,user,'CREATED',{summary,kind,order_ids:ids},visibility);return {id};
 }
 const id=Number(b.case_id),c=caseAccess(user,id);
 if(action==='comment'){const message=String(b.message||'').trim();if(!message||message.length>5000)throw Error("Nhập phản hồi tối đa 5000 ký tự.");caseEvent(id,user,'COMMENT',{message},user.role==='CLIENT'?'PUBLIC':b.visibility==='PUBLIC'&&c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');return {id};}
 if(user.role==='CLIENT')throw Error("Client không sửa trạng thái / quyết định case.");
 if(action==='update'){
 const status=String(b.status||c.status);if(c.kind==='CLAIM'&&['RESOLVED','CLOSED'].includes(String(c.status))&&status!==c.status&&!(c.status==='RESOLVED'&&status==='CLOSED'&&user.role==='ADMIN'))throw Error('Claim đã finalize; không được mở lại để chi tiền lần hai.');if(!['OPEN','INVESTIGATING','WAITING_CLIENT','WAITING_SUPPLIER','DECISION_PENDING','RESOLVED','CLOSED'].includes(status))throw Error("Trạng thái không hợp lệ.");
 if(c.kind==='CLAIM'&&['RESOLVED','CLOSED'].includes(status)&&!(status==='CLOSED'&&c.status==='RESOLVED'&&user.role==='ADMIN'))throw Error("Claim phải finalize qua quyết định tài chính.");
 if(c.kind==='HOLD'&&['RESOLVED','CLOSED'].includes(status)){requireAdmin(user);}
 const assigned=b.assigned_to===undefined?c.assigned_to:b.assigned_to?Number(b.assigned_to):null;
 if(assigned&&!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role!='CLIENT'").get(assigned))throw Error("Người phụ trách không hợp lệ.");
 db.prepare("UPDATE operation_cases SET status=?,next_action=?,assigned_to=?,due_date=?,resolved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,String(b.next_action??c.next_action),assigned,b.due_date?validDay(b.due_date):c.due_date,['RESOLVED','CLOSED'].includes(status)?user.id:null,id);caseEvent(id,user,'UPDATED',{status,next_action:b.next_action,assigned_to:assigned,due_date:b.due_date});return {id};
 }throw Error("Action không được hỗ trợ.");
 }).immediate();}
export function hasCaseHold(orderId:number){return !!db.prepare("SELECT c.id FROM operation_cases c JOIN operation_case_orders o ON o.case_id=c.id WHERE o.order_id=? AND c.kind='HOLD' AND c.status NOT IN ('RESOLVED','CLOSED') LIMIT 1").get(orderId);}
