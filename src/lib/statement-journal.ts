import type Database from 'better-sqlite3';

/** Audit projection of operational tables, never an independently writable account. */
export function statementJournalSchema(db:Database.Database){
 db.transaction(()=>{
 db.exec(`CREATE TABLE IF NOT EXISTS statement_v2_epoch(id INTEGER PRIMARY KEY CHECK(id=1),started_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS statement_v2_events(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,source TEXT NOT NULL,source_id TEXT NOT NULL,operation TEXT NOT NULL,
 balance_cents INTEGER NOT NULL DEFAULT 0,debt_cents INTEGER NOT NULL DEFAULT 0,refund_cents INTEGER NOT NULL DEFAULT 0,bank_cents INTEGER NOT NULL DEFAULT 0,
 detail_json TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE INDEX IF NOT EXISTS statement_v2_client_events ON statement_v2_events(client_id,id);
 CREATE TABLE IF NOT EXISTS statement_v2_aging_basis(snapshot_id INTEGER PRIMARY KEY REFERENCES statement_v2_snapshots(id),client_id INTEGER NOT NULL,period_end TEXT NOT NULL,aging_basis_cents INTEGER NOT NULL,last_event_id INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_statement_v2_aging_client ON statement_v2_aging_basis(client_id,period_end);
 CREATE TRIGGER IF NOT EXISTS immutable_statement_aging_update BEFORE UPDATE ON statement_v2_aging_basis BEGIN SELECT RAISE(ABORT,'Statement aging basis immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_statement_aging_delete BEFORE DELETE ON statement_v2_aging_basis BEGIN SELECT RAISE(ABORT,'Statement aging basis immutable'); END;
 CREATE TABLE IF NOT EXISTS statement_v2_snapshots(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 actor_id INTEGER NOT NULL,finalized_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),snapshot_json TEXT NOT NULL,UNIQUE(client_id,period_start),CHECK(period_start<=period_end));`);
 const first=!db.prepare('SELECT id FROM statement_v2_epoch').get();
 if(first){
 db.prepare("INSERT INTO statement_v2_epoch VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
 // Establish an explicit opening checkpoint; do not invent historical allocations.
 db.exec(`INSERT INTO statement_v2_events(client_id,source,source_id,operation,balance_cents,debt_cents,refund_cents,bank_cents,detail_json)
 SELECT u.id,'OPENING',CAST(u.id AS TEXT),'CHECKPOINT',
 COALESCE((SELECT SUM(CASE WHEN direction='CREDIT' THEN ROUND(amount*100) ELSE -ROUND(amount*100) END) FROM ledger_entries WHERE client_user_id=u.id AND entry_type!='SERVICE_COST'),0)
 +COALESCE((SELECT SUM(amount_cents) FROM credit_debts WHERE client_id=u.id),0)
 -COALESCE((SELECT SUM(a.amount_cents) FROM credit_allocations a JOIN credit_debts d ON d.id=a.debt_id WHERE d.client_id=u.id),0),
 COALESCE((SELECT SUM(amount_cents) FROM credit_debts WHERE client_id=u.id),0)
 +COALESCE((SELECT SUM(i.amount_cents) FROM debt_daily_interest i JOIN credit_debts d ON d.id=i.debt_id WHERE d.client_id=u.id),0)
 -COALESCE((SELECT SUM(a.amount_cents) FROM credit_allocations a JOIN credit_debts d ON d.id=a.debt_id WHERE d.client_id=u.id),0),
 COALESCE((SELECT SUM(delta_cents) FROM refund_events WHERE client_id=u.id),0),
 COALESCE((SELECT SUM(-delta_cents) FROM refund_events WHERE client_id=u.id AND kind='TO_BANK'),0),'{}' FROM users u WHERE role='CLIENT';`);
 }
 const watches=[
 {table:'ledger_entries',client:'r.client_user_id',id:'r.id',condition:"r.client_user_id IS NOT NULL AND r.entry_type!='SERVICE_COST'",balance:"CASE WHEN r.direction='CREDIT' THEN ROUND(r.amount*100) ELSE -ROUND(r.amount*100) END",debt:'0',refund:'0',bank:'0',fields:['id','entry_type','direction','amount','occurred_at','reference_type','reference_id','note','created_by_user_id']},
 {table:'credit_debts',client:'r.client_id',id:'r.id',condition:'1',balance:'r.amount_cents',debt:'r.amount_cents',refund:'0',bank:'0',fields:['id','amount_cents','deadline','reason']},
 {table:'credit_allocations',client:'(SELECT client_id FROM credit_debts WHERE id=r.debt_id)',id:'r.id',condition:'r.debt_id IS NOT NULL',balance:'-r.amount_cents',debt:'-r.amount_cents',refund:'0',bank:'0',fields:['id','ledger_id','debt_id','amount_cents','interest_cents']},
 {table:'debt_daily_interest',client:'(SELECT client_id FROM credit_debts WHERE id=r.debt_id)',id:"r.debt_id||':'||r.day",condition:'1',balance:'0',debt:'r.amount_cents',refund:'0',bank:'0',fields:['debt_id','day','amount_cents','principal_cents','daily_rate_pct']},
 {table:'refund_events',client:'r.client_id',id:'r.id',condition:'1',balance:'0',debt:'0',refund:'r.delta_cents',bank:"CASE WHEN r.kind='TO_BANK' THEN -r.delta_cents ELSE 0 END",fields:['id','kind','claim_id','category','delta_cents','ledger_id','paid_date','reason']},
 ];
 for(const w of watches)for(const op of ['INSERT','UPDATE','DELETE']){
 const stages=op==='UPDATE'?['OLD','NEW']:op==='DELETE'?['OLD']:['NEW'];
 const statements=stages.map(r=>{
 const sql=(s:string)=>s.replaceAll('r.',r+'.'),sign=r==='OLD'?-1:1;
 return `INSERT INTO statement_v2_events(client_id,source,source_id,operation,balance_cents,debt_cents,refund_cents,bank_cents,detail_json)
 SELECT ${sql(w.client)},'${w.table}',${sql(w.id)},'${op}_${r}',${sign}*(${sql(w.balance)}),${sign}*(${sql(w.debt)}),${sign}*(${sql(w.refund)}),${sign}*(${sql(w.bank)}),
 json_object(${w.fields.map(f=>`'${f}',${r}.${f}`).join(',')}) WHERE ${sql(w.condition)};`;
 }).join('\n');
 db.exec(`CREATE TRIGGER IF NOT EXISTS statement_v2_${w.table}_${op} AFTER ${op} ON ${w.table} BEGIN ${statements} END;`);
 }
 for(const t of ['statement_v2_events','statement_v2_snapshots','statement_v2_epoch'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_immutable_${op} BEFORE ${op} ON ${t} BEGIN SELECT RAISE(ABORT,'Statement V2 audit is immutable'); END;`);
 }).immediate();
}
