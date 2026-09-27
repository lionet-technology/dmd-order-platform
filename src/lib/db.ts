import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DMD_DB_PATH || path.join(process.cwd(), "data", "dmd-finance-ops.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { dmdDb?: Database.Database };
export const db = globalForDb.dmdDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.dmdDb = db;

db.pragma("busy_timeout = 10000");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  warnings TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT,
  sales TEXT,
  customer TEXT,
  supplier TEXT,
  service TEXT,
  sub_service TEXT,
  label TEXT,
  tracking TEXT UNIQUE,
  order_id TEXT,
  draft_key TEXT UNIQUE,
  workflow_status TEXT NOT NULL DEFAULT 'SALES_DRAFT',
  est_net_cost REAL NOT NULL DEFAULT 0,
  true_net_cost REAL,
  base_cost REAL NOT NULL DEFAULT 0,
  retail REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  sales_price REAL NOT NULL DEFAULT 0,
  manual_surcharge REAL NOT NULL DEFAULT 0,
  surcharge REAL NOT NULL DEFAULT 0,
  extra_surcharge REAL NOT NULL DEFAULT 0,
  import_tax REAL NOT NULL DEFAULT 0,
  extra_import_tax REAL NOT NULL DEFAULT 0,
  total_due REAL NOT NULL DEFAULT 0,
  gross_profit_base REAL NOT NULL DEFAULT 0,
  gross_profit_net REAL NOT NULL DEFAULT 0,
  note TEXT,
  item TEXT,
  material TEXT,
  declared_value REAL,
  carton_count INTEGER,
  length REAL,
  width REAL,
  height REAL,
  volume REAL,
  weight REAL,
  chargeable_weight REAL,
  recipient_name TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  phone TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'PENDING',
  reconciliation_delta REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service, sub_service);

CREATE TABLE IF NOT EXISTS supplier_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier TEXT,
  service TEXT,
  sub_service TEXT,
  tracking TEXT NOT NULL,
  occurred_at TEXT,
  item TEXT,
  destination TEXT,
  weight REAL,
  net_price REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  export_customs REAL NOT NULL DEFAULT 0,
  import_customs REAL NOT NULL DEFAULT 0,
  total_net_cost REAL NOT NULL DEFAULT 0,
  extra_surcharge REAL NOT NULL DEFAULT 0,
  import_tax REAL NOT NULL DEFAULT 0,
  note TEXT,
  batch_id INTEGER REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_costs_tracking ON supplier_costs(tracking);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
  amount REAL NOT NULL,
  customer TEXT,
  reference_type TEXT,
  reference_id TEXT,
  bill_url TEXT,
  note TEXT,
  batch_id INTEGER REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_auto_unique
ON ledger_entries(entry_type, reference_type, reference_id)
WHERE reference_id IS NOT NULL AND entry_type = 'ORDER_CHARGE';

CREATE TABLE IF NOT EXISTS service_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT,
  from_date TEXT,
  to_date TEXT,
  quantity REAL,
  total REAL NOT NULL DEFAULT 0,
  payment_due_date TEXT,
  note TEXT,
  batch_id INTEGER REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);


const orderColumns = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
if (!orderColumns.some((column) => column.name === "manual_surcharge")) {
  db.exec("ALTER TABLE orders ADD COLUMN manual_surcharge REAL NOT NULL DEFAULT 0");
}

export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
