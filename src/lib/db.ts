import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DMD_DB_PATH || path.join(process.cwd(), "data", "dmd-finance-ops.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { dmdDb?: Database.Database };
export const db = globalForDb.dmdDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.dmdDb = db;

db.pragma("busy_timeout = 10000");
// Keep foreign-key enforcement off while legacy schemas are upgraded below.
db.pragma("foreign_keys = OFF");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES','CLIENT')),
  sales_user_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  is_root_admin INTEGER NOT NULL DEFAULT 0,
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
  public_note TEXT,
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

CREATE TABLE IF NOT EXISTS order_trackings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  lot_number INTEGER NOT NULL DEFAULT 1,
  tracking TEXT NOT NULL,
  normalized_tracking TEXT NOT NULL UNIQUE,
  label_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REPLACED','CANCELLED')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  cost_match_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(cost_match_type IN ('UNKNOWN','DIRECT','INCLUDED_IN_PARENT','NOT_BILLED','MISSING')),
  cost_parent_tracking_id INTEGER REFERENCES order_trackings(id),
  replaced_by_tracking_id INTEGER REFERENCES order_trackings(id),
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_trackings_order ON order_trackings(order_id,lot_number,id);
CREATE INDEX IF NOT EXISTS idx_order_trackings_status ON order_trackings(order_id,status);

CREATE TABLE IF NOT EXISTS order_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  lot_number INTEGER NOT NULL,
  net_cost REAL,
  cost_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(cost_status IN ('PENDING','MATCHED','REVIEW')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,lot_number)
);
CREATE INDEX IF NOT EXISTS idx_order_lots_order ON order_lots(order_id,lot_number);

CREATE TABLE IF NOT EXISTS order_cartons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_lot_id INTEGER REFERENCES order_lots(id) ON DELETE SET NULL,
  carton_number INTEGER NOT NULL,
  weight REAL,
  length REAL,
  width REAL,
  height REAL,
  volume REAL,
  chargeable_weight REAL,
  details_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,carton_number)
);
CREATE INDEX IF NOT EXISTS idx_order_cartons_order ON order_cartons(order_id,carton_number);
CREATE INDEX IF NOT EXISTS idx_order_cartons_lot ON order_cartons(order_lot_id,carton_number);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  material TEXT,
  unit_manufacturing_value REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,sku)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id,id);

CREATE TABLE IF NOT EXISTS carton_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carton_id INTEGER NOT NULL REFERENCES order_cartons(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(carton_id,order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_carton_items_carton ON carton_items(carton_id,order_item_id);

CREATE TABLE IF NOT EXISTS client_service_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL COLLATE NOCASE,
  sub_service TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  discount_percent REAL NOT NULL DEFAULT 0,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_user_id,service,sub_service)
);
CREATE INDEX IF NOT EXISTS idx_client_service_settings_client ON client_service_settings(client_user_id,service,sub_service);

CREATE TABLE IF NOT EXISTS service_route_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL COLLATE NOCASE,
  sub_service TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  supplier TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service,sub_service,supplier)
);
CREATE INDEX IF NOT EXISTS idx_service_route_configs_lookup ON service_route_configs(service,sub_service,supplier,active);

CREATE TABLE IF NOT EXISTS purchase_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_config_id INTEGER NOT NULL REFERENCES service_route_configs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  output_mode TEXT NOT NULL CHECK(output_mode IN ('MULTI_ORDER','PER_ORDER','PER_LOT')),
  repeat_sections_json TEXT NOT NULL DEFAULT '[]',
  output_naming TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_templates_route ON purchase_templates(route_config_id,active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_templates_one_active ON purchase_templates(route_config_id) WHERE active=1;

CREATE TABLE IF NOT EXISTS purchase_template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES purchase_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','ARCHIVED')),
  placeholder_map_json TEXT NOT NULL DEFAULT '[]',
  validation_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  UNIQUE(template_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_template_versions_template ON purchase_template_versions(template_id,status,version_number DESC);

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
  surcharge_type TEXT,
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

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('PUBLIC','INTERNAL','ADMIN')),
  source TEXT NOT NULL DEFAULT 'UI',
  actor_user_id INTEGER,
  actor_username TEXT,
  actor_display_name TEXT,
  actor_role TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id,created_at DESC,id DESC);
`);

// Older databases allowed only PUBLIC/ADMIN and defaulted audit events to PUBLIC.
// Rebuild once so new events fail closed as INTERNAL. Only explicitly supported
// customer notes remain public during migration.
const orderEventsTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_events'").get() as {sql?:string}|undefined)?.sql || "";
if(!orderEventsTableSql.includes("'INTERNAL'")){
  db.transaction(()=>{
    db.exec(
      "ALTER TABLE order_events RENAME TO order_events_legacy;" +
      "CREATE TABLE order_events (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE," +
      "event_type TEXT NOT NULL,summary TEXT NOT NULL," +
      "visibility TEXT NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('PUBLIC','INTERNAL','ADMIN'))," +
      "source TEXT NOT NULL DEFAULT 'UI',actor_user_id INTEGER,actor_username TEXT," +
      "actor_display_name TEXT,actor_role TEXT,before_json TEXT,after_json TEXT," +
      "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);" +
      "INSERT INTO order_events(id,order_id,event_type,summary,visibility,source,actor_user_id,actor_username,actor_display_name,actor_role,before_json,after_json,created_at) " +
      "SELECT id,order_id,event_type,summary,CASE WHEN visibility='ADMIN' THEN 'ADMIN' " +
      "WHEN event_type IN ('SURCHARGE_NOTICE','TAX_NOTICE','TRACKING_LABEL_CHANGED','DELIVERED','REFUND') THEN 'PUBLIC' ELSE 'INTERNAL' END," +
      "source,actor_user_id,actor_username,actor_display_name,actor_role,before_json,after_json,created_at FROM order_events_legacy;" +
      "DROP TABLE order_events_legacy;" +
      "CREATE INDEX idx_order_events_order ON order_events(order_id,created_at DESC,id DESC);"
    );
  })();
}

// SQLite cannot alter a CHECK constraint in place. Rebuild legacy users tables
// once so the new CLIENT role is accepted without losing existing accounts.
const usersTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql?: string } | undefined)?.sql || "";
if (!usersTableSql.includes("'CLIENT'")) {
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasSalesOwner = userColumns.some((column) => column.name === "sales_user_id");
  const copySalesOwner = hasSalesOwner ? "sales_user_id" : "NULL";
  // Disable FK enforcement only for this table rebuild so existing sessions are
  // preserved and keep pointing at the replacement users table with the same IDs.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS users_new;
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES','CLIENT')),
          sales_user_id INTEGER,
          active INTEGER NOT NULL DEFAULT 1,
          is_root_admin INTEGER NOT NULL DEFAULT 0,
          created_by_user_id INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_new(id,username,display_name,password_hash,role,sales_user_id,active,is_root_admin,created_by_user_id,created_at,updated_at)
        SELECT id,username,display_name,password_hash,role,${copySalesOwner},active,is_root_admin,created_by_user_id,created_at,updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}


function ensureColumn(table: string, name: string, ddl: string) {
  const columns = db.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === name)) return;
  try {
    db.exec("ALTER TABLE " + table + " ADD COLUMN " + ddl);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) throw error;
  }
}

const supplierCostColumnsBeforePublicNote = db.prepare("PRAGMA table_info(supplier_costs)").all() as Array<{ name:string }>;
const supplierCostNeedsPublicNoteBackfill = !supplierCostColumnsBeforePublicNote.some(column=>column.name==="public_note_recorded_at");

ensureColumn("orders", "manual_surcharge", "manual_surcharge REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "auto_pricing", "auto_pricing INTEGER NOT NULL DEFAULT 1");
ensureColumn("orders", "gross_margin_pct", "gross_margin_pct REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "margin_status", "margin_status TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn("orders", "sales_user_id", "sales_user_id INTEGER");
ensureColumn("orders", "client_user_id", "client_user_id INTEGER");
ensureColumn("orders","fulfillment_started_at","fulfillment_started_at TEXT");
ensureColumn("orders","cancelled_at","cancelled_at TEXT");
ensureColumn("orders","cancelled_by_user_id","cancelled_by_user_id INTEGER");
ensureColumn("orders","cancellation_reason","cancellation_reason TEXT");
ensureColumn("orders","cancellation_refund_percent","cancellation_refund_percent REAL");
ensureColumn("orders","cancellation_refund_amount","cancellation_refund_amount REAL");
ensureColumn("orders","cancelled_original_due","cancelled_original_due REAL");
ensureColumn("orders", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("orders", "updated_by_user_id", "updated_by_user_id INTEGER");
ensureColumn("orders", "manual_volume", "manual_volume REAL");
ensureColumn("orders", "calculated_volume", "calculated_volume REAL");
ensureColumn("orders", "dimensional_divisor", "dimensional_divisor REAL NOT NULL DEFAULT 5000");
ensureColumn("orders", "measurement_mode", "measurement_mode TEXT NOT NULL DEFAULT 'LOT'");
ensureColumn("orders", "internal_note", "internal_note TEXT");
ensureColumn("orders", "public_note", "public_note TEXT");
ensureColumn("orders", "discount_note", "discount_note TEXT");
ensureColumn("orders", "discount_source", "discount_source TEXT NOT NULL DEFAULT 'DEFAULT'");
ensureColumn("orders", "pricing_status", "pricing_status TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn("orders", "charge_status", "charge_status TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn("orders", "purchase_completed_at", "purchase_completed_at TEXT");
ensureColumn("orders", "system_order_code", "system_order_code TEXT");
ensureColumn("orders", "expected_lot_count", "expected_lot_count INTEGER NOT NULL DEFAULT 1");
ensureColumn("client_service_settings", "default_sub_service", "default_sub_service TEXT NOT NULL DEFAULT ''");
ensureColumn("client_service_settings", "default_supplier", "default_supplier TEXT NOT NULL DEFAULT ''");
ensureColumn("supplier_costs", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("supplier_costs", "normalized_tracking", "normalized_tracking TEXT");
ensureColumn("supplier_costs", "matched_order_id", "matched_order_id INTEGER");
ensureColumn("supplier_costs", "matched_order_tracking_id", "matched_order_tracking_id INTEGER");
ensureColumn("supplier_costs", "source_key", "source_key TEXT");
ensureColumn("supplier_costs", "surcharge_type", "surcharge_type TEXT");
ensureColumn("supplier_costs", "public_note_recorded_at", "public_note_recorded_at TEXT");
ensureColumn("supplier_costs", "audit_recorded_at", "audit_recorded_at TEXT");
if(supplierCostNeedsPublicNoteBackfill)db.prepare("UPDATE supplier_costs SET public_note_recorded_at=COALESCE(public_note_recorded_at,created_at,CURRENT_TIMESTAMP)").run();
ensureColumn("ledger_entries", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("ledger_entries", "client_user_id", "client_user_id INTEGER");
ensureColumn("users", "is_root_admin", "is_root_admin INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "sales_user_id", "sales_user_id INTEGER");
ensureColumn("import_batches", "created_by_user_id", "created_by_user_id INTEGER");
ensureColumn("order_trackings", "shipment_status", "shipment_status TEXT NOT NULL DEFAULT 'WAITING_HANDOVER'");
ensureColumn("order_trackings", "etd_at", "etd_at TEXT");
ensureColumn("order_trackings", "delivered_at", "delivered_at TEXT");
ensureColumn("order_trackings", "status_updated_at", "status_updated_at TEXT");
ensureColumn("order_trackings", "status_updated_by_user_id", "status_updated_by_user_id INTEGER");
ensureColumn("order_trackings", "carton_id", "carton_id INTEGER");
ensureColumn("supplier_costs", "order_lot_id", "order_lot_id INTEGER");

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_root_admin ON users(is_root_admin) WHERE is_root_admin=1");
db.exec("CREATE INDEX IF NOT EXISTS idx_users_sales_owner ON users(sales_user_id,role)");
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_client_user ON orders(client_user_id)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_system_code ON orders(system_order_code) WHERE system_order_code IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_client_order_id ON orders(client_user_id,order_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_order_trackings_shipping ON order_trackings(shipment_status,etd_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_order_trackings_carton ON order_trackings(carton_id,status)");
db.exec("CREATE INDEX IF NOT EXISTS idx_ledger_client_user ON ledger_entries(client_user_id)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_cancellation_refund ON ledger_entries(reference_id) WHERE entry_type='REFUND' AND reference_type='ORDER_CANCELLATION'");
db.exec("CREATE INDEX IF NOT EXISTS idx_supplier_costs_normalized_tracking ON supplier_costs(normalized_tracking)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_costs_source_key ON supplier_costs(source_key) WHERE source_key IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_supplier_costs_order_lot ON supplier_costs(order_lot_id)");
db.prepare("UPDATE supplier_costs SET normalized_tracking=UPPER(REPLACE(REPLACE(TRIM(tracking),' ',''),'-','')) WHERE normalized_tracking IS NULL OR normalized_tracking=''").run();
// One-time compatibility migration: every legacy Order tracking becomes the first
// tracking row. The legacy columns remain as a denormalized primary tracking for
// older reports while order_trackings becomes the source of truth.
db.exec(`
  INSERT OR IGNORE INTO order_trackings(order_id,lot_number,tracking,normalized_tracking,label_url,status,is_primary)
  SELECT id,1,tracking,UPPER(REPLACE(REPLACE(TRIM(tracking),' ',''),'-','')),NULLIF(label,''),'ACTIVE',1
  FROM orders WHERE workflow_status<>'CANCELLED' AND tracking IS NOT NULL AND TRIM(tracking)<>'';
`);

// Backfill normalized Order -> Lot -> Carton -> SKU structures without
// inventing carton-level facts for legacy multi-carton Orders.
db.transaction(()=>{
  const legacyOrders=db.prepare("SELECT id,expected_lot_count,carton_count,item,material,declared_value,weight,length,width,height,volume,chargeable_weight FROM orders ORDER BY id").all() as Array<Record<string,unknown>>;
  const insertLot=db.prepare("INSERT OR IGNORE INTO order_lots(order_id,lot_number) VALUES (?,?)");
  const insertCarton=db.prepare("INSERT OR IGNORE INTO order_cartons(order_id,order_lot_id,carton_number) VALUES (?,?,?)");
  const updateSimpleCarton=db.prepare("UPDATE order_cartons SET order_lot_id=?,weight=?,length=?,width=?,height=?,volume=?,chargeable_weight=?,details_complete=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND carton_number=1");
  const insertLegacyItem=db.prepare("INSERT OR IGNORE INTO order_items(order_id,sku,description,material,unit_manufacturing_value,currency) VALUES (?,'',?,?,?,'USD')");
  const insertAllocation=db.prepare("INSERT OR IGNORE INTO carton_items(carton_id,order_item_id,quantity) VALUES (?,?,1)");
  const findLot=db.prepare("SELECT id FROM order_lots WHERE order_id=? AND lot_number=?");
  const findCarton=db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=?");
  const findLegacyItem=db.prepare("SELECT id FROM order_items WHERE order_id=? AND sku=''");
  const activeTrackings=db.prepare("SELECT id,lot_number FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id");
  const mapTracking=db.prepare("UPDATE order_trackings SET carton_id=?,lot_number=? WHERE id=?");
  const inheritReplacementCarton=db.prepare("UPDATE order_trackings SET carton_id=(SELECT newer.carton_id FROM order_trackings newer WHERE newer.id=order_trackings.replaced_by_tracking_id) WHERE order_id=? AND carton_id IS NULL AND replaced_by_tracking_id IS NOT NULL");
  for(const order of legacyOrders){
    const orderId=Number(order.id);
    const lotCount=Math.max(1,Math.trunc(Number(order.expected_lot_count||1)));
    const cartonCount=Math.max(1,Math.trunc(Number(order.carton_count||1)));
    for(let lotNo=1;lotNo<=lotCount;lotNo++)insertLot.run(orderId,lotNo);
    const lot1=(findLot.get(orderId,1) as {id:number}).id;
    for(let cartonNo=1;cartonNo<=cartonCount;cartonNo++)insertCarton.run(orderId,lotCount===1?lot1:null,cartonNo);
    if(cartonCount===1){
      const complete=Number(order.weight||0)>0
        && (Number(order.volume||0)>0 || (Number(order.length||0)>0&&Number(order.width||0)>0&&Number(order.height||0)>0))
        && Boolean(String(order.item||"").trim());
      updateSimpleCarton.run(lot1,order.weight??null,order.length??null,order.width??null,order.height??null,order.volume??null,order.chargeable_weight??null,complete?1:0,orderId);
      const description=String(order.item||"").trim();
      if(description){
        insertLegacyItem.run(orderId,description,String(order.material||"").trim()||null,order.declared_value??null);
        const carton=findCarton.get(orderId,1) as {id:number};
        const item=findLegacyItem.get(orderId) as {id:number};
        insertAllocation.run(carton.id,item.id);
      }
    }
    const trackings=activeTrackings.all(orderId) as Array<{id:number;lot_number:number}>;
    trackings.forEach((tracking,index)=>{
      if(index>=cartonCount)return;
      const carton=findCarton.get(orderId,index+1) as {id:number};
      const lotNo=Math.min(lotCount,Math.max(1,Number(tracking.lot_number||1)));
      const lot=findLot.get(orderId,lotNo) as {id:number};
      db.prepare("UPDATE order_cartons SET order_lot_id=COALESCE(order_lot_id,?) WHERE id=?").run(lot.id,carton.id);
      mapTracking.run(carton.id,lotNo,tracking.id);
    });
    inheritReplacementCarton.run(orderId);
  }
}).immediate();
const ordersMissingCode=db.prepare("SELECT id,created_at FROM orders WHERE system_order_code IS NULL OR system_order_code='' ORDER BY id").all() as Array<{id:number;created_at:string|null}>;
const setSystemCode=db.prepare("UPDATE orders SET system_order_code=? WHERE id=?");
for(const row of ordersMissingCode){
  const dateMatch=String(row.created_at||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const stamp=dateMatch?dateMatch[1]+dateMatch[2]+dateMatch[3]:"LEGACY";
  setSystemCode.run("DMD-"+stamp+"-"+String(row.id).padStart(6,"0"),row.id);
}
// Legacy auto charges used Tracking as their identity. New financial updates use
// Order ID, so migrate the identity before an update can create a second debit.
db.transaction(()=>{
  const legacyCharges=db.prepare(`
    SELECT le.*,ot.order_id AS migration_order_id
    FROM ledger_entries le
    JOIN order_trackings ot ON ot.normalized_tracking=UPPER(REPLACE(REPLACE(TRIM(le.reference_id),' ',''),'-',''))
    WHERE le.entry_type='ORDER_CHARGE' AND le.reference_type='TRACKING'
    ORDER BY le.id
  `).all() as Array<Record<string,unknown>>;
  for(const charge of legacyCharges){
    const orderId=Number(charge.migration_order_id);
    const ref=String(orderId);
    const current=db.prepare("SELECT id FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND reference_type='ORDER' AND reference_id=?").get(ref) as {id:number}|undefined;
    if(current)db.prepare("DELETE FROM ledger_entries WHERE id=?").run(Number(charge.id));
    else db.prepare("UPDATE ledger_entries SET reference_type='ORDER',reference_id=?,client_user_id=COALESCE(client_user_id,(SELECT client_user_id FROM orders WHERE id=?)) WHERE id=?")
      .run(ref,orderId,Number(charge.id));
    db.prepare("INSERT INTO order_events(order_id,event_type,summary,visibility,source,before_json,after_json) VALUES (?,'ORDER_LEDGER_MIGRATED',?,'ADMIN','MIGRATION',?,?)")
      .run(orderId,current?"Loại bỏ công nợ tự động trùng khi chuyển tham chiếu Tracking sang Order.":"Chuyển tham chiếu công nợ tự động từ Tracking sang Order, giữ nguyên số tiền.",JSON.stringify(charge),JSON.stringify({reference_type:"ORDER",reference_id:ref,duplicate_removed:Boolean(current)}));
  }
})();
db.pragma("foreign_keys = ON");
const rootAdminCount = (db.prepare("SELECT COUNT(*) c FROM users WHERE is_root_admin=1").get() as {c:number}).c;
if(rootAdminCount===0){
  const firstAdmin=db.prepare("SELECT id FROM users WHERE role='ADMIN' ORDER BY id ASC LIMIT 1").get() as {id:number}|undefined;
  if(firstAdmin) db.prepare("UPDATE users SET is_root_admin=1 WHERE id=?").run(firstAdmin.id);
}

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
