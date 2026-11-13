import type Database from "better-sqlite3";

/** Additive, staged V1 configuration. No operational price/currency cutover. */
export function installServiceV1Schema(db: Database.Database) {
 db.exec(`
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
 CREATE TRIGGER IF NOT EXISTS service_v1_config_no_update BEFORE UPDATE ON service_v1_config_versions
 BEGIN SELECT RAISE(ABORT,'Immutable V1 configuration'); END;
 CREATE TRIGGER IF NOT EXISTS service_v1_config_no_delete BEFORE DELETE ON service_v1_config_versions
 BEGIN SELECT RAISE(ABORT,'Immutable V1 configuration'); END;
 `);
}
