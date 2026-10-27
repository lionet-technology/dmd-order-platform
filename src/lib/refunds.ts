import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {AuthUser} from './auth';

type Actor=Pick<AuthUser,'id'|'role'>;
type Row=Record<string,unknown>;
const categories=['SHIPPING_INCIDENT','RECONCILIATION_ERROR','LOST','DELAYED','PARAMETER_ADJUSTMENT','OTHER'];
const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
function required(v:unknown){if(typeof v!=='string'||!v.trim()||v.length>2000)throw Error('Thông tin bắt buộc, tối đa 2000 ký tự.');return v.trim();}
function amount(v:unknown,zero=false){if(!Number.isSafeInteger(v)||Number(v)<(zero?0:1)||Number(v)>100_000_000_000)throw Error('Số tiền phải là số nguyên cents hợp lệ.');return Number(v);}
export function refundUsdCents(v:unknown){const s=String(v??0);if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('USD tối đa hai số thập phân.');return amount(Math.round(Number(s)*100),true);}
function date(v:unknown){const s=required(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s||s>today())throw Error('Ngày thực chi không hợp lệ.');return s;}
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}

/** Refund obligations share the existing wallet ledger only at actual Balance payout/recovery.
 * No fc_* balance is enrolled, copied or written. All mutations use one immediate transaction. */
export class RefundService {
 constructor(private db:Database.Database){
  db.exec(`CREATE TABLE IF NOT EXISTS refund_events(
   id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('CLAIM_DECISION','TO_BALANCE','TO_BANK','RECOVERY')),
   delta_cents INTEGER NOT NULL,claim_id INTEGER REFERENCES operation_cases(id),category TEXT,
   obligation_cents INTEGER,refund_cents INTEGER,compensation_cents INTEGER,previous_category TEXT,previous_obligation_cents INTEGER,
   ledger_id INTEGER UNIQUE REFERENCES ledger_entries(id),actor_id INTEGER NOT NULL REFERENCES users(id),
   reason TEXT NOT NULL,reference TEXT,from_account TEXT,to_account TEXT,paid_date TEXT,proof TEXT,
   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
   CREATE INDEX IF NOT EXISTS refund_client_events ON refund_events(client_id,id);
   CREATE INDEX IF NOT EXISTS refund_claim_events ON refund_events(claim_id,id);
   CREATE TABLE IF NOT EXISTS refund_receipts(actor_id INTEGER NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(actor_id,request_key));
   CREATE TABLE IF NOT EXISTS refund_notifications(id INTEGER PRIMARY KEY,recipient_id INTEGER NOT NULL REFERENCES users(id),event_id INTEGER NOT NULL REFERENCES refund_events(id),UNIQUE(recipient_id,event_id));
   CREATE TABLE IF NOT EXISTS refund_notification_reads(notification_id INTEGER NOT NULL REFERENCES refund_notifications(id),recipient_id INTEGER NOT NULL REFERENCES users(id),read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(notification_id,recipient_id));`);
  for(const table of ['refund_events','refund_receipts','refund_notifications','refund_notification_reads'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Refund audit is immutable'); END;`);
  for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS refund_ledger_immutable_${op} BEFORE ${op} ON ledger_entries WHEN EXISTS(SELECT 1 FROM refund_events WHERE ledger_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Refund wallet posting is immutable'); END;`);
 }
 private client(user:Actor,id:number){
  const c=this.db.prepare("SELECT id,sales_user_id,display_name FROM users WHERE id=? AND role='CLIENT'").get(id) as {id:number;sales_user_id:number;display_name:string}|undefined;
  if(!c)throw Error('Client không tồn tại.');
  if(!['ADMIN','FINANCE','BOD'].includes(user.role)&&!(user.role==='CLIENT'&&user.id===id)&&!(user.role==='SALES'&&user.id===c.sales_user_id))throw Error('Forbidden');
  return c;
 }
 balance(id:number){const n=(this.db.prepare('SELECT COALESCE(SUM(delta_cents),0) n FROM refund_events WHERE client_id=?').get(id) as {n:number}).n;if(!Number.isSafeInteger(n))throw Error('Refund balance exceeds supported exact range');return n;}
 private legacy(id:number){return !!this.db.prepare(`SELECT d.id FROM claim_decisions d JOIN operation_case_orders co ON co.case_id=d.case_id JOIN orders o ON o.id=co.order_id WHERE o.client_user_id=? LIMIT 1`).get(id);}
 private ready(id:number){if(this.legacy(id))throw Error('Client có Claim theo cơ chế cũ; cần đối chiếu migration trước khi ghi Refund mới.');}
 private receipt<T>(user:Actor,b:Row,work:()=>T):T {
  return this.db.transaction(()=>{const key=required(b.request_key);if(key.length>200)throw Error('Request key tối đa 200 ký tự.');
   const hash=createHash('sha256').update(JSON.stringify(canonical(b))).digest('hex');
   const old=this.db.prepare('SELECT payload_hash,result_json FROM refund_receipts WHERE actor_id=? AND request_key=?').get(user.id,key) as {payload_hash:string;result_json:string}|undefined;
   if(old){if(old.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(old.result_json) as T;}
   const result=work();this.db.prepare('INSERT INTO refund_receipts VALUES (?,?,?,?)').run(user.id,key,hash,JSON.stringify(result));return result;
  }).immediate();
 }
 private notify(id:number,event:number){const c=this.db.prepare('SELECT sales_user_id FROM users WHERE id=?').get(id) as {sales_user_id:number};for(const recipient of new Set([id,c.sales_user_id]))this.db.prepare('INSERT INTO refund_notifications(recipient_id,event_id) VALUES (?,?)').run(recipient,event);}
 decide(user:Actor,b:Row){
  if(user.role!=='ADMIN')throw Error('Forbidden');
  return this.receipt(user,b,()=>{
   const claim=Number(b.case_id),c=this.db.prepare("SELECT kind FROM operation_cases WHERE id=?").get(claim) as {kind:string}|undefined;
   if(c?.kind!=='CLAIM')throw Error('Chọn Client Claim.');
   const owners=this.db.prepare('SELECT DISTINCT o.client_user_id FROM orders o JOIN operation_case_orders co ON co.order_id=o.id WHERE co.case_id=?').all(claim) as {client_user_id:number}[];
   if(owners.length!==1||!owners[0].client_user_id)throw Error('Claim phải thuộc một Client.');
   const id=owners[0].client_user_id;this.client(user,id);this.ready(id);
   const refund=amount(b.refund_cents,true),compensation=amount(b.compensation_cents,true),reason=required(b.reason),category=String(b.category||'OTHER');
   if(!categories.includes(category))throw Error('Phân loại Claim không hợp lệ.');
   const previous=this.db.prepare("SELECT * FROM refund_events WHERE claim_id=? AND kind='CLAIM_DECISION' ORDER BY id DESC LIMIT 1").get(claim) as Row|undefined;
   const obligation=refund+compensation;
   const event=Number(this.db.prepare("INSERT INTO refund_events(client_id,kind,delta_cents,claim_id,category,obligation_cents,refund_cents,compensation_cents,previous_category,previous_obligation_cents,actor_id,reason) VALUES (?,'CLAIM_DECISION',?,?,?,?,?,?,?,?,?,?)").run(id,obligation-Number(previous?.obligation_cents||0),claim,category,obligation,refund,compensation,previous?.category||null,Number(previous?.obligation_cents||0),user.id,reason).lastInsertRowid);
   this.notify(id,event);
   return {id:event,client_id:id,refund_balance_cents:this.balance(id),warnings:[] as string[]};
  });
 }
 execute(user:Actor,b:Row){
  const id=Number(b.client_id);this.client(user,id);
  if(b.action==='recover' ? user.role!=='ADMIN' : user.role!=='FINANCE')throw Error('Forbidden');
  if(!['to_balance','to_bank','recover'].includes(String(b.action)))throw Error('Action không hỗ trợ.');
  return this.receipt(user,b,()=>{
   this.ready(id);const cents=amount(b.amount_cents),reason=required(b.reason),before=this.balance(id),recovery=b.action==='recover';
   if(recovery&&cents>Math.max(0,-before))throw Error('Thu hồi vượt Refund Balance âm.');
   const reference=recovery?null:required(b.reference),bank=b.action==='to_bank';
   const from=bank?required(b.from_account):null,to=bank?required(b.to_account):null,paid=bank?date(b.paid_date):today(),proof=bank?required(b.proof):null;
   const warnings=!recovery&&cents>before?['Hoàn vượt nghĩa vụ hiện tại; Refund Balance sẽ âm.']:[];
   let ledgerId:number|null=null;
   if(!bank)ledgerId=Number(this.db.prepare(`INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id)
    VALUES (?,?,?,?,?,(SELECT display_name FROM users WHERE id=?),'REFUND_ACTUAL',?,?,?)`).run(id,today(),recovery?'ADJUSTMENT_DEBIT':'REFUND',recovery?'DEBIT':'CREDIT',cents/100,id,user.id+':'+required(b.request_key),reason,user.id).lastInsertRowid);
   const event=Number(this.db.prepare('INSERT INTO refund_events(client_id,kind,delta_cents,actor_id,reason,reference,from_account,to_account,paid_date,proof,ledger_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,recovery?'RECOVERY':bank?'TO_BANK':'TO_BALANCE',recovery?cents:-cents,user.id,reason,reference,from,to,paid,proof,ledgerId).lastInsertRowid);
   this.notify(id,event);
   return {id:event,refund_balance_cents:this.balance(id),warnings};
  });
 }
 batch(user:Actor,b:Row){
  if(user.role!=='FINANCE')throw Error('Forbidden');
  if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>100)throw Error('Chọn 1–100 dòng hoàn thực tế.');
  return this.receipt(user,b,()=>({items:(b.rows as Row[]).map((r,i)=>this.execute(user,{...r,request_key:required(b.request_key)+':'+i}))}));
 }
 overview(user:Actor){
  if(user.role==='WAREHOUSE')throw Error('Forbidden');
  return (this.db.prepare("SELECT id client_id,display_name FROM users WHERE role='CLIENT' ORDER BY display_name,id").all() as {client_id:number;display_name:string}[]).flatMap(c=>{try{this.client(user,c.client_id)}catch{return []}return [{...c,refund_balance_cents:this.balance(c.client_id),migration_required:this.legacy(c.client_id)}];});
 }
 history(user:Actor,id:number){this.client(user,id);const privateBank=['FINANCE','BOD'].includes(user.role);return (this.db.prepare('SELECT * FROM refund_events WHERE client_id=? ORDER BY id DESC').all(id) as Row[]).map(r=>{if(privateBank)return r;const {from_account:_,to_account:__,proof:___,...safe}=r;return safe;});}
 notifications(user:Actor){return this.db.prepare(`SELECT n.id,e.kind,e.client_id,e.delta_cents,e.reason,e.created_at,EXISTS(SELECT 1 FROM refund_notification_reads r WHERE r.notification_id=n.id AND r.recipient_id=?) is_read FROM refund_notifications n JOIN refund_events e ON e.id=n.event_id WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 100`).all(user.id,user.id);}
 acknowledge(user:Actor,id:number){if(!this.db.prepare('SELECT id FROM refund_notifications WHERE id=? AND recipient_id=?').get(id,user.id))throw Error('Forbidden');this.db.prepare('INSERT OR IGNORE INTO refund_notification_reads(notification_id,recipient_id) VALUES (?,?)').run(id,user.id);return {id};}
 report(user:Actor,start:string,end:string){
  if(!['BOD','FINANCE'].includes(user.role))throw Error('Forbidden');date(start);date(end);if(start>end)throw Error('Khoảng ngày không hợp lệ.');
  const clients=this.overview(user),from=start+'T00:00:00+07:00',until=new Date(Date.parse(end+'T00:00:00+07:00')+86400000).toISOString();
  const events=this.db.prepare('SELECT * FROM refund_events WHERE julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?) ORDER BY id').all(from,until) as Row[];
  const bank=this.db.prepare("SELECT * FROM refund_events WHERE kind='TO_BANK' AND paid_date BETWEEN ? AND ? ORDER BY id").all(start,end) as Row[];
  return {clients,incomplete_legacy_client_ids:clients.filter(c=>c.migration_required).map(c=>c.client_id),owes_clients_cents:clients.reduce((s,c)=>s+Math.max(0,c.refund_balance_cents),0),overpaid_clients_cents:clients.reduce((s,c)=>s+Math.max(0,-c.refund_balance_cents),0),
   bank_outflow_cents:bank.reduce((s,e)=>s-Number(e.delta_cents),0),bank_events:bank,
   balance_refund_cents:events.filter(e=>e.kind==='TO_BALANCE').reduce((s,e)=>s-Number(e.delta_cents),0),
   categories:categories.map(category=>({category,obligation_change_cents:events.filter(e=>e.kind==='CLAIM_DECISION').reduce((s,e)=>s+(e.category===category?Number(e.obligation_cents):0)-(e.previous_category===category?Number(e.previous_obligation_cents):0),0)})),events};
 }
}
