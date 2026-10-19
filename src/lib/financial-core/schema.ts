import type Database from 'better-sqlite3';

/** Explicit initialization only. No import-time access to the operational database. */
export function initializeFinancialCore(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fc_clients (
      client_id INTEGER PRIMARY KEY, sales_id INTEGER NOT NULL,
      credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK(credit_limit_cents>=0),
      purchase_hold INTEGER NOT NULL DEFAULT 0 CHECK(purchase_hold IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS fc_events (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES fc_clients(client_id),
      kind TEXT NOT NULL, balance_cents INTEGER NOT NULL DEFAULT 0,
      principal_cents INTEGER NOT NULL DEFAULT 0, interest_cents INTEGER NOT NULL DEFAULT 0,
      refund_cents INTEGER NOT NULL DEFAULT 0, cash_out_cents INTEGER NOT NULL DEFAULT 0,
      reserve_cents INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL, actor_id INTEGER NOT NULL, reason TEXT NOT NULL,
      posted_at TEXT NOT NULL, data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fc_events_client ON fc_events(client_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS fc_charge_source ON fc_events(source) WHERE kind='SERVICE_CHARGE';
    CREATE TABLE IF NOT EXISTS fc_debt_terms (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES fc_clients(client_id),
      deadline TEXT NOT NULL, rate_ppm INTEGER NOT NULL CHECK(rate_ppm BETWEEN 0 AND 1000000),
      effective_at TEXT NOT NULL, actor_id INTEGER NOT NULL, reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fc_terms_client ON fc_debt_terms(client_id,id);
    CREATE TABLE IF NOT EXISTS fc_interest_days (
      client_id INTEGER NOT NULL REFERENCES fc_clients(client_id), day TEXT NOT NULL,
      event_id INTEGER NOT NULL REFERENCES fc_events(id), PRIMARY KEY(client_id,day)
    );
    CREATE TABLE IF NOT EXISTS fc_payments (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES fc_clients(client_id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents>0), event_id INTEGER NOT NULL REFERENCES fc_events(id)
    );
    CREATE TABLE IF NOT EXISTS fc_payment_adjustments (
      id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES fc_payments(id),
      amount_cents INTEGER NOT NULL, event_id INTEGER NOT NULL REFERENCES fc_events(id)
    );
    CREATE TABLE IF NOT EXISTS fc_reconciliation (
      id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES fc_payments(id),
      status TEXT NOT NULL CHECK(status IN ('CONFIRMED','DISCREPANCY')),
      actor_id INTEGER NOT NULL, reason TEXT NOT NULL, posted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fc_claim_decisions (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES fc_clients(client_id),
      claim_id TEXT NOT NULL, category TEXT NOT NULL,
      obligation_cents INTEGER NOT NULL CHECK(obligation_cents>=0),
      event_id INTEGER NOT NULL REFERENCES fc_events(id)
    );
    CREATE INDEX IF NOT EXISTS fc_claim_revision ON fc_claim_decisions(client_id,claim_id,id);
    CREATE TABLE IF NOT EXISTS fc_statements (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES fc_clients(client_id),
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      finalized_at TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      UNIQUE(client_id,period_start,period_end)
    );
    CREATE TABLE IF NOT EXISTS fc_outbox (
      id INTEGER PRIMARY KEY, recipient_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL REFERENCES fc_events(id), payload_json TEXT NOT NULL,
      UNIQUE(recipient_id,event_id)
    );
    CREATE TABLE IF NOT EXISTS fc_receipts (
      actor_id INTEGER NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
      result_json TEXT NOT NULL, PRIMARY KEY(actor_id,request_key)
    );
  `);
  for (const table of ['fc_events','fc_debt_terms','fc_interest_days','fc_payments',
    'fc_payment_adjustments','fc_reconciliation','fc_claim_decisions','fc_statements','fc_outbox','fc_receipts']) {
    for (const operation of ['UPDATE','DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_${operation} BEFORE ${operation} ON ${table}
        BEGIN SELECT RAISE(ABORT,'Financial records are immutable'); END;`);
    }
  }
}
