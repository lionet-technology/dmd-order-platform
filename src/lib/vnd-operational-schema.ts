import type Database from 'better-sqlite3';
/** Explicit new-account cutover only; never reinterpret legacy USD rows. */
export function installVndOperationalSchema(db:Database.Database) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS vnd_accounts(client_id INTEGER PRIMARY KEY REFERENCES users(id),credit_limit TEXT NOT NULL DEFAULT '0',actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_purchase_requests(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),status TEXT NOT NULL CHECK(status IN ('AWAITING_QUOTE','PRICE_CONFIRMATION_REQUIRED','AWAITING_FUNDS','RESERVED','CHARGED','CANCELLED')),offer TEXT,revision INTEGER NOT NULL DEFAULT 0,accepted_revision INTEGER,confirmed_at TEXT NOT NULL,request_actor_id INTEGER NOT NULL REFERENCES users(id),reserve TEXT NOT NULL DEFAULT '0',charged_offer TEXT);
 CREATE INDEX IF NOT EXISTS vnd_fifo ON vnd_purchase_requests(client_id,id);
 CREATE TABLE IF NOT EXISTS vnd_ledger(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),order_id INTEGER REFERENCES orders(id),kind TEXT NOT NULL,delta TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_commands(request_key TEXT PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),payload TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS vnd_history(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES vnd_accounts(client_id),order_id INTEGER REFERENCES orders(id),event TEXT NOT NULL,data_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TRIGGER IF NOT EXISTS vnd_no_legacy_ledger BEFORE INSERT ON ledger_entries WHEN EXISTS(SELECT 1 FROM vnd_accounts WHERE client_id=NEW.client_user_id) BEGIN SELECT RAISE(ABORT,'Use VND financial posting'); END;
 CREATE TRIGGER IF NOT EXISTS vnd_no_legacy_ledger_update BEFORE UPDATE ON ledger_entries WHEN EXISTS(SELECT 1 FROM vnd_accounts WHERE client_id=NEW.client_user_id) BEGIN SELECT RAISE(ABORT,'Use VND financial posting'); END;

 `);
 for(const table of ['vnd_accounts'])db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'VND account cutover is permanent'); END;`);
 for(const table of ['vnd_ledger','vnd_commands','vnd_history'])for(const op of ['UPDATE','DELETE'])
 db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable VND history'); END;`);
}
