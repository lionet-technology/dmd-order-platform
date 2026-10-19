import {PaymentAdjustments} from './payment-adjustments';
import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {AuthUser} from './auth';
type Actor=Pick<AuthUser,'id'|'role'>;
type Row=Record<string,unknown>;
function required(v:unknown,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Thông tin bắt buộc hoặc quá dài.');return v.trim();}
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}

/** Confirmation is evidence of reconciliation only. No wallet/allocation mutation. */
export class PaymentReconciliation {
 constructor(private db:Database.Database){
  new PaymentAdjustments(db);
  db.exec(`CREATE TABLE IF NOT EXISTS payment_reconciliation_events(
   id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL REFERENCES ledger_entries(id),client_id INTEGER NOT NULL REFERENCES users(id),
   status TEXT NOT NULL CHECK(status IN ('CONFIRMED','DISCREPANCY')),reason TEXT NOT NULL,
   actor_id INTEGER NOT NULL REFERENCES users(id),previous_event_id INTEGER REFERENCES payment_reconciliation_events(id),
   amount_cents INTEGER NOT NULL CHECK(amount_cents>0),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
   CREATE INDEX IF NOT EXISTS payment_reconciliation_latest ON payment_reconciliation_events(ledger_id,id);
   CREATE TABLE IF NOT EXISTS payment_reconciliation_receipts(actor_id INTEGER NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(actor_id,request_key));
   CREATE TABLE IF NOT EXISTS payment_reconciliation_notifications(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES payment_reconciliation_events(id),recipient_id INTEGER NOT NULL REFERENCES users(id),UNIQUE(event_id,recipient_id));
   CREATE TABLE IF NOT EXISTS payment_reconciliation_reads(notification_id INTEGER NOT NULL REFERENCES payment_reconciliation_notifications(id),recipient_id INTEGER NOT NULL REFERENCES users(id),read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(notification_id,recipient_id));`);
  if(!(db.prepare('PRAGMA table_info(payment_reconciliation_events)').all() as Row[]).some(c=>c.name==='actual_cents'))db.exec('ALTER TABLE payment_reconciliation_events ADD COLUMN actual_cents INTEGER CHECK(actual_cents>=0)');
  for(const table of ['payment_reconciliation_events','payment_reconciliation_receipts','payment_reconciliation_notifications','payment_reconciliation_reads'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Payment reconciliation audit is immutable'); END;`);
  for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS reconciled_payment_immutable_${op} BEFORE ${op} ON ledger_entries WHEN EXISTS(SELECT 1 FROM payment_reconciliation_events WHERE ledger_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Reconciled Payment is immutable; use Payment Adjustment'); END;`);
 }
 private access(user:Actor,client:number){
  const c=this.db.prepare("SELECT id,sales_user_id FROM users WHERE id=? AND role='CLIENT'").get(client) as {id:number;sales_user_id:number}|undefined;
  if(!c)throw Error('Client không tồn tại.');
  if(!['ADMIN','FINANCE','BOD'].includes(user.role)&&!(user.role==='CLIENT'&&user.id===client)&&!(user.role==='SALES'&&user.id===c.sales_user_id))throw Error('Forbidden');
  return c;
 }
 private latest(id:number){return this.db.prepare('SELECT * FROM payment_reconciliation_events WHERE ledger_id=? ORDER BY id DESC LIMIT 1').get(id) as Row|undefined;}
 batch(user:Actor,b:Row){
  if(user.role!=='FINANCE')throw Error('Forbidden');
  return this.db.transaction(()=>{
   const key=required(b.request_key,200),reason=required(b.reason),status=String(b.status);
   if(!['CONFIRMED','DISCREPANCY'].includes(status)||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>100)throw Error('Chọn 1–100 Payment và trạng thái hợp lệ.');
   const hash=createHash('sha256').update(JSON.stringify(canonical(b))).digest('hex');
   const old=this.db.prepare('SELECT * FROM payment_reconciliation_receipts WHERE actor_id=? AND request_key=?').get(user.id,key) as Row|undefined;
   if(old){if(old.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(String(old.result_json)) as {items:Row[]};}
   const seen=new Set<number>();
   const items=(b.rows as Row[]).map(row=>{
    const id=Number(row.ledger_id),version=Number(row.expected_event_id);
    if(!Number.isSafeInteger(id)||id<1||seen.has(id)||!Number.isSafeInteger(version)||version<0||row.expected_event_id===undefined)throw Error('Payment bị trùng hoặc thiếu phiên bản.');seen.add(id);
    const payment=this.db.prepare("SELECT id,client_user_id,amount FROM ledger_entries WHERE id=? AND entry_type='PAYMENT' AND direction='CREDIT'").get(id) as Row|undefined;
    if(!payment||!payment.client_user_id)throw Error('Payment phải thuộc Client hợp lệ.');
    const c=this.access(user,Number(payment.client_user_id));
    if(this.db.prepare('SELECT ledger_id FROM rejected_payments WHERE ledger_id=?').get(id))throw Error('Payment đã đảo; không xác nhận thực nhận.');
    const previous=this.latest(id);if(Number(previous?.id||0)!==version)throw Error('Payment đã được cập nhật. Tải lại trước khi xác nhận.');

    const amount=new PaymentAdjustments(this.db).state(user,id).actual_cents;
    if(previous?.status===status&&Number(previous.actual_cents??previous.amount_cents)===amount)throw Error('Payment đã có trạng thái này.');if(!Number.isSafeInteger(amount)||amount<0)throw Error('Số tiền Payment không hợp lệ.');
    const event=Number(this.db.prepare('INSERT INTO payment_reconciliation_events(ledger_id,client_id,status,reason,actor_id,previous_event_id,amount_cents,actual_cents) VALUES (?,?,?,?,?,?,?,?)').run(id,c.id,status,reason,user.id,previous?.id||null,Math.round(Number(payment.amount)*100),amount).lastInsertRowid);
    for(const recipient of new Set([c.id,c.sales_user_id]))this.db.prepare('INSERT INTO payment_reconciliation_notifications(event_id,recipient_id) VALUES (?,?)').run(event,recipient);
    this.db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,'PAYMENT_RECONCILIATION',?)").run(c.id,user.id,JSON.stringify({ledger_id:id,event_id:event,previous_event_id:previous?.id||null,status,reason,amount_cents:amount}));
    return {ledger_id:id,event_id:event,status};
   });
   const result={items};this.db.prepare('INSERT INTO payment_reconciliation_receipts VALUES (?,?,?,?)').run(user.id,key,hash,JSON.stringify(result));return result;
  }).immediate();
 }
 list(user:Actor,q:Row){
  if(!['ADMIN','FINANCE','BOD','SALES','CLIENT'].includes(user.role))throw Error('Forbidden');
  const where=["e.entry_type='PAYMENT'","e.direction='CREDIT'","c.role='CLIENT'"];const args:(string|number)[]=[];
  if(user.role==='SALES'){where.push('c.sales_user_id=?');args.push(user.id);}
  if(user.role==='CLIENT'){where.push('c.id=?');args.push(user.id);}
  if(q.client_id){this.access(user,Number(q.client_id));where.push('c.id=?');args.push(Number(q.client_id));}
  const status=String(q.status||'');if(status){if(!['PENDING','CONFIRMED','DISCREPANCY'].includes(status))throw Error('Trạng thái không hợp lệ.');where.push("COALESCE(r.status,'PENDING')=?");args.push(status);}
  const search=String(q.q||'').slice(0,200);if(search){where.push('(c.display_name LIKE ? OR e.reference_id LIKE ? OR CAST(e.id AS TEXT)=?)');args.push('%'+search+'%','%'+search+'%',search);}
  const requestedPage=Number(q.page||1);if(!Number.isSafeInteger(requestedPage)||requestedPage<1||requestedPage>1000000)throw Error('Trang không hợp lệ.');
  const from=' FROM ledger_entries e JOIN users c ON c.id=e.client_user_id LEFT JOIN payment_reconciliation_events r ON r.id=(SELECT MAX(x.id) FROM payment_reconciliation_events x WHERE x.ledger_id=e.id) WHERE '+where.join(' AND ');
  const total=(this.db.prepare('SELECT COUNT(*) n'+from).get(...args) as {n:number}).n,totalPages=Math.max(1,Math.ceil(total/50)),page=Math.min(requestedPage,totalPages);
  const items=this.db.prepare(`SELECT e.id ledger_id,c.id client_id,c.display_name,ROUND(e.amount*100) amount_cents,e.occurred_at,e.created_at,e.reference_id,e.note,COALESCE(r.status,'PENDING') status,COALESCE(r.id,0) event_id,COALESCE((SELECT a.actual_cents FROM payment_adjustment_events a WHERE a.ledger_id=e.id ORDER BY a.id DESC LIMIT 1),ROUND(e.amount*100)) actual_cents,COALESCE(r.actual_cents,r.amount_cents) reconciled_cents,r.reason,r.created_at reconciled_at,EXISTS(SELECT 1 FROM rejected_payments p WHERE p.ledger_id=e.id) reversed`+from+' ORDER BY e.id DESC LIMIT 50 OFFSET ?').all(...args,(page-1)*50);
  return {items,total,page,totalPages};
 }
 history(user:Actor,id:number){const payment=this.db.prepare("SELECT client_user_id FROM ledger_entries WHERE id=? AND entry_type='PAYMENT' AND direction='CREDIT'").get(id) as Row|undefined;if(!payment)throw Error('Payment không tồn tại.');this.access(user,Number(payment.client_user_id));return this.db.prepare('SELECT id,ledger_id,status,reason,previous_event_id,amount_cents,COALESCE(actual_cents,amount_cents) actual_cents,created_at FROM payment_reconciliation_events WHERE ledger_id=? ORDER BY id DESC').all(id);}
 notifications(user:Actor){return this.db.prepare(`SELECT n.id,e.ledger_id,e.client_id,e.status,e.reason,e.created_at,EXISTS(SELECT 1 FROM payment_reconciliation_reads r WHERE r.notification_id=n.id AND r.recipient_id=?) is_read FROM payment_reconciliation_notifications n JOIN payment_reconciliation_events e ON e.id=n.event_id WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 100`).all(user.id,user.id);}
 acknowledge(user:Actor,id:number){if(!this.db.prepare('SELECT id FROM payment_reconciliation_notifications WHERE id=? AND recipient_id=?').get(id,user.id))throw Error('Forbidden');this.db.prepare('INSERT OR IGNORE INTO payment_reconciliation_reads(notification_id,recipient_id) VALUES (?,?)').run(id,user.id);return {id};}
}
