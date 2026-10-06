import {deadline,slaState} from "./sla";
import {db} from "./db";
import {caseAccess,caseEvent} from "./cases";
import {requireAdmin,cents,localDay,audit,validDay,shippingChargeCents} from "./credit";
import {publishPublicNote} from "./order-audit";
import type {AuthUser} from "./auth";
type Row=Record<string,unknown>;
db.exec(`CREATE TABLE IF NOT EXISTS claim_decisions(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL UNIQUE REFERENCES operation_cases(id),refund_cents INTEGER NOT NULL,compensation_cents INTEGER NOT NULL,reason TEXT NOT NULL,decided_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_recoveries(id INTEGER PRIMARY KEY,case_id INTEGER NOT NULL REFERENCES operation_cases(id),supplier TEXT NOT NULL,expected_cents INTEGER NOT NULL CHECK(expected_cents>=0),status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SUBMITTED','WAITING_SUPPLIER','PARTIALLY_RECOVERED','RECOVERED','REJECTED','CLOSED')),due_date TEXT,note TEXT,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_recovery_receipts(id INTEGER PRIMARY KEY,recovery_id INTEGER NOT NULL REFERENCES supplier_recoveries(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reference TEXT NOT NULL,occurred_at TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),UNIQUE(recovery_id,reference));`);
export function recoveriesFor(user:AuthUser){requireAdmin(user);return db.prepare("SELECT r.*,COALESCE((SELECT SUM(amount_cents) FROM supplier_recovery_receipts WHERE recovery_id=r.id),0) recovered_cents FROM supplier_recoveries r ORDER BY id DESC").all().map(row=>{const r=row as Row;return {...r,sla_status:slaState(r.due_date,['RECOVERED','REJECTED','CLOSED'].includes(String(r.status)))};});}
export function claimAction(user:AuthUser,b:Row){return db.transaction(()=>{
 requireAdmin(user);const action=String(b.action),id=Number(b.case_id),c=caseAccess(user,id);if(c.kind!=='CLAIM')throw Error("Chọn Client Claim.");
 if(action==='finalize'){
 const previous=db.prepare("SELECT * FROM claim_decisions WHERE case_id=?").get(id);if(previous)return previous;
 const refund=cents(b.refund_amount||0),compensation=cents(b.compensation_amount||0);if(!String(b.reason||'').trim())throw Error("Cần lý do quyết định.");
 const orders=db.prepare("SELECT o.* FROM orders o JOIN operation_case_orders co ON co.order_id=o.id WHERE co.case_id=?").all(id) as Row[];const clients=[...new Set(orders.map(o=>Number(o.client_user_id)))];if(clients.length!==1||!clients[0])throw Error("Claim chi tiền phải thuộc cùng một Client.");
 const orderIds=orders.map(o=>String(o.id)),placeholders=orders.map(()=>'?').join(',');const charged=shippingChargeCents(orders.map(o=>Number(o.id)));
 const priorRefund=Number((db.prepare(`SELECT COALESCE(SUM(ROUND(e.amount*100)),0) n FROM ledger_entries e WHERE e.direction='CREDIT' AND e.entry_type='REFUND' AND ((e.reference_type='ORDER_CANCELLATION' AND e.reference_id IN (${placeholders})) OR (e.reference_type='CLAIM' AND EXISTS (SELECT 1 FROM operation_case_orders co WHERE CAST(co.case_id AS TEXT)=e.reference_id AND CAST(co.order_id AS TEXT) IN (${placeholders}))))`).get(...orderIds,...orderIds) as {n:number}).n);
 if(refund>Math.max(0,charged-priorRefund))throw Error("Refund vượt cước còn có thể hoàn; compensation là khoản riêng.");
 const goods=orders.reduce((n,o)=>n+Number(o.declared_value|| (db.prepare('SELECT COALESCE(SUM(ci.quantity*oi.unit_manufacturing_value),0) n FROM order_items oi JOIN carton_items ci ON ci.order_item_id=oi.id WHERE oi.order_id=?').get(o.id) as {n:number}).n||0),0);
 const warnings=compensation>Math.round(goods*100)?['Bồi thường vượt giá trị khai báo/sản xuất của hàng hóa']:[];
 if(warnings.length)caseEvent(id,user,'COMPENSATION_WARNING',{warnings,goods_value:goods,compensation_amount:compensation/100},c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');
 const decision=Number(db.prepare("INSERT INTO claim_decisions(case_id,refund_cents,compensation_cents,reason,decided_by) VALUES (?,?,?,?,?)").run(id,refund,compensation,String(b.reason),user.id).lastInsertRowid);
 for(const [type,amount] of [['REFUND',refund],['COMPENSATION',compensation]] as const)if(amount)db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,'CREDIT',?,?,'CLAIM',?,?,?)").run(clients[0],localDay(),type,amount/100,orders[0].customer,String(id),String(b.reason),user.id);
 db.prepare("UPDATE operation_cases SET status='RESOLVED',resolved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id,id);caseEvent(id,user,'FINALIZED',{refund_amount:refund/100,compensation_amount:compensation/100,reason:b.reason},c.visibility==='PUBLIC'?'PUBLIC':'INTERNAL');
 for(const o of orders)publishPublicNote({orderId:Number(o.id),eventType:'REFUND',summary:'Order thuộc Claim #'+id+' đã xử lý. Xem tổng hoàn cước/bồi thường tại Claim; không phân bổ payout cho riêng Order. '+String(b.reason),actorId:user.id});audit(clients[0],user.id,'CLAIM_FINALIZED',{id,decision});return {id:decision,warnings};
 }
 if(action==='create_recovery'){
 const supplier=String(b.supplier||'').trim();if(!supplier)throw Error("Supplier bắt buộc.");const expected=cents(b.expected_amount);const recovery=Number(db.prepare("INSERT INTO supplier_recoveries(case_id,supplier,expected_cents,due_date,note,created_by) VALUES (?,?,?,?,?,?)").run(id,supplier,expected,deadline('SUPPLIER_RECOVERY',undefined,b.due_date?validDay(b.due_date):undefined),String(b.note||''),user.id).lastInsertRowid);caseEvent(id,user,'SUPPLIER_RECOVERY_CREATED',{recovery_id:recovery});return {id:recovery};
 }
 const r=db.prepare("SELECT * FROM supplier_recoveries WHERE id=? AND case_id=?").get(Number(b.recovery_id),id) as Row|undefined;if(!r)throw Error("Recovery không tồn tại.");
 if(action==='recovery_status'){const status=String(b.status);if(!['OPEN','SUBMITTED','WAITING_SUPPLIER','REJECTED','CLOSED'].includes(status))throw Error("Trạng thái recovery không hợp lệ.");db.prepare("UPDATE supplier_recoveries SET status=?,note=?,due_date=? WHERE id=?").run(status,String(b.note||''),b.due_date?validDay(b.due_date):r.due_date,r.id);caseEvent(id,user,'SUPPLIER_RECOVERY_UPDATED',{recovery_id:r.id,status});return {id:r.id};}
 if(action==='receive_recovery'){
 const amount=cents(b.amount),reference=String(b.reference||'').trim();if(!amount||!reference)throw Error("Số tiền và reference bắt buộc.");if(db.prepare("SELECT id FROM supplier_recovery_receipts WHERE recovery_id=? AND reference=?").get(r.id,reference))return {id:r.id};
 const recovered=Number((db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM supplier_recovery_receipts WHERE recovery_id=?").get(r.id) as {n:number}).n);if(recovered+amount>Number(r.expected_cents))throw Error("Thu hồi vượt expected; cần sửa quyết định riêng.");
 db.prepare("INSERT INTO supplier_recovery_receipts(recovery_id,amount_cents,reference,occurred_at,created_by) VALUES (?,?,?,?,?)").run(r.id,amount,reference,validDay(b.occurred_at||localDay()),user.id);db.prepare("UPDATE supplier_recoveries SET status=? WHERE id=?").run(recovered+amount===Number(r.expected_cents)?'RECOVERED':'PARTIALLY_RECOVERED',r.id);caseEvent(id,user,'SUPPLIER_RECOVERY_RECEIVED',{recovery_id:r.id,amount:amount/100,reference});return {id:r.id};
 }throw Error("Action không hỗ trợ.");
 }).immediate();}
