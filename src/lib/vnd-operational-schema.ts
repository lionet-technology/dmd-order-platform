import type Database from 'better-sqlite3';
import {installSupplierPeriodSchema} from './vnd-supplier-periods';
import {installSupplierImportSchema} from './vnd-supplier-import';
/** Explicit new-account cutover only; never reinterpret legacy USD rows. */
export function installVndOperationalSchema(db:Database.Database) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS vnd_supplier_addons(
   id INTEGER PRIMARY KEY, supplier TEXT NOT NULL, supplier_key TEXT NOT NULL,
   direction TEXT NOT NULL CHECK(direction IN ('BUY','SELL')), name TEXT NOT NULL, amount TEXT NOT NULL,
   client_id INTEGER REFERENCES vnd_accounts(client_id), reference TEXT NOT NULL,
   reference_key TEXT NOT NULL, reason TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(supplier_key,direction,reference_key),
   CHECK(client_id IS NULL OR direction='SELL')
 );
 CREATE TABLE IF NOT EXISTS vnd_supplier_addon_settlements(
   id INTEGER PRIMARY KEY, addon_id INTEGER NOT NULL REFERENCES vnd_supplier_addons(id),
   amount TEXT NOT NULL, executed_day TEXT NOT NULL, reference TEXT NOT NULL,
   reference_key TEXT NOT NULL UNIQUE, reason TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE INDEX IF NOT EXISTS vnd_supplier_addon_settlement_addon ON vnd_supplier_addon_settlements(addon_id);
 CREATE INDEX IF NOT EXISTS vnd_supplier_addon_settlement_day ON vnd_supplier_addon_settlements(executed_day);
 CREATE TABLE IF NOT EXISTS vnd_commission_statements(month TEXT PRIMARY KEY, closed_at TEXT NOT NULL, snapshot_json TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS vnd_commission_no_replace BEFORE INSERT ON vnd_commission_statements
 WHEN EXISTS (SELECT 1 FROM vnd_commission_statements WHERE month=NEW.month)
 BEGIN SELECT RAISE(ABORT,'Commission statement is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS vnd_commission_no_update BEFORE UPDATE ON vnd_commission_statements BEGIN SELECT RAISE(ABORT,'Commission statement is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS vnd_commission_no_delete BEFORE DELETE ON vnd_commission_statements BEGIN SELECT RAISE(ABORT,'Commission statement is immutable'); END;
 CREATE TABLE IF NOT EXISTS vnd_statements(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),period_start TEXT NOT NULL,period_end TEXT NOT NULL,last_ledger_id INTEGER NOT NULL,last_debt_event_id INTEGER NOT NULL,snapshot_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,period_end));
 CREATE TABLE IF NOT EXISTS vnd_debts(client_id INTEGER PRIMARY KEY REFERENCES vnd_accounts(client_id),principal TEXT NOT NULL DEFAULT '0',interest TEXT NOT NULL DEFAULT '0',deadline TEXT NOT NULL,daily_rate_pct TEXT NOT NULL DEFAULT '0');
 CREATE TABLE IF NOT EXISTS vnd_debt_events(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),day TEXT NOT NULL,principal TEXT NOT NULL,interest TEXT NOT NULL,principal_delta TEXT NOT NULL,interest_delta TEXT NOT NULL,daily_rate_pct TEXT NOT NULL,kind TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_debt_daily(client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),day TEXT NOT NULL,amount TEXT NOT NULL,PRIMARY KEY(client_id,day));
 CREATE TABLE IF NOT EXISTS vnd_addons(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),name TEXT NOT NULL,revenue TEXT NOT NULL,cost TEXT,supplier TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_addon_history(id INTEGER PRIMARY KEY,addon_id INTEGER NOT NULL REFERENCES vnd_addons(id),data_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_replacements(id INTEGER PRIMARY KEY,source_order_id INTEGER NOT NULL REFERENCES orders(id),replacement_order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_charge_sources(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),order_id INTEGER NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,amount TEXT NOT NULL,reference TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,reference));
 CREATE TABLE IF NOT EXISTS vnd_destinations(order_id INTEGER PRIMARY KEY REFERENCES orders(id),china_region TEXT CHECK(china_region IN ('SOUTH','OTHER')));
 CREATE TABLE IF NOT EXISTS vnd_accounts(client_id INTEGER PRIMARY KEY REFERENCES users(id),credit_limit TEXT NOT NULL DEFAULT '0',actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_purchase_requests(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),status TEXT NOT NULL CHECK(status IN ('AWAITING_QUOTE','PRICE_CONFIRMATION_REQUIRED','AWAITING_FUNDS','RESERVED','CHARGED','CANCELLED')),offer TEXT,revision INTEGER NOT NULL DEFAULT 0,accepted_revision INTEGER,confirmed_at TEXT NOT NULL,request_actor_id INTEGER NOT NULL REFERENCES users(id),reserve TEXT NOT NULL DEFAULT '0',charged_offer TEXT);
 CREATE TABLE IF NOT EXISTS vnd_auto_quotes(order_id INTEGER PRIMARY KEY REFERENCES orders(id),snapshot_json TEXT NOT NULL,manual_offer INTEGER NOT NULL DEFAULT 0,pricing_error TEXT);
 CREATE TABLE IF NOT EXISTS vnd_auto_quote_history(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS vnd_fifo ON vnd_purchase_requests(client_id,id);
 CREATE TABLE IF NOT EXISTS vnd_ledger(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),order_id INTEGER REFERENCES orders(id),kind TEXT NOT NULL,delta TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_commands(request_key TEXT PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),payload TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_history(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),order_id INTEGER REFERENCES orders(id),event TEXT NOT NULL,data_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TRIGGER IF NOT EXISTS vnd_no_legacy_ledger BEFORE INSERT ON ledger_entries WHEN EXISTS(SELECT 1 FROM vnd_accounts WHERE client_id=NEW.client_user_id) BEGIN SELECT RAISE(ABORT,'Use VND financial posting'); END;
 CREATE TRIGGER IF NOT EXISTS vnd_no_legacy_ledger_update BEFORE UPDATE ON ledger_entries WHEN EXISTS(SELECT 1 FROM vnd_accounts WHERE client_id=NEW.client_user_id) BEGIN SELECT RAISE(ABORT,'Use VND financial posting'); END;

 `);
 db.transaction(()=>{
  const accountColumns=db.pragma('table_info(vnd_accounts)') as {name:string}[];
  const debtEventColumns=db.pragma('table_info(vnd_debt_events)') as {name:string}[];
  if(!accountColumns.some(c=>c.name==='credit_term_weeks'))db.exec('ALTER TABLE vnd_accounts ADD COLUMN credit_term_weeks INTEGER NOT NULL DEFAULT 0 CHECK(credit_term_weeks>=0)');
  if(!debtEventColumns.some(c=>c.name==='payment_ledger_id'))db.exec('ALTER TABLE vnd_debt_events ADD COLUMN payment_ledger_id INTEGER REFERENCES vnd_ledger(id)');
  if(!debtEventColumns.some(c=>c.name==='ledger_watermark'))db.exec('ALTER TABLE vnd_debt_events ADD COLUMN ledger_watermark INTEGER');
 }).immediate();
 db.exec(`
 CREATE INDEX IF NOT EXISTS vnd_ledger_client_id ON vnd_ledger(client_id,id);
 CREATE INDEX IF NOT EXISTS vnd_debt_events_client_id ON vnd_debt_events(client_id,id);
 CREATE UNIQUE INDEX IF NOT EXISTS vnd_debt_payment_ledger ON vnd_debt_events(payment_ledger_id) WHERE payment_ledger_id IS NOT NULL;
 `);
 db.exec(`CREATE TABLE IF NOT EXISTS vnd_claims(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),category TEXT NOT NULL,orders_json TEXT NOT NULL,evidence TEXT NOT NULL,note TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_refund_events(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),claim_id INTEGER REFERENCES vnd_claims(id),kind TEXT NOT NULL,delta TEXT NOT NULL,approved TEXT,revision INTEGER,category TEXT,context_json TEXT,bank_json TEXT,executed_day TEXT,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 for(const table of ['vnd_claims','vnd_refund_events'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND refund history'); END;`);
 db.exec(`CREATE TABLE IF NOT EXISTS vnd_supplier_costs(id INTEGER PRIMARY KEY,lot_id INTEGER NOT NULL REFERENCES order_lots(id),supplier TEXT NOT NULL,amount TEXT NOT NULL,reference TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_supplier_reviews(id INTEGER PRIMARY KEY,cost_id INTEGER NOT NULL REFERENCES vnd_supplier_costs(id),action TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_supplier_ledger(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,kind TEXT NOT NULL,delta TEXT NOT NULL,cost_id INTEGER UNIQUE REFERENCES vnd_supplier_costs(id),reference TEXT NOT NULL,executed_day TEXT,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 db.exec(`CREATE TABLE IF NOT EXISTS vnd_supplier_claims(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,requested TEXT NOT NULL,lots_json TEXT NOT NULL,scope_json TEXT NOT NULL,reference TEXT NOT NULL,evidence TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_supplier_claim_events(id INTEGER PRIMARY KEY,claim_id INTEGER NOT NULL REFERENCES vnd_supplier_claims(id),kind TEXT NOT NULL,amount TEXT NOT NULL,approved TEXT,settlement_id INTEGER REFERENCES vnd_supplier_claim_events(id),reference TEXT NOT NULL,evidence TEXT NOT NULL,reason TEXT NOT NULL,executed_day TEXT,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE UNIQUE INDEX IF NOT EXISTS vnd_supplier_one_reversal ON vnd_supplier_claim_events(settlement_id) WHERE kind='REVERSE';
 CREATE TABLE IF NOT EXISTS vnd_claim_notifications(id INTEGER PRIMARY KEY,recipient_id INTEGER NOT NULL REFERENCES users(id),client_id INTEGER NOT NULL REFERENCES users(id),event_id INTEGER NOT NULL REFERENCES vnd_refund_events(id),UNIQUE(recipient_id,event_id));
 CREATE TABLE IF NOT EXISTS vnd_claim_reads(notification_id INTEGER NOT NULL REFERENCES vnd_claim_notifications(id),recipient_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(notification_id,recipient_id));`);
 db.exec(`
 CREATE TABLE IF NOT EXISTS vnd_claim_processing(
   id INTEGER PRIMARY KEY,
   client_claim_id INTEGER REFERENCES vnd_claims(id),
   supplier_claim_id INTEGER REFERENCES vnd_supplier_claims(id),
   note TEXT NOT NULL, evidence TEXT NOT NULL,
   actor_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CHECK((client_claim_id IS NULL) <> (supplier_claim_id IS NULL))
 );
 CREATE INDEX IF NOT EXISTS vnd_claim_processing_client ON vnd_claim_processing(client_claim_id,id);
 CREATE INDEX IF NOT EXISTS vnd_claim_processing_supplier ON vnd_claim_processing(supplier_claim_id,id);
 CREATE TABLE IF NOT EXISTS vnd_claim_watchlist(
   id INTEGER PRIMARY KEY, side TEXT NOT NULL CHECK(side IN ('CLIENT','SUPPLIER')),
   order_id INTEGER NOT NULL REFERENCES orders(id), supplier TEXT NOT NULL DEFAULT '',
   active INTEGER NOT NULL CHECK(active IN (0,1)), reason TEXT NOT NULL,
   actor_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE INDEX IF NOT EXISTS vnd_claim_watchlist_scope ON vnd_claim_watchlist(side,supplier,order_id,id);
 CREATE TABLE IF NOT EXISTS vnd_claim_links(
   client_claim_id INTEGER NOT NULL REFERENCES vnd_claims(id),
   supplier_claim_id INTEGER NOT NULL REFERENCES vnd_supplier_claims(id),
   reason TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY(client_claim_id,supplier_claim_id)
 );
 CREATE INDEX IF NOT EXISTS vnd_claim_links_supplier ON vnd_claim_links(supplier_claim_id,client_claim_id);
 `);
 for(const table of ['vnd_claim_processing','vnd_claim_watchlist','vnd_claim_links'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND case history'); END;`);
 db.transaction(()=>{
  if (!(db.pragma('table_info(vnd_supplier_costs)') as {name:string}[]).some(column => column.name === 'fulfillment_epoch'))
   db.exec('ALTER TABLE vnd_supplier_costs ADD COLUMN fulfillment_epoch INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS vnd_supplier_cost_scope ON vnd_supplier_costs(lot_id,supplier,fulfillment_epoch)');
 }).immediate();
 installSupplierImportSchema(db);
 installSupplierPeriodSchema(db);
 for(const table of ['vnd_supplier_claims','vnd_supplier_claim_events','vnd_claim_notifications','vnd_claim_reads'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND claim history'); END;`);
 for(const table of ['vnd_supplier_costs','vnd_supplier_reviews','vnd_supplier_ledger','vnd_supplier_addons','vnd_supplier_addon_settlements'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND supplier history'); END;`);
 for(const table of ['vnd_accounts'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'VND account cutover is permanent'); END;`);
 for(const table of ['vnd_charge_sources','vnd_ledger','vnd_commands','vnd_history','vnd_auto_quote_history','vnd_replacements','vnd_addon_history','vnd_statements','vnd_debt_events','vnd_debt_daily'])for(const op of ['UPDATE','DELETE'])
 db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND history'); END;`);
}
