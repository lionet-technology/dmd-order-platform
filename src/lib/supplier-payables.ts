import {db} from './db';
import {localDay} from './credit';
import type {AuthUser} from './auth';
import {canonicalEnumValue} from './enums';
import {moneyCommand} from './money-command';
type Row=Record<string,unknown>;
export function payablesSchema(){
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_invoices(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,invoice_number TEXT NOT NULL COLLATE NOCASE,currency TEXT NOT NULL CHECK(currency='USD'),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),invoice_date TEXT NOT NULL,due_date TEXT NOT NULL,document_reference TEXT NOT NULL,note TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(supplier,invoice_number));
 CREATE TABLE IF NOT EXISTS supplier_payments(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency='USD'),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),paid_date TEXT NOT NULL,payment_reference TEXT NOT NULL COLLATE NOCASE,reason TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(supplier,payment_reference));
 CREATE TABLE IF NOT EXISTS supplier_payment_allocations(payment_id INTEGER NOT NULL REFERENCES supplier_payments(id),invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),PRIMARY KEY(payment_id,invoice_id));
 CREATE TABLE IF NOT EXISTS supplier_payable_events(id INTEGER PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,event_type TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_payment_reversals(payment_id INTEGER PRIMARY KEY REFERENCES supplier_payments(id),reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS supplier_invoice_voids(invoice_id INTEGER PRIMARY KEY REFERENCES supplier_invoices(id),reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 for(const table of ['supplier_invoices','supplier_payments','supplier_payment_allocations','supplier_payable_events','supplier_payment_reversals','supplier_invoice_voids'])for(const operation of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Supplier payable history is immutable'); END;`);
}
payablesSchema();
function amount(value:unknown){
 if(typeof value!=='number'&&typeof value!=='string')throw Error('Số tiền USD không hợp lệ.');
 const raw=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(raw))throw Error('Số tiền USD phải dương và tối đa hai chữ số thập phân.');
 const n=Math.round(Number(raw)*100);if(!Number.isSafeInteger(n)||n<=0||n>100000000000)throw Error('Số tiền USD ngoài giới hạn.');return n;
}
function text(value:unknown,label:string){const s=String(value??'').trim();if(!s||s.length>1000)throw Error('Cần '+label+' (tối đa 1000 ký tự).');return s;}
function day(value:unknown){const s=String(value??'');const d=new Date(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Ngày phải hợp lệ theo YYYY-MM-DD.');return s;}
function event(user:AuthUser,type:string,id:number,action:string,reason:string,data:unknown){db.prepare('INSERT INTO supplier_payable_events(entity_type,entity_id,event_type,reason,actor_id,data_json) VALUES (?,?,?,?,?,?)').run(type,id,action,reason,user.id,JSON.stringify(data));}
function invoices(){return db.prepare(`SELECT i.*,CASE WHEN v.invoice_id IS NULL THEN 0 ELSE 1 END voided,COALESCE((SELECT SUM(a.amount_cents) FROM supplier_payment_allocations a LEFT JOIN supplier_payment_reversals r ON r.payment_id=a.payment_id WHERE a.invoice_id=i.id AND r.payment_id IS NULL),0) paid_cents FROM supplier_invoices i LEFT JOIN supplier_invoice_voids v ON v.invoice_id=i.id ORDER BY i.due_date,i.id`).all() as Row[];}
export function supplierPayables(user:AuthUser){
 if(!["ADMIN","BOD","FINANCE"].includes(user.role))throw Error("Chỉ BOD/Finance được xử lý Supplier Payables.");
 const items:(Row & {outstanding_cents:number;overdue:boolean})[]=invoices().map(i=>({...i,outstanding_cents:i.voided?0:Number(i.amount_cents)-Number(i.paid_cents),overdue:!i.voided&&Number(i.amount_cents)>Number(i.paid_cents)&&String(i.due_date)<localDay()}));
 return {currency:'USD',invoices:items,payments:db.prepare('SELECT p.*,r.reason reversal_reason,r.created_at reversed_at FROM supplier_payments p LEFT JOIN supplier_payment_reversals r ON r.payment_id=p.id ORDER BY p.id DESC').all(),allocations:db.prepare('SELECT * FROM supplier_payment_allocations ORDER BY payment_id,invoice_id').all(),events:db.prepare('SELECT * FROM supplier_payable_events ORDER BY id DESC LIMIT 500').all(),suppliers:[...new Set(items.map(i=>String(i.supplier)))].map(supplier=>({supplier,invoiced_cents:items.filter(i=>i.supplier===supplier&&!i.voided).reduce((s,i)=>s+Number(i.amount_cents),0),paid_cents:items.filter(i=>i.supplier===supplier).reduce((s,i)=>s+Number(i.paid_cents),0),outstanding_cents:items.filter(i=>i.supplier===supplier).reduce((s,i)=>s+i.outstanding_cents,0)}))};
}
export function supplierPayableAction(user:AuthUser,b:Row){
 if(!["ADMIN","BOD","FINANCE"].includes(user.role))throw Error("Chỉ BOD/Finance được xử lý Supplier Payables.");if(typeof b.request_key!=='string'||!b.request_key.trim())throw Error('Cần request_key để chống ghi trùng.');
 return moneyCommand('supplier-payables:'+user.id,b.request_key,b,()=>{
 const reason=text(b.reason,'lý do');
 if(b.action==='invoice'){
 const supplier=canonicalEnumValue('SUPPLIER',b.supplier);if(!supplier)throw Error('Cần Supplier.');
 if(b.currency!=='USD')throw Error('GĐ1 chỉ hỗ trợ USD.');
 const date=day(b.invoice_date),due=day(b.due_date);if(date>localDay()||due<date)throw Error('Ngày invoice không được ở tương lai; hạn trả không trước ngày invoice.');
 const id=Number(db.prepare('INSERT INTO supplier_invoices(supplier,invoice_number,currency,amount_cents,invoice_date,due_date,document_reference,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)').run(supplier,text(b.invoice_number,'số invoice'),'USD',amount(b.amount),date,due,text(b.document_reference,'tham chiếu chứng từ'),reason,user.id).lastInsertRowid);
 event(user,'INVOICE',id,'RECORDED',reason,b);return {id};
 }
 if(b.action==='payment'){
 const supplier=canonicalEnumValue('SUPPLIER',b.supplier,'',{allowInactive:true});if(!supplier)throw Error('Cần Supplier.');
 if(b.currency!=='USD')throw Error('GĐ1 chỉ hỗ trợ USD.');
 const paid=day(b.paid_date);if(paid>localDay())throw Error('Không ghi nhận đã thanh toán trong tương lai.');
 const total=amount(b.amount);if(!Array.isArray(b.allocations)||!b.allocations.length||b.allocations.length>200)throw Error('Chọn từ 1 đến 200 invoice để phân bổ.');
 const seen=new Set<number>();let allocated=0;
 const rows=(b.allocations as Row[]).map(a=>{
 const id=Number(a.invoice_id);if(!Number.isInteger(id)||seen.has(id))throw Error('Invoice trùng hoặc không hợp lệ.');seen.add(id);
 const invoice=invoices().find(i=>Number(i.id)===id);if(!invoice||invoice.supplier!==supplier||invoice.voided)throw Error('Invoice không thuộc Supplier hoặc đã hủy.');
 if(paid<String(invoice.invoice_date))throw Error('Ngày thanh toán không trước ngày invoice.');
 const n=amount(a.amount);if(n>Number(invoice.amount_cents)-Number(invoice.paid_cents))throw Error('Thanh toán vượt số còn phải trả.');allocated+=n;return {id,n};
 });
 if(allocated!==total)throw Error('Tổng phân bổ phải bằng số tiền thanh toán.');
 const id=Number(db.prepare('INSERT INTO supplier_payments(supplier,currency,amount_cents,paid_date,payment_reference,reason,created_by) VALUES (?,?,?,?,?,?,?)').run(supplier,'USD',total,paid,text(b.payment_reference,'tham chiếu thanh toán'),reason,user.id).lastInsertRowid);
 for(const row of rows)db.prepare('INSERT INTO supplier_payment_allocations VALUES (?,?,?)').run(id,row.id,row.n);
 event(user,'PAYMENT',id,'RECORDED',reason,b);return {id};
 }
 if(b.action==='reverse_payment'){
 const id=Number(b.payment_id);if(!db.prepare('SELECT id FROM supplier_payments WHERE id=?').get(id))throw Error('Không có thanh toán.');
 if(db.prepare('SELECT payment_id FROM supplier_payment_reversals WHERE payment_id=?').get(id))throw Error('Thanh toán đã đảo.');
 db.prepare('INSERT INTO supplier_payment_reversals(payment_id,reason,actor_id) VALUES (?,?,?)').run(id,reason,user.id);event(user,'PAYMENT',id,'REVERSED',reason,b);return {id};
 }
 if(b.action==='void_invoice'){
 const id=Number(b.invoice_id),invoice=invoices().find(i=>Number(i.id)===id);if(!invoice||invoice.voided||Number(invoice.paid_cents)!==0)throw Error('Chỉ hủy invoice chưa thanh toán; đảo thanh toán trước khi hủy.');
 db.prepare('INSERT INTO supplier_invoice_voids(invoice_id,reason,actor_id) VALUES (?,?,?)').run(id,reason,user.id);event(user,'INVOICE',id,'VOIDED',reason,b);return {id};
 }
 throw Error('Hành động không hợp lệ.');
 });
}
