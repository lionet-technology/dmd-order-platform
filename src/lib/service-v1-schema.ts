import type Database from "better-sqlite3";

/** Additive, staged V1 configuration. No operational price/currency cutover. */
export function installServiceV1Schema(db: Database.Database) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS service_v1_quotes(
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  client_id INTEGER NOT NULL REFERENCES users(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  snapshot_json TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE INDEX IF NOT EXISTS service_v1_quotes_client ON service_v1_quotes(client_id,id);
 CREATE TRIGGER IF NOT EXISTS service_v1_quote_no_update BEFORE UPDATE ON service_v1_quotes
 BEGIN SELECT RAISE(ABORT,'Immutable V1 quote'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_quote_no_delete BEFORE DELETE ON service_v1_quotes
 BEGIN SELECT RAISE(ABORT,'Immutable V1 quote'); END;

 CREATE TABLE IF NOT EXISTS service_v1_config_versions(
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  revision INTEGER NOT NULL CHECK(revision>0),
  config_json TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(route_id,revision)
 );

 CREATE TABLE IF NOT EXISTS service_v1_price_documents(
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  kind TEXT NOT NULL CHECK(kind IN ('NET','PROPOSAL')),
  config_id INTEGER NOT NULL REFERENCES service_v1_config_versions(id),
  source_net_id INTEGER REFERENCES service_v1_price_documents(id),
  body_json TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS service_v1_price_events(
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES service_v1_price_documents(id),
  action TEXT NOT NULL CHECK(action IN ('REVIEW','PUBLISH')),
  expected_published_id INTEGER,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id,action)
 );
 CREATE TRIGGER IF NOT EXISTS service_v1_price_document_no_update BEFORE UPDATE ON service_v1_price_documents
 BEGIN SELECT RAISE(ABORT,'Immutable V1 price document'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_price_document_no_delete BEFORE DELETE ON service_v1_price_documents
 BEGIN SELECT RAISE(ABORT,'Immutable V1 price document'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_price_event_no_update BEFORE UPDATE ON service_v1_price_events
 BEGIN SELECT RAISE(ABORT,'Immutable V1 price event'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_price_event_no_delete BEFORE DELETE ON service_v1_price_events
 BEGIN SELECT RAISE(ABORT,'Immutable V1 price event'); END;


 CREATE TABLE IF NOT EXISTS service_v1_ups_global_versions(
  id INTEGER PRIMARY KEY,variables_json TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS service_v1_ups_global_confirmations(
  id INTEGER PRIMARY KEY,version_id INTEGER NOT NULL UNIQUE REFERENCES service_v1_ups_global_versions(id),
  expected_previous_id INTEGER,actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TRIGGER IF NOT EXISTS v1_ups_globals_no_update BEFORE UPDATE ON service_v1_ups_global_versions BEGIN SELECT RAISE(ABORT,'Immutable UPS globals'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_globals_no_delete BEFORE DELETE ON service_v1_ups_global_versions BEGIN SELECT RAISE(ABORT,'Immutable UPS globals'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_confirm_no_update BEFORE UPDATE ON service_v1_ups_global_confirmations BEGIN SELECT RAISE(ABORT,'Immutable UPS confirmation'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_confirm_no_delete BEFORE DELETE ON service_v1_ups_global_confirmations BEGIN SELECT RAISE(ABORT,'Immutable UPS confirmation'); END;


 CREATE TABLE IF NOT EXISTS service_v1_ups_account_versions(
  id INTEGER PRIMARY KEY,route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
  config_id INTEGER NOT NULL REFERENCES service_v1_config_versions(id),
  account TEXT NOT NULL CHECK(account IN ('VTT','SDS','JD')),
  source_excel TEXT NOT NULL,body_json TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS service_v1_ups_account_events(
  id INTEGER PRIMARY KEY,version_id INTEGER NOT NULL REFERENCES service_v1_ups_account_versions(id),
  action TEXT NOT NULL CHECK(action IN ('REVIEW','PUBLISH')),
  expected_previous_id INTEGER,actor_id INTEGER NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(version_id,action)
 );
 CREATE TRIGGER IF NOT EXISTS v1_ups_account_no_update BEFORE UPDATE ON service_v1_ups_account_versions BEGIN SELECT RAISE(ABORT,'Immutable UPS account'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_account_no_delete BEFORE DELETE ON service_v1_ups_account_versions BEGIN SELECT RAISE(ABORT,'Immutable UPS account'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_account_event_no_update BEFORE UPDATE ON service_v1_ups_account_events BEGIN SELECT RAISE(ABORT,'Immutable UPS account event'); END;
 CREATE TRIGGER IF NOT EXISTS v1_ups_account_event_no_delete BEFORE DELETE ON service_v1_ups_account_events BEGIN SELECT RAISE(ABORT,'Immutable UPS account event'); END;

 CREATE TRIGGER IF NOT EXISTS service_v1_config_no_update BEFORE UPDATE ON service_v1_config_versions
 BEGIN SELECT RAISE(ABORT,'Immutable V1 configuration'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_config_no_delete BEFORE DELETE ON service_v1_config_versions
 BEGIN SELECT RAISE(ABORT,'Immutable V1 configuration'); END;
 `);
}
