import {db} from './db';
import type {AuthUser} from './auth';
import {canonicalEnumValue} from './enums';
import {moneyCommand} from './money-command';
import {localDay} from './credit';
import './supplier-payables';
import {reconcileLots} from './reconciliation';
type Row=Record<string,unknown>;
export function supplierAccountSchema(){
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_account_entries(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL UNIQUE,delta_cents INTEGER NOT NULL,revenue_cents INTEGER NOT NULL DEFAULT 0,cost_cents INTEGER NOT NULL DEFAULT 0,order_id INTEGER REFERENCES orders(id),reason TEXT NOT NULL,reference TEXT NOT NULL,service TEXT,due_date TEXT,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_refund_requests(tracking_id INTEGER PRIMARY KEY REFERENCES order_trackings(id),supplier TEXT NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_claims(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reason TEXT NOT NULL,evidence TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_claim_trackings(tracking_id INTEGER PRIMARY KEY REFERENCES supplier_refund_requests(tracking_id),claim_id INTEGER NOT NULL REFERENCES supplier_claims(id));
 CREATE TABLE IF NOT EXISTS supplier_claim_events(id INTEGER PRIMARY KEY,claim_id INTEGER NOT NULL REFERENCES supplier_claims(id),status TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 for(const table of ['supplier_account_entries','supplier_refund_requests','supplier_claims','supplier_claim_trackings','supplier_claim_events'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Supplier account history is immutable'); END;`);
}
supplierAccountSchema();
function access(u:AuthUser){if(!['FINANCE','BOD'].includes(u.role))throw Error('Chỉ Finance/BOD được quản lý tài chính Supplier.');}
function text(v:unknown){const s=String(v??'').trim();if(!s||s.length>1000)throw Error('Cần nội dung từ 1 đến 1000 ký tự.');return s;}
function cents(v:unknown,zero=false){const s=String(v??'');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Số tiền USD không hợp lệ.');const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n>(1e11)||n<(zero?0:1))throw Error('Số tiền ngoài giới hạn.');return n;}
function date(v:unknown){if(!v)return null;const s=String(v),d=new Date(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ.');return s;}
export function supplierAccounts(u:AuthUser){
 access(u);
 const entries=db.prepare('SELECT * FROM supplier_account_entries ORDER BY id DESC').all() as Row[];
 const claims=db.prepare(`SELECT c.*,COALESCE((SELECT status FROM supplier_claim_events e WHERE e.claim_id=c.id ORDER BY e.id DESC LIMIT 1),'OPEN') status,COALESCE((SELECT SUM(delta_cents) FROM supplier_account_entries a WHERE a.source='CLAIM:'||c.id),0) credited_cents FROM supplier_claims c ORDER BY c.id DESC`).all();
 const suppliers=db.prepare("SELECT value supplier FROM enum_values WHERE enum_type='SUPPLIER' UNION SELECT supplier FROM supplier_account_entries UNION SELECT supplier FROM supplier_invoices UNION SELECT supplier FROM orders WHERE supplier IS NOT NULL AND supplier<>''").all() as {supplier:string}[];
 return {suppliers:suppliers.map(s=>{const rows=entries.filter(e=>e.supplier===s.supplier);const balance=rows.reduce((n,e)=>n+Number(e.delta_cents),0);return {...s,balance_cents:balance,revenue_cents:rows.reduce((n,e)=>n+Number(e.revenue_cents),0),cost_cents:rows.reduce((n,e)=>n+Number(e.cost_cents),0),overdue:balance<0&&rows.some(e=>Number(e.delta_cents)<0&&e.due_date&&String(e.due_date)<localDay())};}),entries,claims,requests:db.prepare('SELECT r.*,t.tracking,t.order_id,ct.claim_id FROM supplier_refund_requests r JOIN order_trackings t ON t.id=r.tracking_id LEFT JOIN supplier_claim_trackings ct ON ct.tracking_id=r.tracking_id').all(),trackings:db.prepare("SELECT t.id,t.order_id,t.tracking,o.supplier,o.service,o.reconciliation_status FROM order_trackings t JOIN orders o ON o.id=t.order_id ORDER BY t.id DESC LIMIT 1000").all(),costs:db.prepare("SELECT c.id,c.supplier,c.tracking,c.total_net_cost,c.order_lot_id,l.order_id,l.cost_status FROM supplier_costs c LEFT JOIN order_lots l ON l.id=c.order_lot_id ORDER BY c.id DESC LIMIT 1000").all(),services:db.prepare("SELECT value FROM enum_values WHERE enum_type='SERVICE' AND active=1").all()};
}
export function supplierAccountAction(u:AuthUser,b:Row){
 access(u);if(!b.request_key)throw Error('Cần request_key.');
 return moneyCommand('supplier-account:'+u.id,b.request_key,b,()=>{
 if(b.action==='claim_credit'&&!String(b.reference||'').trim())throw Error('Cần chứng từ credit / tiền thực nhận.');
 const supplier=canonicalEnumValue('SUPPLIER',b.supplier,'',{allowInactive:true});if(!supplier)throw Error('Cần Supplier.');
 const reason=text(b.reason),reference=text(b.reference||b.reason);
 const post=(kind:string,source:string,delta:number,revenue=0,cost=0,order:number|null=null)=>{const id=Number(db.prepare('INSERT INTO supplier_account_entries(supplier,kind,source,delta_cents,revenue_cents,cost_cents,order_id,reason,reference,service,due_date,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(supplier,kind,source,delta,revenue,cost,order,reason,reference,b.action==='addon'?String(b.service):null,date(b.due_date),u.id).lastInsertRowid);return {id};};
 if(b.action==='confirm_cost'){
 const c=db.prepare('SELECT c.*,l.cost_status,l.order_id FROM supplier_costs c JOIN order_lots l ON l.id=c.order_lot_id WHERE c.id=?').get(Number(b.cost_id)) as Row|undefined;
 const reconciled=c?reconcileLots(Number(c.order_id)).find(l=>Number(l.id)===Number(c.order_lot_id)):undefined;
 if(!c||c.supplier!==supplier||reconciled?.reconciliation_status!=='PASS'||reconciled.actual_cents===null)throw Error('Cần Actual Cost cùng Supplier đã đối soát PASS.');
 // A component/adjustment allocation cannot safely be guessed across Suppliers.
 if(db.prepare('SELECT id FROM lot_cost_adjustments WHERE lot_id=? LIMIT 1').get(c.order_lot_id))throw Error('Cost có adjustment cần phân bổ chứng từ riêng trước khi ghi.');
 const n=cents(c.total_net_cost,true);return post('ACTUAL_COST','COST:'+c.id,-n,0,0,Number(c.order_id));
 }
 if(['opening','payment','adjustment','addon'].includes(String(b.action))){
 const n=cents(b.amount);const source=String(b.action)+':'+supplier+':'+reference.toLowerCase();
 if(b.action==='opening'){if(db.prepare("SELECT id FROM supplier_account_entries WHERE supplier=? AND kind='OPENING'").get(supplier))throw Error('Opening đã ghi.');if(!['POSITIVE','NEGATIVE'].includes(String(b.direction)))throw Error('Chọn dấu opening.');return post('OPENING','OPENING:'+supplier,b.direction==='NEGATIVE'?-n:n);}
 if(b.action==='payment'){if(db.prepare('SELECT id FROM supplier_payments WHERE supplier=? AND payment_reference=? COLLATE NOCASE').get(supplier,reference))throw Error('Khoản tiền đã có ở Supplier Payables; không ghi lần hai.');return post('PAYMENT',source,n);}
 if(b.action==='adjustment'){if(!['POSITIVE','NEGATIVE'].includes(String(b.direction)))throw Error('Chọn dấu điều chỉnh.');return post('ADJUSTMENT',source,b.direction==='POSITIVE'?n:-n);}
 if(!['BUY','SELL'].includes(String(b.direction)))throw Error('Chọn DMD mua hoặc bán.');
 const service=canonicalEnumValue('SERVICE',b.service);if(!service)throw Error('Cần dịch vụ.');
 const order=b.order_id?Number(b.order_id):null;
 if(order){const o=db.prepare('SELECT supplier FROM orders WHERE id=?').get(order) as Row|undefined;if(!o||o.supplier!==supplier)throw Error('Order không thuộc Supplier.');}
 const cost=cents(b.net_cost,true);
 // Only this entry posts the add-on; optional Order linkage is informational.
 return post('ADDON_'+b.direction,source,b.direction==='BUY'?-n:n,b.direction==='SELL'?n:0,b.direction==='BUY'?n:cost,order);
 }
 if(b.action==='request_refund'){
 const t=db.prepare("SELECT t.id,o.supplier FROM order_trackings t JOIN orders o ON o.id=t.order_id WHERE t.id=? AND t.status='ACTIVE'").get(Number(b.tracking_id)) as Row|undefined;
 if(!t||t.supplier!==supplier)throw Error('Tracking không thuộc Supplier.');
 db.prepare('INSERT INTO supplier_refund_requests(tracking_id,supplier,reason,evidence,actor_id) VALUES (?,?,?,?,?)').run(t.id,supplier,reason,text(b.evidence),u.id);return {id:Number(t.id)};
 }
 if(b.action==='claim'){
 if(!Array.isArray(b.tracking_ids)||!b.tracking_ids.length||b.tracking_ids.length>200)throw Error('Chọn 1–200 Tracking.');
 const ids=b.tracking_ids.map(Number);if(new Set(ids).size!==ids.length)throw Error('Tracking trùng.');
 for(const id of ids)if(!db.prepare('SELECT tracking_id FROM supplier_refund_requests WHERE tracking_id=? AND supplier=? AND NOT EXISTS(SELECT 1 FROM supplier_claim_trackings WHERE tracking_id=?)').get(id,supplier,id))throw Error('Tracking chưa yêu cầu refund hoặc đã thuộc claim.');
 const id=Number(db.prepare('INSERT INTO supplier_claims(supplier,amount_cents,reason,evidence,actor_id) VALUES (?,?,?,?,?)').run(supplier,cents(b.amount),reason,text(b.evidence),u.id).lastInsertRowid);
 for(const tracking of ids)db.prepare('INSERT INTO supplier_claim_trackings VALUES (?,?)').run(tracking,id);
 return {id};
 }
 if(b.action==='claim_status'||b.action==='claim_credit'){
 const c=db.prepare("SELECT c.*,COALESCE((SELECT status FROM supplier_claim_events e WHERE e.claim_id=c.id ORDER BY e.id DESC LIMIT 1),'OPEN') status FROM supplier_claims c WHERE c.id=? AND c.supplier=?").get(Number(b.claim_id),supplier) as Row|undefined;
 if(!c)throw Error('Claim không tồn tại.');
 if(b.action==='claim_credit'){if(c.status!=='APPROVED'||!['CREDIT_ISSUED','REFUND_RECEIVED'].includes(String(b.settlement)))throw Error('Cần claim đã duyệt và chứng từ credit/tiền thực nhận.');return post(String(b.settlement),'CLAIM:'+c.id,Number(c.amount_cents));}
 if(!['OPEN','SUBMITTED'].includes(String(c.status))||!['SUBMITTED','APPROVED','REJECTED'].includes(String(b.status)))throw Error('Chuyển trạng thái không hợp lệ.');
 db.prepare('INSERT INTO supplier_claim_events(claim_id,status,reason,actor_id) VALUES (?,?,?,?)').run(c.id,b.status,reason,u.id);return {id:Number(c.id)};
 }
 throw Error('Hành động không hợp lệ.');
 });
}
