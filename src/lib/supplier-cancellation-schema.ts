import type Database from 'better-sqlite3';

export function installSupplierCancellationSchema(db:Database.Database){
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_cancellations(
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),supplier TEXT NOT NULL,
  tracking_label_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS supplier_cancellation_events(
  id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES supplier_cancellations(order_id),
  status TEXT NOT NULL CHECK(status IN ('PENDING','FOLLOWING_UP','RESOLVED')),
  note TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS supplier_cancellation_supplier ON supplier_cancellations(supplier);`);
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_cancellation_refund_choices(event_id INTEGER PRIMARY KEY REFERENCES supplier_cancellation_events(id),choice_json TEXT NOT NULL);`);
 for(const table of ['supplier_cancellations','supplier_cancellation_events','supplier_cancellation_refund_choices'])for(const op of ['UPDATE','DELETE'])
  db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Supplier cancellation history is immutable'); END;`);
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_void_policies(
  id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  fee_vnd TEXT NOT NULL, evidence_required TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS supplier_void_percent_policies(
   policy_id INTEGER PRIMARY KEY REFERENCES supplier_void_policies(id), refund_percent INTEGER NOT NULL CHECK(refund_percent IN (90,100)));
  CREATE TABLE IF NOT EXISTS supplier_void_cases(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  route_id INTEGER NOT NULL REFERENCES service_route_configs(id), supplier TEXT NOT NULL,
  incident_id INTEGER REFERENCES emergency_route_holds(id), reason TEXT NOT NULL,
  snapshot_json TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(incident_id,order_id));
  CREATE TABLE IF NOT EXISTS supplier_void_events(
  id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES supplier_void_cases(id),
  status TEXT NOT NULL CHECK(status IN ('PENDING','FOLLOWING_UP','RESOLVED','CONFIRMED','DENIED','EXPIRED')),
  note TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS supplier_void_scope ON supplier_void_cases(supplier,incident_id);
  CREATE INDEX IF NOT EXISTS supplier_void_history ON supplier_void_events(case_id,id);
  CREATE INDEX IF NOT EXISTS supplier_void_policy_route ON supplier_void_policies(route_id,id);`);
 for(const table of ['supplier_void_cases','supplier_void_events','supplier_void_policies','supplier_void_percent_policies'])for(const op of ['UPDATE','DELETE'])
  db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table}
  BEGIN SELECT RAISE(ABORT,'Supplier void history is immutable'); END;`);
}
