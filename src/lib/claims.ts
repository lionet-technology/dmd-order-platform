import {RefundService,refundUsdCents} from "./refunds";
import {deadline,slaState} from "./sla";
import {db} from "./db";
import {moneyCommand} from "./money-command";
import {caseAccess,caseEvent} from "./cases";
import {requireAdmin,cents,localDay,audit,validDay} from "./credit";
import {publishPublicNote} from "./order-audit";
import type {AuthUser} from "./auth";
type Row=Record<string,unknown>;
db.exec(`CREATE TABLE IF NOT EXISTS claim_decisions(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL UNIQUE REFERENCES operation_cases(id),refund_cents INTEGER NOT NULL,compensation_cents INTEGER NOT NULL,reason TEXT NOT NULL,decided_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_recoveries(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operation_cases(id),supplier TEXT NOT NULL,expected_cents INTEGER NOT NULL CHECK(expected_cents>=0),status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SUBMITTED','WAITING_SUPPLIER','PARTIALLY_RECOVERED','RECOVERED','REJECTED','CLOSED')),due_date TEXT,note TEXT,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_recovery_receipts(id INTEGER PRIMARY KEY,recovery_id INTEGER NOT NULL REFERENCES supplier_recoveries(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reference TEXT NOT NULL,occurred_at TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),UNIQUE(recovery_id,reference));`);
if(!(db.prepare('PRAGMA table_info(supplier_recovery_receipts)').all() as Row[]).some(c=>c.name==='created_at'))db.exec('ALTER TABLE supplier_recovery_receipts ADD COLUMN created_at TEXT');
export function recoveriesFor(user:AuthUser){requireAdmin(user);return db.prepare("SELECT r.*,COALESCE((SELECT SUM(amount_cents) FROM supplier_recovery_receipts WHERE recovery_id=r.id),0) recovered_cents FROM supplier_recoveries r ORDER BY id DESC").all().map(row=>{const r=row as Row;return {...r,receipts:db.prepare('SELECT id,amount_cents,reference,occurred_at,created_at FROM supplier_recovery_receipts WHERE recovery_id=? ORDER BY id DESC').all(r.id),sla_status:slaState(r.due_date,['RECOVERED','REJECTED','CLOSED'].includes(String(r.status)))};});}
export function claimAction(user:AuthUser,b:Row){requireAdmin(user);caseAccess(user,Number(b.case_id));return moneyCommand("claim:"+user.id,b.request_key,b,()=>claimActionOnce(user,b));}
function claimActionOnce(user:AuthUser,b:Row){return db.transaction(()=>{
 requireAdmin(user);const action=String(b.action),id=Number(b.case_id),c=caseAccess(user,id);if(c.kind!=='CLAIM')throw Error("Chọn Client Claim.");
 if(action==='finalize'){
 const result=new RefundService(db).decide(user,{...b,refund_cents:refundUsdCents(b.refund_amount),compensation_cents:refundUsdCents(b.compensation_amount)});
 db.prepare("UPDATE operation_cases SET status='RESOLVED',resolved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id,id);
 // The refund receipt owns financial idempotency; case event is unique by refund decision ID.
 if(!db.prepare("SELECT id FROM operation_case_events WHERE case_id=? AND event='REFUND_OBLIGATION_DECIDED' AND json_extract(data_json,'$.decision_id')=?").get(id,result.id)){
 caseEvent(id,user,'REFUND_OBLIGATION_DECIDED',{decision_id:result.id,reason:b.reason,refund_amount:b.refund_amount||0,compensation_amount:b.compensation_amount||0},c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');
 for(const o of db.prepare('SELECT order_id FROM operation_case_orders WHERE case_id=?').all(id) as {order_id:number}[])publishPublicNote({orderId:o.order_id,eventType:'REFUND',summary:'Claim #'+id+': đã cập nhật nghĩa vụ hoàn; hoàn thực tế được ghi riêng. '+String(b.reason),actorId:user.id});
 audit(result.client_id,user.id,'CLAIM_OBLIGATION_DECIDED',result);
 }return result;
 }
 if(action==='create_recovery'){
 const supplier=String(b.supplier||'').trim();if(!supplier)throw Error("Supplier bắt buộc.");const expected=cents(b.expected_amount);const recovery=Number(db.prepare("INSERT INTO supplier_recoveries(case_id,supplier,expected_cents,due_date,note,created_by) VALUES (?,?,?,?,?,?)").run(id,supplier,expected,deadline('SUPPLIER_RECOVERY',undefined,b.due_date?validDay(b.due_date):undefined),String(b.note||''),user.id).lastInsertRowid);caseEvent(id,user,'SUPPLIER_RECOVERY_CREATED',{recovery_id:recovery});return {id:recovery};
 }
 const r=db.prepare("SELECT * FROM supplier_recoveries WHERE id=? AND case_id=?").get(Number(b.recovery_id),id) as Row|undefined;if(!r)throw Error("Recovery không tồn tại.");
 if(action==='recovery_status'){const status=String(b.status);if(!['OPEN','SUBMITTED','WAITING_SUPPLIER','REJECTED','CLOSED'].includes(status))throw Error("Trạng thái recovery không hợp lệ.");db.prepare("UPDATE supplier_recoveries SET status=?,note=?,due_date=? WHERE id=?").run(status,String(b.note||''),b.due_date?validDay(b.due_date):r.due_date,r.id);caseEvent(id,user,'SUPPLIER_RECOVERY_UPDATED',{recovery_id:r.id,status});return {id:r.id};}
 if(action==='receive_recovery'){
 const amount=cents(b.amount),reference=String(b.reference||'').trim();if(!amount||!reference)throw Error("Số tiền và reference bắt buộc.");if(db.prepare("SELECT id FROM supplier_recovery_receipts WHERE recovery_id=? AND reference=?").get(r.id,reference))return {id:r.id};
 const recovered=Number((db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM supplier_recovery_receipts WHERE recovery_id=?").get(r.id) as {n:number}).n);if(recovered+amount>Number(r.expected_cents))throw Error("Thu hồi vượt expected; cần sửa quyết định riêng.");
 db.prepare("INSERT INTO supplier_recovery_receipts(recovery_id,amount_cents,reference,occurred_at,created_by,created_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)").run(r.id,amount,reference,validDay(b.occurred_at||localDay()),user.id);db.prepare("UPDATE supplier_recoveries SET status=? WHERE id=?").run(recovered+amount===Number(r.expected_cents)?'RECOVERED':'PARTIALLY_RECOVERED',r.id);caseEvent(id,user,'SUPPLIER_RECOVERY_RECEIVED',{recovery_id:r.id,amount:amount/100,reference});return {id:r.id};
 }throw Error("Action không hỗ trợ.");
 }).immediate();}
