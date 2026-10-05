import { db } from "./db";
import type { AuthUser } from "./auth";
type Row = Record<string, unknown>;
export const cents = (v: unknown) => { const n=Number(v); if(!Number.isFinite(n)||n<0||n>1e9)throw Error("Số tiền không hợp lệ."); return Math.round(n*100); };
export const localDay = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export function validDay(v:unknown){const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)throw Error("Ngày phải là YYYY-MM-DD hợp lệ.");return s;}
export function shiftDay(s:string,n:number){const d=new Date(validDay(s)+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function creditSchema(){
 for(const [name,definition] of [["credit_limit_cents","INTEGER NOT NULL DEFAULT 0"],["credit_term_days","INTEGER NOT NULL DEFAULT 14"],["purchase_locked","INTEGER NOT NULL DEFAULT 0"],["purchase_lock_reason","TEXT"]]){
 if(!(db.prepare("PRAGMA table_info(users)").all() as Row[]).some(r=>r.name===name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
 }
 db.exec(`CREATE TABLE IF NOT EXISTS financial_audit(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,actor_id INTEGER,event TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS credit_statements(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),period_start TEXT NOT NULL,period_end TEXT NOT NULL,deadline TEXT NOT NULL,UNIQUE(client_id,period_start));
 CREATE TABLE IF NOT EXISTS credit_debts(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),source_statement_id INTEGER NOT NULL REFERENCES credit_statements(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),deadline TEXT NOT NULL,exclude_room INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS credit_items(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),ledger_id INTEGER NOT NULL UNIQUE REFERENCES ledger_entries(id),statement_id INTEGER NOT NULL REFERENCES credit_statements(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0));
 CREATE TABLE IF NOT EXISTS credit_allocations(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL REFERENCES ledger_entries(id),statement_id INTEGER REFERENCES credit_statements(id),debt_id INTEGER REFERENCES credit_debts(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),CHECK((statement_id IS NULL)!=(debt_id IS NULL)));
 CREATE TABLE IF NOT EXISTS purchase_reserves(order_id INTEGER PRIMARY KEY REFERENCES orders(id),client_id INTEGER NOT NULL REFERENCES users(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),status TEXT NOT NULL CHECK(status IN ('RESERVED','CHARGED','FAILED','CANCELLED')),actor_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS rejected_payments(ledger_id INTEGER PRIMARY KEY REFERENCES ledger_entries(id),reversal_id INTEGER NOT NULL UNIQUE REFERENCES ledger_entries(id),reason TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_credit_items_client ON credit_items(client_id);
 CREATE INDEX IF NOT EXISTS idx_credit_allocations_ledger ON credit_allocations(ledger_id);`);
}
creditSchema();
export function audit(clientId:number,actorId:number,event:string,data:unknown){db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,?,?)").run(clientId,actorId||null,event,JSON.stringify(data));}
export function assertClientAccess(user:AuthUser,clientId:number){
 const c=db.prepare("SELECT * FROM users WHERE id=? AND role='CLIENT'").get(clientId) as Row|undefined;
 if(!c)throw Error("Client không tồn tại.");
 if(user.role!=="ADMIN"&&!(user.role==="CLIENT"&&user.id===clientId)&&!(user.role==="SALES"&&Number(c.sales_user_id)===user.id))throw Error("Không có quyền với Client này.");return c;
}
export function requireAdmin(user:AuthUser){if(user.role!=="ADMIN")throw Error("Chỉ Admin có quyền thao tác này.");}
export function syncStatements(clientId:number){
 const client=db.prepare("SELECT credit_term_days FROM users WHERE id=?").get(clientId) as {credit_term_days:number};
 const entries=db.prepare("SELECT * FROM ledger_entries WHERE client_user_id=? AND direction='DEBIT' AND entry_type!='PAYMENT_REVERSAL'").all(clientId) as Row[];
 for(const e of entries){
 const existing=db.prepare("SELECT * FROM credit_items WHERE ledger_id=?").get(e.id) as Row|undefined;
 if(existing){const next=cents(e.amount);if(next!==Number(existing.amount_cents)){audit(clientId,0,"STATEMENT_ITEM_RECONCILED",{ledger_id:e.id,previous_cents:existing.amount_cents,next_cents:next});db.prepare("UPDATE credit_items SET amount_cents=? WHERE id=?").run(next,existing.id);}continue;}
 const day=String(e.occurred_at||e.created_at).slice(0,10);validDay(day);
 const weekday=new Date(day+"T00:00:00Z").getUTCDay(),start=shiftDay(day,-((weekday+6)%7)),end=shiftDay(start,6);
 db.prepare("INSERT OR IGNORE INTO credit_statements(client_id,period_start,period_end,deadline) VALUES (?,?,?,?)").run(clientId,start,end,shiftDay(end,client.credit_term_days));
 const statement=db.prepare("SELECT id FROM credit_statements WHERE client_id=? AND period_start=?").get(clientId,start) as {id:number};
 db.prepare("INSERT INTO credit_items(client_id,ledger_id,statement_id,amount_cents) VALUES (?,?,?,?)").run(clientId,e.id,statement.id,cents(e.amount));
 }
}
export function receivables(clientId:number){
 const debts=db.prepare(`SELECT d.*,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE debt_id=d.id),0) paid_cents FROM credit_debts d WHERE client_id=? ORDER BY deadline,id`).all(clientId) as Row[];
 const statements=db.prepare(`SELECT s.*,COALESCE((SELECT SUM(amount_cents) FROM credit_items WHERE statement_id=s.id),0)-COALESCE((SELECT SUM(amount_cents) FROM credit_debts WHERE source_statement_id=s.id),0) amount_cents,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE statement_id=s.id),0) paid_cents FROM credit_statements s WHERE client_id=? ORDER BY period_end,id`).all(clientId) as Row[];
 const state=(r:Row):Row & {outstanding_cents:number;status:string}=>({...r,outstanding_cents:Math.max(0,Number(r.amount_cents)-Number(r.paid_cents)),status:Number(r.amount_cents)<=Number(r.paid_cents)?"PAID":String(r.deadline)<localDay()?"OVERDUE":Number(r.paid_cents)>0?"PARTIALLY_PAID":"OPEN"});
 return {debts:debts.map(state),statements:statements.map(state)};
}
export function allocateFIFO(clientId:number){
 syncStatements(clientId);
 // Preserve explicit overrides; allocate only unallocated portions of live credits.
 const credits=db.prepare(`SELECT e.*,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE ledger_id=e.id),0) allocated FROM ledger_entries e WHERE client_user_id=? AND direction='CREDIT' AND id NOT IN (SELECT ledger_id FROM rejected_payments) ORDER BY COALESCE(occurred_at,created_at),id`).all(clientId) as Row[];
 for(const e of credits){let left=cents(e.amount)-Number(e.allocated);if(left<=0)continue;
 const r=receivables(clientId);const targets:Array<Row & {kind:string;outstanding_cents:number}>=[...r.debts.map(d=>({...d,kind:"debt"})),...r.statements.map(s=>({...s,kind:"statement"}))];
 for(const target of targets){const amount=Math.min(left,target.outstanding_cents);if(amount<=0)continue;
 db.prepare("INSERT INTO credit_allocations(ledger_id,statement_id,debt_id,amount_cents) VALUES (?,?,?,?)").run(e.id,target.kind==="statement"?target.id:null,target.kind==="debt"?target.id:null,amount);left-=amount;if(!left)break;}
 }
}
export function accountFinancials(clientId:number){return db.transaction(()=>{
 allocateFIFO(clientId);const r=receivables(clientId),c=db.prepare("SELECT credit_limit_cents,credit_term_days,purchase_locked,purchase_lock_reason FROM users WHERE id=?").get(clientId) as Row;
 const balance=Number((db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN ROUND(amount*100) ELSE -ROUND(amount*100) END),0) n FROM ledger_entries WHERE client_user_id=?").get(clientId) as {n:number}).n);
 const reserved=Number((db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM purchase_reserves WHERE client_id=? AND status='RESERVED'").get(clientId) as {n:number}).n);
 const excluded=r.debts.filter(d=>d.exclude_room).reduce((s,d)=>s+d.outstanding_cents,0);
 const available=balance+Number(c.credit_limit_cents)+excluded-reserved;
 const inactive=!(db.prepare("SELECT active FROM users WHERE id=?").get(clientId) as {active:number})?.active;
 const reasons=[...(inactive?["Client đã ngừng hoạt động"]:[]),...(c.purchase_locked?[String(c.purchase_lock_reason||"Account bị khóa mua")]:[]),...([...r.debts,...r.statements].some(d=>d.status==="OVERDUE")?["Công nợ quá hạn"]:[])];
 return {...c,...r,balance_cents:balance,reserved_cents:reserved,credit_used_cents:Math.max(0,-balance-excluded),available_to_buy_cents:available,purchase_blocked:reasons.length>0,reasons,allocations:db.prepare("SELECT a.* FROM credit_allocations a JOIN ledger_entries e ON e.id=a.ledger_id WHERE e.client_user_id=?").all(clientId)};
 }).immediate();}
export function purchaseJobAction(user:AuthUser,b:Row){return db.transaction(()=>{requireAdmin(user);const orderId=Number(b.order_id),r=db.prepare("SELECT * FROM purchase_reserves WHERE order_id=?").get(orderId) as Row|undefined;if(!r)throw Error("Purchase job không tồn tại.");if(b.action==='fail'){if(r.status==='FAILED')return r;if(r.status!=='RESERVED'||db.prepare("SELECT id FROM order_trackings WHERE order_id=?").get(orderId))throw Error("Job đã có tracking; xử lý bằng case.");if(!String(b.reason||'').trim())throw Error("Cần lý do thất bại.");db.prepare("UPDATE purchase_reserves SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(orderId);audit(Number(r.client_id),user.id,'PURCHASE_FAILED',b);}
 else if(b.action==='retry'){if(r.status==='RESERVED')return r;if(r.status!=='FAILED')throw Error("Chỉ retry job thất bại.");reservePurchase(orderId,Number(r.client_id),Number(r.amount_cents)/100,user.id);audit(Number(r.client_id),user.id,'PURCHASE_RETRY',b);}else throw Error("Action không hỗ trợ.");return db.prepare("SELECT * FROM purchase_reserves WHERE order_id=?").get(orderId);}).immediate();}
export function assertPurchasing(clientId:number,amount:number){const f=accountFinancials(clientId);if(f.purchase_blocked)throw Error(f.reasons.join("; "));if(f.available_to_buy_cents<cents(amount))throw Error("Balance / credit không đủ để mua dịch vụ.");}
export function reservePurchase(orderId:number,clientId:number,amount:number,actorId:number){assertPurchasing(clientId,amount);db.prepare("INSERT INTO purchase_reserves(order_id,client_id,amount_cents,status,actor_id) VALUES (?,?,?,'RESERVED',?) ON CONFLICT(order_id) DO UPDATE SET amount_cents=excluded.amount_cents,status='RESERVED',actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(orderId,clientId,cents(amount),actorId);audit(clientId,actorId,"PURCHASE_RESERVED",{orderId,amount});}
export function completeReserve(orderId:number,actorId:number){
 const r=db.prepare("SELECT * FROM purchase_reserves WHERE order_id=? AND status='RESERVED'").get(orderId) as Row|undefined;if(!r)return;
 const o=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Row;
 db.prepare("INSERT OR IGNORE INTO ledger_entries(occurred_at,entry_type,direction,amount,customer,client_user_id,reference_type,reference_id,note,created_by_user_id) VALUES (?,'ORDER_CHARGE','DEBIT',?,?,?,'ORDER',?,'Purchase completed',?)").run(localDay(),Number(r.amount_cents)/100,o.customer,o.client_user_id,String(orderId),actorId||null);
 db.prepare("UPDATE purchase_reserves SET status='CHARGED',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(orderId);audit(Number(o.client_user_id),actorId,"PURCHASE_CHARGED",{orderId});
}
export function financialAction(user:AuthUser,clientId:number,b:Row){return db.transaction(()=>{
 assertClientAccess(user,clientId);if(user.role==="CLIENT"||user.role==="WAREHOUSE")throw Error("Chỉ có quyền xem tài chính.");const action=String(b.action);
 if(action==="configure"){requireAdmin(user);const limit=cents(b.credit_limit),days=Number(b.credit_term_days);if(!Number.isInteger(days)||days<1||days>365)throw Error("Credit term từ 1 đến 365 ngày.");db.prepare("UPDATE users SET credit_limit_cents=?,credit_term_days=?,purchase_locked=?,purchase_lock_reason=? WHERE id=?").run(limit,days,b.purchase_locked?1:0,String(b.reason||""),clientId);}
 else if(action==="debt"){requireAdmin(user);allocateFIFO(clientId);const source=receivables(clientId).statements.find(s=>s.id===Number(b.statement_id));const amount=cents(b.amount);if(!source||amount<=0||amount>source.outstanding_cents)throw Error("Khoản nợ không được vượt phần chưa trả của kỳ.");db.prepare("INSERT INTO credit_debts(client_id,source_statement_id,amount_cents,deadline,exclude_room,reason) VALUES (?,?,?,?,?,?)").run(clientId,source.id,amount,validDay(b.deadline),b.exclude_room?1:0,String(b.reason||""));}
 else if(action==="extend_debt"){requireAdmin(user);if(!db.prepare("UPDATE credit_debts SET deadline=? WHERE id=? AND client_id=?").run(validDay(b.deadline),Number(b.debt_id),clientId).changes)throw Error("Debt không tồn tại.");}
 else if(action==="reject_payment"){requireAdmin(user);const e=db.prepare("SELECT * FROM ledger_entries WHERE id=? AND client_user_id=? AND entry_type='PAYMENT' AND direction='CREDIT'").get(Number(b.ledger_id),clientId) as Row|undefined;if(!e)throw Error("Payment không tồn tại.");if(db.prepare("SELECT ledger_id FROM rejected_payments WHERE ledger_id=?").get(e.id))return accountFinancials(clientId);if(!String(b.reason||"").trim())throw Error("Cần lý do reject.");const reverse=db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'PAYMENT_REVERSAL','DEBIT',?,?,'PAYMENT',?,?,?)").run(clientId,localDay(),e.amount,e.customer,String(e.id),String(b.reason),user.id);db.prepare("INSERT INTO rejected_payments VALUES (?,?,?)").run(e.id,reverse.lastInsertRowid,String(b.reason));db.prepare("DELETE FROM credit_allocations WHERE ledger_id=?").run(e.id);}
 else if(action==="allocate"){requireAdmin(user);allocateFIFO(clientId);const e=db.prepare("SELECT * FROM ledger_entries WHERE id=? AND client_user_id=? AND direction='CREDIT' AND id NOT IN (SELECT ledger_id FROM rejected_payments)").get(Number(b.ledger_id),clientId) as Row|undefined;if(!e||!Array.isArray(b.allocations))throw Error("Payment / allocation không hợp lệ.");db.prepare("DELETE FROM credit_allocations WHERE ledger_id=?").run(e.id);const r=receivables(clientId);let sum=0;const seen=new Set<string>();for(const a of b.allocations as Row[]){const debt=!!a.debt_id,target=(debt?r.debts:r.statements).find(t=>t.id===Number(debt?a.debt_id:a.statement_id)),n=cents(a.amount),key=(debt?"D":"S")+target?.id;if(!target||seen.has(key)||n<=0||n>target.outstanding_cents)throw Error("Allocation vượt khoản còn nợ hoặc bị trùng.");seen.add(key);sum+=n;if(sum>cents(e.amount))throw Error("Allocation vượt Payment.");db.prepare("INSERT INTO credit_allocations(ledger_id,statement_id,debt_id,amount_cents) VALUES (?,?,?,?)").run(e.id,debt?null:target.id,debt?target.id:null,n);}}
 else if(action==="additional_fee"){const amount=cents(b.unit_price)*Number(b.quantity??1);if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(amount)||Number(b.quantity??1)<=0)throw Error("Số lượng / giá không hợp lệ.");if(b.currency&&b.currency!=="USD")throw Error("Hiện dùng USD.");db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,note,created_by_user_id) VALUES (?,?,'ADDITIONAL_FEE','DEBIT',?,(SELECT display_name FROM users WHERE id=?),?,?)").run(clientId,validDay(b.occurred_at||localDay()),amount/100,clientId,String(b.note||"")+" · "+String(b.quantity??1)+" × "+String(b.unit_price)+" USD",user.id);}
 else throw Error("Action không được hỗ trợ.");audit(clientId,user.id,action,b);return accountFinancials(clientId);
 }).immediate();}
