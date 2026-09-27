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
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES')),
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

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

CREATE TABLE IF NOT EXISTS enum_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enum_type TEXT NOT NULL,
  value TEXT NOT NULL COLLATE NOCASE,
  parent_value TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(enum_type, value, parent_value)
);
CREATE INDEX IF NOT EXISTS idx_enum_values_type_active ON enum_values(enum_type, active, sort_order, value);
`);


function ensureColumn(table: string, name: string, ddl: string) {
  const columns = db.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === name)) return;
  try {
    db.exec("ALTER TABLE " + table + " ADD COLUMN " + ddl);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) throw error;
  }
}

ensureColumn("orders", "manual_surcharge", "manual_surcharge REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "auto_pricing", "auto_pricing INTEGER NOT NULL DEFAULT 1");
ensureColumn("orders", "gross_margin_pct", "gross_margin_pct REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "margin_status", "margin_status TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn("orders", "sales_user_id", "sales_user_id INTEGER");
ensureColumn("orders", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("orders", "updated_by_user_id", "updated_by_user_id INTEGER");
ensureColumn("supplier_costs", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("ledger_entries", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("import_batches", "created_by_user_id", "created_by_user_id INTEGER");

const enumSeeds: Array<[string,string,string,number]> = [
  ["SERVICE","ePacket","",10],
  ["SERVICE","UPS","",20],
  ["SERVICE","Yun Express","",30],
  ["SERVICE","Chuyên tuyến","",40],
  ["SERVICE","USPS Domestic","",50],
  ["SERVICE","USPS GDE","",60],
  ["SERVICE","Royal Mail UK","",70],
  ["SERVICE","Evri UK","",80],
  ["SERVICE","Kho US","",90],
  ["SERVICE","Kho VN","",100],
  ["SERVICE","Kho TQ","",110],

  ["SUB_SERVICE","T11","ePacket",10],
  ["SUB_SERVICE","Standard","ePacket",20],
  ["SUB_SERVICE","Eco","ePacket",30],
  ["SUB_SERVICE","Saver","UPS",10],
  ["SUB_SERVICE","Expedited","UPS",20],
  ["SUB_SERVICE","Express","UPS",30],
  ["SUB_SERVICE","Fulfill","Kho US",10],
  ["SUB_SERVICE","Relabel","Kho US",20],
  ["SUB_SERVICE","Handling","Kho US",30],
  ["SUB_SERVICE","Forward","Kho US",40],
  ["SUB_SERVICE","Fulfill","Kho VN",10],
  ["SUB_SERVICE","Relabel","Kho VN",20],
  ["SUB_SERVICE","Handling","Kho VN",30],
  ["SUB_SERVICE","Forward","Kho VN",40],
  ["SUB_SERVICE","Fulfill","Kho TQ",10],
  ["SUB_SERVICE","Relabel","Kho TQ",20],
  ["SUB_SERVICE","Handling","Kho TQ",30],
  ["SUB_SERVICE","Forward","Kho TQ",40],

  ["SUPPLIER","KILOSHIP","",10],
  ["SUPPLIER","BELL","",20],

  ["COUNTRY","US","",10],
  ["COUNTRY","GB","",20],
  ["COUNTRY","VN","",30],
  ["COUNTRY","CN","",40],
  ["COUNTRY","CA","",50],
  ["COUNTRY","AU","",60],
  ["COUNTRY","DE","",70],
  ["COUNTRY","FR","",80],
  ["COUNTRY","ES","",90],
  ["COUNTRY","IT","",100],
  ["COUNTRY","NL","",110],
  ["COUNTRY","BE","",120],
  ["COUNTRY","PL","",130],
  ["COUNTRY","CZ","",140],
  ["COUNTRY","AT","",150],
  ["COUNTRY","JP","",160],
  ["COUNTRY","KR","",170],
  ["COUNTRY","SG","",180],
  ["COUNTRY","TH","",190],
  ["COUNTRY","MY","",200],
  ["COUNTRY","ID","",210],
  ["COUNTRY","PH","",220]
];
const insertEnumSeed = db.prepare(
  "INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,sort_order) VALUES (?,?,?,?)"
);
const seedEnumTransaction = db.transaction(() => {
  for (const [type,value,parent,sortOrder] of enumSeeds) insertEnumSeed.run(type,value,parent,sortOrder);

  const discovered: Array<[string,string,string]> = [];
  const collect = (type:string, rows:Array<Record<string,unknown>>, valueKey:string, parentKey?:string) => {
    for (const row of rows) {
      const value=String(row[valueKey]??"").trim();
      if(!value)continue;
      const parent=parentKey?String(row[parentKey]??"").trim():"";
      discovered.push([type,value,parent]);
    }
  };
  collect("SERVICE", db.prepare("SELECT DISTINCT service FROM orders WHERE service IS NOT NULL AND service<>''").all() as Array<Record<string,unknown>>, "service");
  collect("SERVICE", db.prepare("SELECT DISTINCT service FROM supplier_costs WHERE service IS NOT NULL AND service<>''").all() as Array<Record<string,unknown>>, "service");
  collect("SUB_SERVICE", db.prepare("SELECT DISTINCT service,sub_service FROM orders WHERE sub_service IS NOT NULL AND sub_service<>''").all() as Array<Record<string,unknown>>, "sub_service", "service");
  collect("SUB_SERVICE", db.prepare("SELECT DISTINCT service,sub_service FROM supplier_costs WHERE sub_service IS NOT NULL AND sub_service<>''").all() as Array<Record<string,unknown>>, "sub_service", "service");
  collect("SUPPLIER", db.prepare("SELECT DISTINCT supplier FROM orders WHERE supplier IS NOT NULL AND supplier<>''").all() as Array<Record<string,unknown>>, "supplier");
  collect("SUPPLIER", db.prepare("SELECT DISTINCT supplier FROM supplier_costs WHERE supplier IS NOT NULL AND supplier<>''").all() as Array<Record<string,unknown>>, "supplier");
  collect("COUNTRY", db.prepare("SELECT DISTINCT country FROM orders WHERE country IS NOT NULL AND country<>''").all() as Array<Record<string,unknown>>, "country");
  for (const [type,value,parent] of discovered) insertEnumSeed.run(type,value,parent,999);
});
seedEnumTransaction();

export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
