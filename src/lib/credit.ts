import { db } from "./db";
import {RefundService} from "./refunds";
import {statementJournalSchema} from "./statement-journal";
import { debtInterestSchema, accrueDebtInterest, snapshotDebt, debtInterestTotal, debtInterestRemaining } from "./debt-interest";
import {AUTO_ALLOCATABLE_TYPES} from "./transaction-taxonomy";
import {moneyCommand} from "./money-command";
import type { AuthUser } from "./auth";
type Row = Record<string, unknown>;
const settlementSql=AUTO_ALLOCATABLE_TYPES.map(t=>"'"+t+"'").join(",");
export const cents = (v: unknown) => { const n=Number(v); if(!Number.isFinite(n)||n<0||n>1e9)throw Error("Số tiền không hợp lệ."); return Math.round(n*100); };
export const localDay = (now:Date=new Date()) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
export function validDay(v:unknown){const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)throw Error("Ngày phải là YYYY-MM-DD hợp lệ.");return s;}
export function shiftDay(s:string,n:number){const d=new Date(validDay(s)+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function creditSchema(){
 for(const [name,definition] of [["credit_limit_cents","INTEGER NOT NULL DEFAULT 0"],["credit_term_days","INTEGER NOT NULL DEFAULT 14"],["purchase_locked","INTEGER NOT NULL DEFAULT 0"],["purchase_lock_reason","TEXT"]]){
 if(!(db.prepare("PRAGMA table_info(users)").all() as Row[]).some(r=>r.name===name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
 }
 db.exec(`CREATE TABLE IF NOT EXISTS financial_audit(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,actor_id INTEGER,event TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS credit_statements(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),period_start TEXT NOT NULL,period_end TEXT NOT NULL,deadline TEXT NOT NULL,UNIQUE(client_id,period_start));
 CREATE TABLE IF NOT EXISTS credit_debts(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),source_statement_id INTEGER REFERENCES credit_statements(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),deadline TEXT NOT NULL,exclude_room INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS credit_items(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),ledger_id INTEGER NOT NULL UNIQUE REFERENCES ledger_entries(id),statement_id INTEGER NOT NULL REFERENCES credit_statements(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0));
 CREATE TABLE IF NOT EXISTS credit_allocations(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL REFERENCES ledger_entries(id),statement_id INTEGER REFERENCES credit_statements(id),debt_id INTEGER REFERENCES credit_debts(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),CHECK((statement_id IS NULL)!=(debt_id IS NULL)));
 CREATE TABLE IF NOT EXISTS purchase_reserves(order_id INTEGER PRIMARY KEY REFERENCES orders(id),client_id INTEGER NOT NULL REFERENCES users(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),status TEXT NOT NULL CHECK(status IN ('RESERVED','CHARGED','FAILED','CANCELLED')),actor_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS rejected_payments(ledger_id INTEGER PRIMARY KEY REFERENCES ledger_entries(id),reversal_id INTEGER NOT NULL UNIQUE REFERENCES ledger_entries(id),reason TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_credit_items_client ON credit_items(client_id);
 CREATE INDEX IF NOT EXISTS idx_credit_allocations_ledger ON credit_allocations(ledger_id);`);
}
creditSchema();
export function statementSchema(){
for (const [table, columns] of Object.entries({
 credit_statements: { lifecycle: "TEXT NOT NULL DEFAULT 'OPEN'", issued_at: "TEXT" },
 credit_items: { item_type: "TEXT NOT NULL DEFAULT 'CHARGE'", original_statement_id: "INTEGER REFERENCES credit_statements(id)", original_occurred_at: "TEXT", adjustment_reason: "TEXT" },
 credit_debts: { source_type: "TEXT NOT NULL DEFAULT 'STATEMENT'", source_ref: "TEXT", balance_topup_cents: "INTEGER NOT NULL DEFAULT 0" }
})) for (const [name, definition] of Object.entries(columns)) {
 if (!(db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).some(r => r.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS credit_balance_debt_transfers(id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id),debt_id INTEGER NOT NULL REFERENCES credit_debts(id),actor_id INTEGER NOT NULL REFERENCES users(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),balance_before_cents INTEGER NOT NULL,balance_after_cents INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER IF NOT EXISTS immutable_balance_debt_transfer_update BEFORE UPDATE ON credit_balance_debt_transfers BEGIN SELECT RAISE(ABORT,'Debt transfers are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_balance_debt_transfer_delete BEFORE DELETE ON credit_balance_debt_transfers BEGIN SELECT RAISE(ABORT,'Debt transfers are immutable'); END;
CREATE TABLE IF NOT EXISTS credit_settlement_wallet_freezes(ledger_id INTEGER PRIMARY KEY REFERENCES ledger_entries(id),client_id INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS credit_debt_sources(id INTEGER PRIMARY KEY, debt_id INTEGER NOT NULL REFERENCES credit_debts(id), statement_id INTEGER NOT NULL REFERENCES credit_statements(id), amount_cents INTEGER NOT NULL CHECK(amount_cents>0));
CREATE TABLE IF NOT EXISTS credit_manual_allocations(ledger_id INTEGER PRIMARY KEY REFERENCES ledger_entries(id));
CREATE TABLE IF NOT EXISTS credit_statement_notes(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,ledger_id INTEGER NOT NULL UNIQUE REFERENCES ledger_entries(id),statement_id INTEGER NOT NULL REFERENCES credit_statements(id),amount_cents INTEGER NOT NULL,item_type TEXT NOT NULL,original_statement_id INTEGER REFERENCES credit_statements(id),original_occurred_at TEXT,adjustment_reason TEXT);
CREATE TRIGGER IF NOT EXISTS immutable_note_insert BEFORE INSERT ON credit_statement_notes WHEN (SELECT lifecycle FROM credit_statements WHERE id=NEW.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_note_update BEFORE UPDATE ON credit_statement_notes WHEN (SELECT lifecycle FROM credit_statements WHERE id=OLD.statement_id)='ISSUED' OR (SELECT lifecycle FROM credit_statements WHERE id=NEW.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_note_delete BEFORE DELETE ON credit_statement_notes WHEN (SELECT lifecycle FROM credit_statements WHERE id=OLD.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_statement_update BEFORE UPDATE ON credit_statements WHEN OLD.lifecycle='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable; use Claim'); END;
CREATE TRIGGER IF NOT EXISTS immutable_statement_delete BEFORE DELETE ON credit_statements WHEN OLD.lifecycle='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable; use Claim'); END;
CREATE TRIGGER IF NOT EXISTS immutable_item_insert BEFORE INSERT ON credit_items WHEN (SELECT lifecycle FROM credit_statements WHERE id=NEW.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable; use current adjustment'); END;
CREATE TRIGGER IF NOT EXISTS immutable_item_update BEFORE UPDATE ON credit_items WHEN (SELECT lifecycle FROM credit_statements WHERE id=OLD.statement_id)='ISSUED' OR (SELECT lifecycle FROM credit_statements WHERE id=NEW.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable; use Claim'); END;
CREATE TRIGGER IF NOT EXISTS immutable_item_delete BEFORE DELETE ON credit_items WHEN (SELECT lifecycle FROM credit_statements WHERE id=OLD.statement_id)='ISSUED' BEGIN SELECT RAISE(ABORT,'Issued statement is immutable; use Claim'); END;
CREATE TRIGGER IF NOT EXISTS immutable_credit_ledger_update BEFORE UPDATE OF amount,direction,client_user_id,occurred_at,entry_type,reference_type,reference_id ON ledger_entries WHEN EXISTS(SELECT 1 FROM credit_statement_notes n JOIN credit_statements s ON s.id=n.statement_id WHERE n.ledger_id=OLD.id AND s.lifecycle='ISSUED') BEGIN SELECT RAISE(ABORT,'Issued credit memo is immutable; use current adjustment'); END;
CREATE TRIGGER IF NOT EXISTS immutable_credit_ledger_delete BEFORE DELETE ON ledger_entries WHEN EXISTS(SELECT 1 FROM credit_statement_notes n JOIN credit_statements s ON s.id=n.statement_id WHERE n.ledger_id=OLD.id AND s.lifecycle='ISSUED') BEGIN SELECT RAISE(ABORT,'Issued credit memo is immutable; use current adjustment'); END;
CREATE TRIGGER IF NOT EXISTS immutable_issued_ledger_update BEFORE UPDATE OF amount,direction,client_user_id,occurred_at,entry_type,reference_type,reference_id ON ledger_entries WHEN (NEW.amount IS NOT OLD.amount OR NEW.direction IS NOT OLD.direction OR NEW.client_user_id IS NOT OLD.client_user_id OR NEW.occurred_at IS NOT OLD.occurred_at OR NEW.entry_type IS NOT OLD.entry_type OR NEW.reference_type IS NOT OLD.reference_type OR NEW.reference_id IS NOT OLD.reference_id) AND EXISTS(SELECT 1 FROM credit_items i JOIN credit_statements s ON s.id=i.statement_id WHERE i.ledger_id=OLD.id AND s.lifecycle='ISSUED') BEGIN SELECT RAISE(ABORT,'Issued charge is immutable; use Claim'); END;
CREATE TRIGGER IF NOT EXISTS immutable_issued_ledger_delete BEFORE DELETE ON ledger_entries WHEN EXISTS(SELECT 1 FROM credit_items i JOIN credit_statements s ON s.id=i.statement_id WHERE i.ledger_id=OLD.id AND s.lifecycle='ISSUED') BEGIN SELECT RAISE(ABORT,'Issued charge is immutable; use Claim'); END;`);
}
statementSchema();
debtInterestSchema();
new RefundService(db);
statementJournalSchema(db);
export function audit(clientId:number,actorId:number,event:string,data:unknown){db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,?,?)").run(clientId,actorId||null,event,JSON.stringify(data));}
export function assertClientAccess(user:AuthUser,clientId:number){
 const c=db.prepare("SELECT * FROM users WHERE id=? AND role='CLIENT'").get(clientId) as Row|undefined;
 if(!c)throw Error("Client không tồn tại.");
 if(user.role!=="ADMIN"&&!(user.role==="CLIENT"&&user.id===clientId)&&!(user.role==="SALES"&&Number(c.sales_user_id)===user.id))throw Error("Không có quyền với Client này.");return c;
}
export function requireAdmin(user:AuthUser){if(user.role!=="ADMIN")throw Error("Chỉ Admin có quyền thao tác này.");}
export function issueEndedStatements(today=localDay(),clientId?:number){return db.transaction(()=>{
 validDay(today);const pending=db.prepare("SELECT id,client_id,period_end FROM credit_statements WHERE lifecycle='OPEN' AND period_end<? AND (? IS NULL OR client_id=?)").all(today,clientId??null,clientId??null) as Row[];
 for(const r of pending){const issuedAt=shiftDay(String(r.period_end),1)+"T00:00:00+07:00";db.prepare("UPDATE credit_statements SET lifecycle='ISSUED',issued_at=? WHERE id=?").run(issuedAt,r.id);audit(Number(r.client_id),0,'STATEMENT_ISSUED',{statement_id:r.id,issued_at:issuedAt});}
}).immediate();}
export function syncStatements(clientId:number, today=localDay()){
 validDay(today);
 const client=db.prepare("SELECT credit_term_days FROM users WHERE id=?").get(clientId) as {credit_term_days:number};
 const period=(day:string)=>{const weekday=new Date(validDay(day)+"T00:00:00Z").getUTCDay();const start=shiftDay(day,-((weekday+6)%7));return {start,end:shiftDay(start,6)};};
 // Existing periods close before late postings; initial legacy materialization closes after snapshotting.
 const issue=()=>issueEndedStatements(today,clientId);
 issue();
 const entries=db.prepare("SELECT * FROM ledger_entries WHERE client_user_id=? AND direction='DEBIT' AND entry_type NOT IN ('PAYMENT_REVERSAL','SERVICE_COST','PAYMENT_ADJUSTMENT') AND NOT (entry_type='ADJUSTMENT_DEBIT' AND COALESCE(reference_type,'')='REFUND_ACTUAL') ORDER BY id").all(clientId) as Row[];
 const existingItem=db.prepare("SELECT i.*,s.lifecycle FROM credit_items i JOIN credit_statements s ON s.id=i.statement_id WHERE ledger_id=?");
 for(const e of entries){
 const existing=existingItem.get(e.id) as Row|undefined;
 if(existing){const next=cents(e.amount);if(next!==Number(existing.amount_cents)){if(existing.lifecycle==='ISSUED')throw Error('Issued statement disputed; open Claim.');audit(clientId,0,'STATEMENT_ITEM_RECONCILED',{ledger_id:e.id,previous_cents:existing.amount_cents,next_cents:next});db.prepare("UPDATE credit_items SET amount_cents=? WHERE id=?").run(next,existing.id);}continue;}
 const original=period(String(e.occurred_at||e.created_at).slice(0,10));
 const old=db.prepare("SELECT * FROM credit_statements WHERE client_id=? AND period_start=?").get(clientId,original.start) as Row|undefined;
 // Backdated new commands after an issued period always belong to the current period.
 const late=old?.lifecycle==='ISSUED'||(!old&&original.end<today&&!!db.prepare("SELECT id FROM credit_statements WHERE client_id=? AND lifecycle='ISSUED' LIMIT 1").get(clientId));const target=late?period(today):original;
 db.prepare("INSERT OR IGNORE INTO credit_statements(client_id,period_start,period_end,deadline) VALUES (?,?,?,?)").run(clientId,target.start,target.end,shiftDay(target.end,client.credit_term_days));
 const statement=db.prepare("SELECT id FROM credit_statements WHERE client_id=? AND period_start=?").get(clientId,target.start) as {id:number};
 db.prepare("INSERT INTO credit_items(client_id,ledger_id,statement_id,amount_cents,item_type,original_statement_id,original_occurred_at,adjustment_reason) VALUES (?,?,?,?,?,?,?,?)").run(clientId,e.id,statement.id,cents(e.amount),late?'PRIOR_PERIOD_ADJUSTMENT':'CHARGE',late?old?.id||null:null,late?String(e.occurred_at||e.created_at):null,late?String(e.note||'Late posting')+' · Original period '+original.start+' → '+original.end:null);
 if(late)audit(clientId,0,'PRIOR_PERIOD_ADJUSTMENT',{ledger_id:e.id,original_statement_id:old?.id||null,original_period:original,original_occurred_at:e.occurred_at,reason:e.note||'Late posting',statement_id:statement.id});
 }
 const credits=db.prepare("SELECT e.* FROM ledger_entries e WHERE client_user_id=? AND direction='CREDIT' AND entry_type NOT IN ('PAYMENT','OFFSET','SERVICE_SETTLEMENT','PAYMENT_ADJUSTMENT') AND NOT EXISTS(SELECT 1 FROM credit_statement_notes n WHERE n.ledger_id=e.id) ORDER BY e.id").all(clientId) as Row[];
 for(const e of credits){const day=String(e.occurred_at||e.created_at).slice(0,10),original=period(day);const old=db.prepare('SELECT * FROM credit_statements WHERE client_id=? AND period_start=?').get(clientId,original.start) as Row|undefined;const late=old?.lifecycle==='ISSUED'||original.end<today;const target=late?period(today):original;
 db.prepare('INSERT OR IGNORE INTO credit_statements(client_id,period_start,period_end,deadline) VALUES (?,?,?,?)').run(clientId,target.start,target.end,shiftDay(target.end,client.credit_term_days));const st=db.prepare('SELECT id FROM credit_statements WHERE client_id=? AND period_start=?').get(clientId,target.start) as Row;
 db.prepare('INSERT INTO credit_statement_notes(client_id,ledger_id,statement_id,amount_cents,item_type,original_statement_id,original_occurred_at,adjustment_reason) VALUES (?,?,?,?,?,?,?,?)').run(clientId,e.id,st.id,cents(e.amount),late?'PRIOR_PERIOD_ADJUSTMENT':String(e.entry_type),late?old?.id||null:null,late?String(e.occurred_at||e.created_at):null,String(e.note||'Credit memo; allocation separate'));
 if(late)audit(clientId,0,'PRIOR_PERIOD_CREDIT_MEMO',{ledger_id:e.id,original_period:original,original_statement_id:old?.id||null,original_occurred_at:e.occurred_at||e.created_at,reason:e.note||'Credit memo',statement_id:st.id});
 }
 issue();
}
export function shippingChargeCents(orderIds:number[]){
 if(!orderIds.length)return 0;const placeholders=orderIds.map(()=>'?').join(','),refs=orderIds.map(String);
 const weights=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weight_adjustments'").get();
 const extra=weights?` OR (entry_type='WEIGHT_ADJUSTMENT' AND reference_type='WEIGHT_ADJUSTMENT' AND reference_id IN (SELECT CAST(id AS TEXT) FROM weight_adjustments WHERE order_id IN (${placeholders})))`:'';
 return Number((db.prepare(`SELECT COALESCE(SUM(ROUND(amount*100)),0) n FROM ledger_entries WHERE direction='DEBIT' AND ((entry_type IN ('ORDER_CHARGE','PURCHASE_DELTA') AND reference_type='ORDER' AND reference_id IN (${placeholders})) OR (entry_type='PRIOR_PERIOD_ADJUSTMENT' AND reference_type='ORDER_RECONCILIATION' AND reference_id IN (${placeholders}))${extra})`).get(...refs,...refs,...(weights?orderIds:[])) as {n:number}).n);
}
export function statementOrderIds(statementId:number){const weightJoin=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weight_adjustments'").get()?" OR (e.reference_type='WEIGHT_ADJUSTMENT' AND EXISTS(SELECT 1 FROM weight_adjustments w WHERE w.order_id=o.id AND CAST(w.id AS TEXT)=e.reference_id))":"";return (db.prepare("SELECT DISTINCT o.id FROM credit_items i JOIN ledger_entries e ON e.id=i.ledger_id JOIN orders o ON (e.reference_type IN ('ORDER','ORDER_RECONCILIATION') AND e.reference_id=CAST(o.id AS TEXT)) OR (e.reference_type='TRACKING' AND EXISTS(SELECT 1 FROM order_trackings t WHERE t.order_id=o.id AND t.tracking=e.reference_id))"+weightJoin+" OR (e.reference_type='LOT_RECONCILIATION' AND EXISTS(SELECT 1 FROM order_lots l WHERE l.order_id=o.id AND CAST(l.id AS TEXT)=e.reference_id)) WHERE i.statement_id=? ORDER BY o.id").all(statementId) as {id:number}[]).map(o=>o.id);}
export function receivables(clientId:number){
 const debts=db.prepare(`SELECT d.*,s.period_start source_period_start,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE debt_id=d.id),0) paid_cents FROM credit_debts d LEFT JOIN credit_statements s ON s.id=d.source_statement_id WHERE d.client_id=? ORDER BY d.created_at,d.id`).all(clientId) as Row[];
 const statements=db.prepare(`SELECT s.*,COALESCE((SELECT SUM(amount_cents) FROM credit_items WHERE statement_id=s.id),0) original_total_cents,COALESCE((SELECT SUM(amount_cents) FROM credit_items WHERE statement_id=s.id),0)-COALESCE((SELECT SUM(d.amount_cents-d.balance_topup_cents-COALESCE((SELECT SUM(x.amount_cents) FROM credit_debt_sources x WHERE x.debt_id=d.id),0)) FROM credit_debts d WHERE d.source_statement_id=s.id),0)-COALESCE((SELECT SUM(amount_cents) FROM credit_debt_sources WHERE statement_id=s.id),0) amount_cents,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE statement_id=s.id),0) paid_cents FROM credit_statements s WHERE client_id=? ORDER BY period_end,id`).all(clientId) as Row[];
 const state=(r:Row):Row & {outstanding_cents:number;status:string}=>({...r,outstanding_cents:Math.max(0,Number(r.amount_cents)-Number(r.paid_cents)),status:Number(r.amount_cents)<=Number(r.paid_cents)?"PAID":String(r.deadline)<localDay()?"OVERDUE":Number(r.paid_cents)>0?"PARTIALLY_PAID":"OPEN"});
 return {debts:debts.map(d=>{const interest=debtInterestTotal(Number(d.id));return {...state({...d,amount_cents:Number(d.amount_cents)+interest}),id:d.id,deadline:d.deadline,amount_cents:Number(d.amount_cents)+interest,principal_cents:Number(d.amount_cents),interest_cents:interest,interest_outstanding_cents:debtInterestRemaining(Number(d.id))};}),statements:statements.map(r=>Object.assign(state(r),{order_ids:statementOrderIds(Number(r.id))}))};
}
export function allocateFIFO(clientId:number){return db.transaction(()=>{
 syncStatements(clientId);
 accrueDebtInterest(clientId);
 for(const debt of receivables(clientId).debts)snapshotDebt(Number(debt.id));
 // Preserve explicit overrides; allocate only unallocated portions of live credits.
 const credits=db.prepare(`SELECT e.*,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE ledger_id=e.id),0) allocated FROM ledger_entries e WHERE client_user_id=? AND direction='CREDIT' AND entry_type IN (${settlementSql}) AND id NOT IN (SELECT ledger_id FROM credit_manual_allocations) AND id NOT IN (SELECT ledger_id FROM credit_settlement_wallet_freezes) AND id NOT IN (SELECT CAST(json_extract(data_json,'$.ledger_id') AS INTEGER) FROM financial_audit WHERE event IN ('allocate','apply_credit') AND json_valid(data_json) AND json_extract(data_json,'$.ledger_id') IS NOT NULL) AND id NOT IN (SELECT ledger_id FROM rejected_payments) ORDER BY id`).all(clientId) as Row[];
 for(const e of credits){let left=cents(e.amount)-Number(e.allocated);if(left<=0)continue;
 // Statements are periodic reports, never payment targets; only Debt receives allocations.
 const debts=receivables(clientId).debts.sort((a,b)=>String(a.deadline).localeCompare(String(b.deadline))||Number(a.id)-Number(b.id));
 for(const debt of debts){const amount=Math.min(left,debt.outstanding_cents);if(amount<=0)continue;
 db.prepare("INSERT INTO credit_allocations(ledger_id,statement_id,debt_id,amount_cents,interest_cents) VALUES (?,NULL,?,?,?)").run(e.id,debt.id,amount,Math.min(amount,debtInterestRemaining(Number(debt.id))));snapshotDebt(Number(debt.id));left-=amount;if(!left)break;}
 // A receipt surplus is Balance from this posting onward. Restoring Debt later
 // (e.g. an actual-receipt reduction) must not consume older wallet surplus.
 if(left>0)db.prepare('INSERT OR IGNORE INTO credit_settlement_wallet_freezes(ledger_id,client_id,reason) VALUES (?,?,?)').run(e.id,clientId,'Posted Payment surplus retained in Balance');
 }
 }).immediate();}
export function accountFinancials(clientId:number){return db.transaction(()=>{
 allocateFIFO(clientId);const r=receivables(clientId),c=db.prepare("SELECT credit_limit_cents,credit_term_days,purchase_locked,purchase_lock_reason FROM users WHERE id=?").get(clientId) as Row;
 const balance=Number((db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN ROUND(amount*100) ELSE -ROUND(amount*100) END),0) n FROM ledger_entries WHERE client_user_id=? AND entry_type!='SERVICE_COST'").get(clientId) as {n:number}).n);
 const reserved=Number((db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM purchase_reserves WHERE client_id=? AND status='RESERVED'").get(clientId) as {n:number}).n);
 const excluded=r.debts.reduce((s,d)=>s+d.outstanding_cents-Number(d.interest_cents),0);
 // Ledger balance retains historical charges; restructured principal is excluded exactly once.
 const netBalance=balance+excluded;
 const available=netBalance+Number(c.credit_limit_cents)-reserved;
 const inactive=!(db.prepare("SELECT active FROM users WHERE id=?").get(clientId) as {active:number})?.active;
 const reasons=[...(inactive?["Client đã ngừng hoạt động"]:[]),...(available<0?["Balance / credit không đủ"]:[]),...(c.purchase_locked?[String(c.purchase_lock_reason||"Account bị khóa mua")]:[]),...(r.debts.some(d=>d.status==="OVERDUE")?["Debt quá hạn"]:[])];
 // Statement totals already hit the ledger at the service charge event; do not count them as a second AR.
 const receivable=Math.max(0,-netBalance)+r.debts.reduce((n,d)=>n+d.outstanding_cents,0);
 const transactions=db.prepare("SELECT e.*,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE ledger_id=e.id),0) allocated_cents,EXISTS(SELECT 1 FROM rejected_payments WHERE ledger_id=e.id) rejected FROM ledger_entries e WHERE client_user_id=? ORDER BY e.id DESC").all(clientId);
 const items=[...db.prepare("SELECT *, 'DEBIT' direction FROM credit_items WHERE client_id=? ORDER BY id DESC").all(clientId),...db.prepare("SELECT *, 'CREDIT' direction FROM credit_statement_notes WHERE client_id=? ORDER BY id DESC").all(clientId)];
 const legacy_allocations=db.prepare("SELECT a.* FROM credit_allocations a JOIN ledger_entries e ON e.id=a.ledger_id WHERE e.client_user_id=? AND e.entry_type NOT IN ('PAYMENT','OFFSET','SERVICE_SETTLEMENT') AND e.id NOT IN (SELECT ledger_id FROM credit_manual_allocations)").all(clientId);
 return {...c,...r,transactions,items,legacy_allocations,receivable_cents:receivable,purchasing_balance_cents:Math.max(0,netBalance),balance_cents:balance,net_balance_cents:netBalance,reserved_cents:reserved,credit_used_cents:Math.max(0,-balance-excluded),available_to_buy_cents:Math.max(0,available),purchase_blocked:reasons.length>0,reasons,allocations:db.prepare("SELECT a.* FROM credit_allocations a JOIN ledger_entries e ON e.id=a.ledger_id WHERE e.client_user_id=?").all(clientId)};
 }).immediate();}
export function purchaseJobAction(user:AuthUser,b:Row){return db.transaction(()=>{requireAdmin(user);const orderId=Number(b.order_id),r=db.prepare("SELECT * FROM purchase_reserves WHERE order_id=?").get(orderId) as Row|undefined;if(!r)throw Error("Purchase job không tồn tại.");if(b.action==='fail'){if(r.status==='FAILED')return r;if(r.status!=='RESERVED'||db.prepare("SELECT id FROM order_trackings WHERE order_id=?").get(orderId))throw Error("Job đã có tracking; xử lý bằng case.");if(!String(b.reason||'').trim())throw Error("Cần lý do thất bại.");db.prepare("UPDATE purchase_reserves SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(orderId);audit(Number(r.client_id),user.id,'PURCHASE_FAILED',b);}
 else if(b.action==='retry'){if(r.status==='RESERVED')return r;if(r.status!=='FAILED')throw Error("Chỉ retry job thất bại.");reservePurchase(orderId,Number(r.client_id),Number(r.amount_cents)/100,user.id);audit(Number(r.client_id),user.id,'PURCHASE_RETRY',b);}else throw Error("Action không hỗ trợ.");return db.prepare("SELECT * FROM purchase_reserves WHERE order_id=?").get(orderId);}).immediate();}
export function assertPurchasing(clientId:number,amount:number){const f=accountFinancials(clientId);if(f.purchase_blocked)throw Error(f.reasons.join("; "));if(f.available_to_buy_cents<cents(amount))throw Error("Balance / credit không đủ để mua dịch vụ.");}
export function reservePurchase(orderId:number,clientId:number,amount:number,actorId:number){const existing=db.prepare("SELECT status FROM purchase_reserves WHERE order_id=?").get(orderId) as Row|undefined;if(existing&&!["FAILED","RESERVED"].includes(String(existing.status)))throw Error("Purchase đã hoàn tất hoặc bị hủy.");assertPurchasing(clientId,amount);db.prepare("INSERT INTO purchase_reserves(order_id,client_id,amount_cents,status,actor_id) VALUES (?,?,?,'RESERVED',?) ON CONFLICT(order_id) DO UPDATE SET amount_cents=excluded.amount_cents,status='RESERVED',actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(orderId,clientId,cents(amount),actorId);audit(clientId,actorId,"PURCHASE_RESERVED",{orderId,amount});}
export function completeReserve(orderId:number,actorId:number){return db.transaction(()=>{
 const r=db.prepare("SELECT * FROM purchase_reserves WHERE order_id=? AND status='RESERVED'").get(orderId) as Row|undefined;if(!r)return;
 const o=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Row;
 if(Number(o.client_user_id)!==Number(r.client_id))throw Error('Reserve Client mismatch.');
 const actual=cents(o.total_due);
 const previous=db.prepare("SELECT id,amount,client_user_id FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND reference_type='ORDER' AND reference_id=?").get(String(orderId)) as Row|undefined;if(previous&&Number(previous.client_user_id)!==Number(r.client_id))throw Error("Charge Client mismatch.");
 if(previous){const delta=actual-cents(previous.amount);if(delta>0)db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'PURCHASE_DELTA','DEBIT',?,?,'ORDER',?,'Mandatory approved completion delta',?)").run(o.client_user_id,localDay(),delta/100,o.customer,String(orderId),actorId||null);else if(delta<0)audit(Number(o.client_user_id),actorId,'PURCHASE_LOWER_ACTUAL_CLAIM_REQUIRED',{orderId,previous_cents:cents(previous.amount),actual_cents:actual});}
 if(!previous)db.prepare("INSERT INTO ledger_entries(occurred_at,entry_type,direction,amount,customer,client_user_id,reference_type,reference_id,note,created_by_user_id) VALUES (?,'ORDER_CHARGE','DEBIT',?,?,?,'ORDER',?,'Purchase completed',?)").run(localDay(),actual/100,o.customer,o.client_user_id,String(orderId),actorId||null);
 db.prepare("UPDATE purchase_reserves SET status='CHARGED',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(orderId);audit(Number(o.client_user_id),actorId,"PURCHASE_CHARGED",{orderId,reserved_cents:r.amount_cents,actual_cents:actual,delta_cents:actual-Number(r.amount_cents)});
}).immediate();}
export function financialAction(user:AuthUser,clientId:number,b:Row){
 assertClientAccess(user,clientId);if(!["ADMIN","SALES"].includes(user.role))throw Error("Chỉ có quyền xem tài chính.");
 if(String(b.action)!=="additional_fee")requireAdmin(user);
 if(["allocate","apply_credit"].includes(String(b.action)))throw Error("Phân bổ thủ công đã ngừng: Payment tự trả Debt lãi rồi gốc, dư vào Balance; Finance dùng Payment Adjustment.");
 if(b.action==="balance_credit"&&!String(b.request_key||"").trim())throw Error("Balance Adjustment cần request key.");
 return moneyCommand("financial:"+user.id+":"+clientId,b.request_key,b,()=>financialActionOnce(user,clientId,b));
}
function financialActionOnce(user:AuthUser,clientId:number,b:Row){return db.transaction(()=>{
 assertClientAccess(user,clientId);if(user.role==="CLIENT"||user.role==="WAREHOUSE")throw Error("Chỉ có quyền xem tài chính.");const action=String(b.action);let auditData=b;
 if(action==="configure"){requireAdmin(user);const limit=cents(b.credit_limit),days=Number(b.credit_term_days);if(!Number.isInteger(days)||days<1||days>365)throw Error("Credit term từ 1 đến 365 ngày.");db.prepare("UPDATE users SET credit_limit_cents=?,credit_term_days=?,purchase_locked=?,purchase_lock_reason=? WHERE id=?").run(limit,days,b.purchase_locked?1:0,String(b.reason||""),clientId);}
 else if(action==="debt"){requireAdmin(user);allocateFIFO(clientId);const amount=cents(b.amount),reason=String(b.reason||'').trim();if(amount<=0||!reason)throw Error('Cần số tiền chuyển Debt và lý do hợp lệ.');
 const financials=accountFinancials(clientId);if(amount>Math.max(0,-financials.net_balance_cents))throw Error('Chỉ được chuyển phần Balance ròng đang âm; Reserve không phải khoản nợ.');
 const accounts=receivables(clientId).debts;if(accounts.length>1)throw Error('Có nhiều Debt legacy của Client; cần đối chiếu trước khi tiếp tục.');const existing=accounts[0];
 const deadline=validDay(b.deadline);if(deadline<localDay()||(existing&&existing.outstanding_cents>0&&deadline<String(existing.deadline)))throw Error('Deadline mới không được lùi hoặc đã quá hạn.');
 // Prior unallocated Payment surplus is already in Balance. A later debt transfer must not retroactively consume it.
 const priorSurplus=db.prepare(`SELECT e.id FROM ledger_entries e WHERE e.client_user_id=? AND e.direction='CREDIT' AND e.entry_type IN (${settlementSql}) AND ROUND(e.amount*100)>COALESCE((SELECT SUM(a.amount_cents) FROM credit_allocations a WHERE a.ledger_id=e.id),0) AND e.id NOT IN (SELECT ledger_id FROM rejected_payments)`).all(clientId) as {id:number}[];
 const freeze=db.prepare('INSERT OR IGNORE INTO credit_settlement_wallet_freezes(ledger_id,client_id,reason) VALUES (?,? ,?)');for(const row of priorSurplus)freeze.run(row.id,clientId,'Balance surplus before manual Debt conversion');
 let debtId:number;if(existing){debtId=Number(existing.id);db.prepare('UPDATE credit_debts SET amount_cents=amount_cents+?,balance_topup_cents=balance_topup_cents+?,deadline=?,exclude_room=1 WHERE id=? AND client_id=?').run(amount,amount,deadline,debtId,clientId);}
 else {const schema=db.prepare('PRAGMA table_info(credit_debts)').all() as Row[];if(Number(schema.find(x=>x.name==='source_statement_id')?.notnull||0))throw Error('DB demo legacy cần migration/reset có kiểm soát trước khi chuyển Balance sang Debt; không tạo Statement giả.');const result=db.prepare("INSERT INTO credit_debts(client_id,source_statement_id,amount_cents,deadline,exclude_room,reason,source_type,source_ref,balance_topup_cents) VALUES (?,NULL,?,?,1,?,'BALANCE','BALANCE',?)").run(clientId,amount,deadline,reason,amount);debtId=Number(result.lastInsertRowid);}
 snapshotDebt(debtId,b.daily_rate_pct,user.id,reason);const after=accountFinancials(clientId);
 if(after.net_balance_cents!==financials.net_balance_cents+amount)throw Error('Balance/Debt conservation failed; chuyển đổi đã rollback.');
 db.prepare('INSERT INTO credit_balance_debt_transfers(client_id,debt_id,actor_id,amount_cents,balance_before_cents,balance_after_cents,reason) VALUES (?,?,?,?,?,?,?)').run(clientId,debtId,user.id,amount,financials.net_balance_cents,after.net_balance_cents,reason);
 auditData={action:'debt',debt_id:debtId,amount_cents:amount,balance_before_cents:financials.net_balance_cents,balance_after_cents:after.net_balance_cents,deadline,reason,previous_deadline:existing?.deadline||null,frozen_prior_surplus_payment_ids:priorSurplus.map(e=>e.id)};}
 else if(action==="extend_debt"){requireAdmin(user);const debt=receivables(clientId).debts.find(d=>d.id===Number(b.debt_id)&&d.outstanding_cents>0);const deadline=validDay(b.deadline);if(!debt||deadline<String(debt.deadline)||!String(b.reason||'').trim())throw Error("Chọn Debt đang mở, gia hạn và nhập lý do.");db.prepare("UPDATE credit_debts SET deadline=? WHERE id=? AND client_id=?").run(deadline,Number(b.debt_id),clientId);auditData={...b,previous_deadline:debt.deadline};}
 else if(action==="debt_rate"){requireAdmin(user);allocateFIFO(clientId);const debt=receivables(clientId).debts.find(d=>d.id===Number(b.debt_id)&&d.outstanding_cents>0);if(!debt||b.daily_rate_pct===undefined||!String(b.reason||'').trim())throw Error("Cần Debt đang mở, lãi suất và lý do.");const previousRate=db.prepare('SELECT daily_rate_pct FROM debt_interest_events WHERE debt_id=? ORDER BY effective_day DESC,id DESC LIMIT 1').get(debt.id) as Row|undefined;snapshotDebt(Number(debt.id),b.daily_rate_pct,user.id,String(b.reason));auditData={...b,previous_daily_rate_pct:Number(previousRate?.daily_rate_pct||0),daily_rate_pct:Number(b.daily_rate_pct),effective_day:localDay()};}
 else if(action==="reject_payment"){requireAdmin(user);const e=db.prepare("SELECT * FROM ledger_entries WHERE id=? AND client_user_id=? AND entry_type='PAYMENT' AND direction='CREDIT'").get(Number(b.ledger_id),clientId) as Row|undefined;if(!e)throw Error("Payment không tồn tại.");if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_adjustment_events'").get()&&db.prepare("SELECT id FROM payment_adjustment_events WHERE ledger_id=?").get(e.id))throw Error("Payment đã điều chỉnh; Finance phải sửa thực nhận qua Payment Adjustment.");if(db.prepare("SELECT ledger_id FROM rejected_payments WHERE ledger_id=?").get(e.id))return accountFinancials(clientId);if(!String(b.reason||"").trim())throw Error("Cần lý do reject.");const previousAllocations=db.prepare("SELECT * FROM credit_allocations WHERE ledger_id=?").all(e.id);
 const reverse=db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'PAYMENT_REVERSAL','DEBIT',?,?,'PAYMENT',?,?,?)").run(clientId,localDay(),e.amount,e.customer,String(e.id),String(b.reason),user.id);db.prepare("INSERT INTO rejected_payments VALUES (?,?,?)").run(e.id,reverse.lastInsertRowid,String(b.reason));db.prepare("DELETE FROM credit_allocations WHERE ledger_id=?").run(e.id);auditData={...b,previous_allocations:previousAllocations,reversal_id:Number(reverse.lastInsertRowid),reversed_cents:cents(e.amount)};}
 else if(action==="balance_credit"){requireAdmin(user);const amount=cents(b.amount),reason=String(b.reason||"").trim();if(amount<=0||!reason)throw Error("Balance Credit cần số tiền dương và lý do.");db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,note,created_by_user_id) VALUES (?,?,'ADJUSTMENT_CREDIT','CREDIT',?,(SELECT display_name FROM users WHERE id=?),?,?)").run(clientId,localDay(),amount/100,clientId,reason,user.id);}
 else if(action==="additional_fee"){const amount=cents(b.unit_price)*Number(b.quantity??1);if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(amount)||Number(b.quantity??1)<=0)throw Error("Số lượng / giá không hợp lệ.");if(b.currency&&b.currency!=="USD")throw Error("Hiện dùng USD.");db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,note,created_by_user_id) VALUES (?,?,'ADDITIONAL_FEE','DEBIT',?,(SELECT display_name FROM users WHERE id=?),?,?)").run(clientId,validDay(b.occurred_at||localDay()),amount/100,clientId,String(b.note||"")+" · "+String(b.quantity??1)+" × "+String(b.unit_price)+" USD",user.id);}
 else throw Error("Action không được hỗ trợ.");audit(clientId,user.id,action,auditData);return accountFinancials(clientId);
 }).immediate();}
