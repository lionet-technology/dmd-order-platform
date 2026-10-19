import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {AuthUser} from './auth';
type Actor=Pick<AuthUser,'id'|'role'>;
type Row=Record<string,unknown>;
function integer(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>100_000_000_000)throw Error('Số tiền phải là integer cents hợp lệ.');return v;}
function required(v:unknown,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Cần lý do và request key hợp lệ.');return v.trim();}
/** Adjusts real application ledger Payments. Legacy Statement allocations require explicit migration. */
export class PaymentAdjustments {
 constructor(private db:Database.Database,private beforeWrite:(client:number)=>void=()=>{},private afterWrite:(client:number)=>void=()=>{}){
  db.exec(`CREATE TABLE IF NOT EXISTS payment_adjustment_events(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL REFERENCES ledger_entries(id),client_id INTEGER NOT NULL REFERENCES users(id),actor_id INTEGER NOT NULL REFERENCES users(id),previous_event_id INTEGER REFERENCES payment_adjustment_events(id),actual_cents INTEGER NOT NULL CHECK(actual_cents>=0),delta_cents INTEGER NOT NULL CHECK(delta_cents!=0),wallet_ledger_id INTEGER REFERENCES ledger_entries(id),reason TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE INDEX IF NOT EXISTS payment_adjustment_latest ON payment_adjustment_events(ledger_id,id);
  CREATE TABLE IF NOT EXISTS payment_adjustment_receipts(actor_id INTEGER NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(actor_id,request_key));
  CREATE TABLE IF NOT EXISTS payment_adjustment_notifications(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES payment_adjustment_events(id),recipient_id INTEGER NOT NULL REFERENCES users(id),UNIQUE(event_id,recipient_id));
  CREATE TABLE IF NOT EXISTS payment_adjustment_reads(notification_id INTEGER NOT NULL REFERENCES payment_adjustment_notifications(id),recipient_id INTEGER NOT NULL REFERENCES users(id),read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(notification_id,recipient_id));`);
  for(const table of ['payment_adjustment_events','payment_adjustment_receipts','payment_adjustment_notifications','payment_adjustment_reads'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Payment Adjustment history is immutable'); END;`);
  for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS adjusted_payment_immutable_${op} BEFORE ${op} ON ledger_entries WHEN EXISTS(SELECT 1 FROM payment_adjustment_events WHERE ledger_id=OLD.id OR wallet_ledger_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Payment Adjustment ledger is immutable'); END;`);
 }
 private access(user:Actor,id:number){const c=this.db.prepare("SELECT id,sales_user_id FROM users WHERE id=? AND role='CLIENT'").get(id) as {id:number;sales_user_id:number}|undefined;if(!c)throw Error('Client không tồn tại.');if(!['ADMIN','FINANCE','BOD'].includes(user.role)&&!(user.role==='CLIENT'&&user.id===id)&&!(user.role==='SALES'&&user.id===c.sales_user_id))throw Error('Forbidden');return c;}
 private payment(id:number){const p=this.db.prepare("SELECT * FROM ledger_entries WHERE id=? AND entry_type='PAYMENT' AND direction='CREDIT' AND client_user_id IS NOT NULL").get(id) as Row|undefined;if(!p)throw Error('Payment không tồn tại.');return p;}
 state(user:Actor,id:number){const p=this.payment(id);this.access(user,Number(p.client_user_id));const latest=this.db.prepare('SELECT id,actual_cents FROM payment_adjustment_events WHERE ledger_id=? ORDER BY id DESC LIMIT 1').get(id) as {id:number;actual_cents:number}|undefined;return {ledger_id:id,original_cents:Math.round(Number(p.amount)*100),actual_cents:latest?.actual_cents??Math.round(Number(p.amount)*100),adjustment_event_id:latest?.id??0};}
 adjust(user:Actor,b:Row){if(user.role!=='FINANCE')throw Error('Forbidden');return this.db.transaction(()=>{
  const key=required(b.request_key,200),reason=required(b.reason),id=integer(b.ledger_id),actual=integer(b.actual_cents),version=integer(b.expected_adjustment_event_id);
  const hash=createHash('sha256').update(JSON.stringify({id,actual,version,reason})).digest('hex');
  const old=this.db.prepare('SELECT * FROM payment_adjustment_receipts WHERE actor_id=? AND request_key=?').get(user.id,key) as Row|undefined;
  if(old){if(old.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(String(old.result_json)) as Row;}
  const p=this.payment(id),client=Number(p.client_user_id),c=this.access(user,client),state=this.state(user,id);
  if(state.adjustment_event_id!==version)throw Error('Payment đã được điều chỉnh. Tải lại trước khi ghi.');
  if(this.db.prepare('SELECT ledger_id FROM rejected_payments WHERE ledger_id=?').get(id))throw Error('Payment đã đảo.');
  this.beforeWrite(client);
  const allocations=this.db.prepare('SELECT * FROM credit_allocations WHERE ledger_id=? ORDER BY id').all(id) as Row[];
  if(allocations.some(a=>a.statement_id!==null))throw Error('Payment có allocation Statement legacy; cần đối chiếu migration trước khi điều chỉnh.');
  for(const a of allocations)if(!dbIsAllocationValid(a,this.db,client))throw Error('Debt allocation không hợp lệ hoặc khác Client.');
  const allocationsBefore=JSON.parse(JSON.stringify(allocations));
  const delta=actual-state.actual_cents;if(!delta)throw Error('Payment đã bằng thực nhận.');
  const allocated=allocations.reduce((n,a)=>n+Number(a.amount_cents),0);if(allocated>state.actual_cents)throw Error('Payment allocation không cân bằng.');
  // Freeze the original surplus: a future read must not allocate it again.
  this.db.prepare('INSERT OR IGNORE INTO credit_manual_allocations(ledger_id) VALUES (?)').run(id);
  let left=Math.abs(delta);const changes:Row[]=[];
  if(delta<0){left-=Math.min(left,state.actual_cents-allocated);
   // Reverse principal before interest, after consuming the Payment's own wallet portion.
   for(const part of ['principal','interest'])for(const a of [...allocations].reverse()){
    const available=part==='principal'?Number(a.amount_cents)-Number(a.interest_cents):Number(a.interest_cents),take=Math.min(left,available);if(!take)continue;
    a.amount_cents=Number(a.amount_cents)-take;if(part==='interest')a.interest_cents=Number(a.interest_cents)-take;left-=take;changes.push({debt_id:a.debt_id,part,reversed_cents:take});
   }
   if(left)throw Error('Payment reversal invariant failed.');
   for(const a of allocations)if(Number(a.amount_cents))this.db.prepare('UPDATE credit_allocations SET amount_cents=?,interest_cents=? WHERE id=?').run(a.amount_cents,a.interest_cents,a.id);else this.db.prepare('DELETE FROM credit_allocations WHERE id=?').run(a.id);
  }else{
   const debts=this.db.prepare(`SELECT d.id,d.amount_cents-COALESCE((SELECT SUM(amount_cents-interest_cents) FROM credit_allocations WHERE debt_id=d.id),0) principal,COALESCE((SELECT SUM(amount_cents) FROM debt_daily_interest WHERE debt_id=d.id),0)-COALESCE((SELECT SUM(interest_cents) FROM credit_allocations WHERE debt_id=d.id),0) interest FROM credit_debts d WHERE d.client_id=? ORDER BY d.id`).all(client) as {id:number;principal:number;interest:number}[];
   if(debts.filter(d=>d.principal+d.interest>0).length>1)throw Error('Nhiều Debt legacy; cần đối chiếu trước khi điều chỉnh.');
   for(const d of debts){const interest=Math.min(left,Math.max(0,d.interest)),principal=Math.min(left-interest,Math.max(0,d.principal));if(!interest&&!principal)continue;this.db.prepare('INSERT INTO credit_allocations(ledger_id,debt_id,amount_cents,interest_cents) VALUES (?,?,?,?)').run(id,d.id,interest+principal,interest);left-=interest+principal;changes.push({debt_id:d.id,interest_cents:interest,principal_cents:principal});}
  }
  // The full receipt delta belongs in the historical ledger. Existing Debt exclusion
  // offsets its allocated part in net Balance; writing only surplus double-counts Debt.
  const wallet=Number(this.db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'PAYMENT_ADJUSTMENT',?,?,?,'PAYMENT_ADJUSTMENT',?,?,?)").run(client,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),delta>0?'CREDIT':'DEBIT',Math.abs(delta)/100,p.customer,String(id),reason,user.id).lastInsertRowid);
  const event=Number(this.db.prepare('INSERT INTO payment_adjustment_events(ledger_id,client_id,actor_id,previous_event_id,actual_cents,delta_cents,wallet_ledger_id,reason,data_json) VALUES (?,?,?,?,?,?,?,?,?)').run(id,client,user.id,version||null,actual,delta,wallet,reason,JSON.stringify({previous_actual_cents:state.actual_cents,allocations_before:allocationsBefore,changes})).lastInsertRowid);
  this.afterWrite(client);
  this.db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,'PAYMENT_ADJUSTMENT',?)").run(client,user.id,JSON.stringify({ledger_id:id,event_id:event,actual_cents:actual,delta_cents:delta,changes,reason}));
  for(const recipient of new Set([c.id,c.sales_user_id].filter(Boolean)))this.db.prepare('INSERT INTO payment_adjustment_notifications(event_id,recipient_id) VALUES (?,?)').run(event,recipient);
  const result={ledger_id:id,adjustment_event_id:event,actual_cents:actual,delta_cents:delta};this.db.prepare('INSERT INTO payment_adjustment_receipts VALUES (?,?,?,?)').run(user.id,key,hash,JSON.stringify(result));return result;
 }).immediate();}
 history(user:Actor,id:number){this.state(user,id);return this.db.prepare('SELECT id,ledger_id,actual_cents,delta_cents,reason,created_at FROM payment_adjustment_events WHERE ledger_id=? ORDER BY id DESC').all(id);}
 notifications(user:Actor){return this.db.prepare('SELECT n.id,e.ledger_id,e.actual_cents,e.delta_cents,e.reason,e.created_at,EXISTS(SELECT 1 FROM payment_adjustment_reads r WHERE r.notification_id=n.id AND r.recipient_id=?) is_read FROM payment_adjustment_notifications n JOIN payment_adjustment_events e ON e.id=n.event_id WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 100').all(user.id,user.id);}
 acknowledge(user:Actor,id:number){if(!this.db.prepare('SELECT id FROM payment_adjustment_notifications WHERE id=? AND recipient_id=?').get(id,user.id))throw Error('Forbidden');this.db.prepare('INSERT OR IGNORE INTO payment_adjustment_reads(notification_id,recipient_id) VALUES (?,?)').run(id,user.id);return {id};}
}

function dbIsAllocationValid(a:Row,db:Database.Database,client:number){return Number.isSafeInteger(a.amount_cents)&&Number(a.amount_cents)>0&&Number.isSafeInteger(a.interest_cents)&&Number(a.interest_cents)>=0&&Number(a.interest_cents)<=Number(a.amount_cents)&&!!db.prepare('SELECT id FROM credit_debts WHERE id=? AND client_id=?').get(a.debt_id,client);}
