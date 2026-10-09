import type Database from 'better-sqlite3';
import fs from 'node:fs';
type Row=Record<string,unknown>;
export function migrateRouteArchitecture(db:Database.Database,dbPath:string){
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='route_architecture_migrations'").get())return;
 const conflicts=db.prepare("SELECT lower(trim(service)) service,lower(trim(sub_service)) sub_service,group_concat(id) route_ids FROM service_route_configs WHERE active=1 GROUP BY lower(trim(service)),lower(trim(sub_service)) HAVING count(*)>1").all();
 if(conflicts.length){fs.writeFileSync(dbPath+'.route-conflicts.json',JSON.stringify(conflicts,null,2));throw Error('Route migration bị chặn: nhiều ACTIVE route cùng dịch vụ. Xem '+dbPath+'.route-conflicts.json');}
 const issues:Row[]=[];
 db.pragma('foreign_keys = OFF');
 db.pragma('legacy_alter_table = ON');
 try{db.transaction(()=>{
 const schema=(db.prepare("SELECT sql FROM sqlite_master WHERE name='service_route_configs'").get() as {sql:string}).sql;
 db.exec('ALTER TABLE service_route_configs RENAME TO route_configs_legacy');
 db.exec(schema.replace(/,\s*UNIQUE\(service,sub_service,supplier\)/,''));
 db.exec('INSERT INTO service_route_configs SELECT * FROM route_configs_legacy; DROP TABLE route_configs_legacy;');
 db.exec(`CREATE TABLE service_identities(id INTEGER PRIMARY KEY AUTOINCREMENT,service TEXT NOT NULL,sub_service TEXT NOT NULL DEFAULT '');
 CREATE UNIQUE INDEX service_identity_unique ON service_identities(lower(trim(service)),lower(trim(sub_service)));
 ALTER TABLE service_route_configs ADD COLUMN service_identity_id INTEGER REFERENCES service_identities(id);
 ALTER TABLE service_route_configs ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED'));
 ALTER TABLE service_route_configs ADD COLUMN pricing_engine TEXT;
 UPDATE service_route_configs SET pricing_engine='EPACKET_US' WHERE lower(service)='epacket' AND lower(sub_service) IN ('standard','eco');
 ALTER TABLE orders ADD COLUMN route_id INTEGER REFERENCES service_route_configs(id) ON DELETE RESTRICT;
 ALTER TABLE client_service_settings ADD COLUMN service_identity_id INTEGER REFERENCES service_identities(id);
 ALTER TABLE supplier_costs ADD COLUMN route_id INTEGER REFERENCES service_route_configs(id);
 CREATE TABLE order_route_change_proposals(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id),old_route_id INTEGER,new_route_id INTEGER NOT NULL REFERENCES service_route_configs(id),old_total_cents INTEGER NOT NULL,new_total_cents INTEGER NOT NULL,quote_json TEXT NOT NULL,order_before_json TEXT NOT NULL,reason TEXT NOT NULL,proposed_by INTEGER NOT NULL REFERENCES users(id),confirmed_by INTEGER REFERENCES users(id),status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,confirmed_at TEXT);
 CREATE TABLE route_lifecycle_audit(id INTEGER PRIMARY KEY,route_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL,summary_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE route_architecture_issues(id INTEGER PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,reason TEXT NOT NULL,candidates_json TEXT NOT NULL);
 CREATE TABLE route_architecture_migrations(version INTEGER PRIMARY KEY,completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 UPDATE service_route_configs SET status=CASE WHEN active=1 THEN 'ACTIVE' ELSE 'INACTIVE' END;
 INSERT OR IGNORE INTO service_identities(service,sub_service) SELECT trim(service),trim(sub_service) FROM service_route_configs;
 INSERT OR IGNORE INTO service_identities(service,sub_service) SELECT trim(service),trim(sub_service) FROM client_service_settings;
 UPDATE service_route_configs SET service_identity_id=(SELECT id FROM service_identities s WHERE lower(trim(s.service))=lower(trim(service_route_configs.service)) AND lower(trim(s.sub_service))=lower(trim(service_route_configs.sub_service)));
 UPDATE client_service_settings SET service_identity_id=(SELECT id FROM service_identities s WHERE lower(trim(s.service))=lower(trim(client_service_settings.service)) AND lower(trim(s.sub_service))=lower(trim(client_service_settings.sub_service)));
 CREATE UNIQUE INDEX route_active_identity_unique ON service_route_configs(lower(trim(service)),lower(trim(sub_service))) WHERE active=1;
 CREATE INDEX order_route_index ON orders(route_id);`);
 for(const o of db.prepare('SELECT * FROM orders').all() as Row[]){
 const frozen=o.pricing_snapshot_json?JSON.parse(String(o.pricing_snapshot_json)):null;
 let matches:Row[];
 if(frozen?.route_id)matches=db.prepare('SELECT * FROM service_route_configs WHERE id=? AND lower(trim(service))=lower(trim(?)) AND lower(trim(sub_service))=lower(trim(?)) AND lower(trim(supplier))=lower(trim(?))').all(frozen.route_id,String(o.service||''),String(o.sub_service||''),String(o.supplier||'')) as Row[];
 else matches=db.prepare("SELECT * FROM service_route_configs WHERE lower(trim(service))=lower(trim(?)) AND lower(trim(sub_service))=lower(trim(?)) AND (?='' OR lower(trim(supplier))=lower(trim(?)))").all(String(o.service||''),String(o.sub_service||''),String(o.supplier||''),String(o.supplier||'')) as Row[];
 if(matches.length===1)db.prepare('UPDATE orders SET route_id=?,supplier=? WHERE id=?').run(matches[0].id,matches[0].supplier,o.id);
 else{const issue={entity_type:'ORDER',entity_id:Number(o.id),reason:matches.length?'AMBIGUOUS':'NO_MATCH',candidates_json:JSON.stringify(matches.map(r=>r.id))};issues.push(issue);db.prepare('INSERT INTO route_architecture_issues(entity_type,entity_id,reason,candidates_json) VALUES (@entity_type,@entity_id,@reason,@candidates_json)').run(issue);}
 }
 for(const c of db.prepare("SELECT c.id,c.matched_order_id,c.supplier,o.supplier expected_supplier FROM supplier_costs c JOIN orders o ON o.id=c.matched_order_id WHERE trim(COALESCE(c.supplier,''))<>'' AND lower(trim(c.supplier))<>lower(trim(o.supplier))").all() as Row[]){const issue={entity_type:'SUPPLIER_COST',entity_id:Number(c.id),reason:'SUPPLIER_MISMATCH',candidates_json:JSON.stringify(c)};issues.push(issue);db.prepare('INSERT INTO route_architecture_issues(entity_type,entity_id,reason,candidates_json) VALUES (@entity_type,@entity_id,@reason,@candidates_json)').run(issue);}
 for(const m of db.prepare('SELECT id FROM manifest_cartons WHERE route_config_id IS NULL').all() as Row[]){
 const candidates=db.prepare('SELECT DISTINCT o.route_id FROM orders o JOIN manifest_carton_items i ON i.order_id=o.id WHERE i.manifest_carton_id=?').all(m.id) as Row[];
 if(candidates.length===1&&candidates[0].route_id)db.prepare('UPDATE manifest_cartons SET route_config_id=? WHERE id=?').run(candidates[0].route_id,m.id);
 else if(candidates.length){const issue={entity_type:'MANIFEST',entity_id:Number(m.id),reason:'AMBIGUOUS',candidates_json:JSON.stringify(candidates)};issues.push(issue);db.prepare('INSERT INTO route_architecture_issues(entity_type,entity_id,reason,candidates_json) VALUES (@entity_type,@entity_id,@reason,@candidates_json)').run(issue);}
 }
 db.exec(`UPDATE supplier_costs SET route_id=(SELECT route_id FROM orders WHERE orders.id=supplier_costs.matched_order_id) WHERE trim(COALESCE(supplier,''))='' OR lower(trim(supplier))=lower(trim((SELECT supplier FROM orders WHERE orders.id=supplier_costs.matched_order_id)));
 DROP TRIGGER immutable_order_price;
 CREATE TRIGGER immutable_order_price BEFORE UPDATE OF pricing_snapshot_json,pricing_version_id,pricing_config_version_id,service_purchased_at ON orders
 WHEN OLD.pricing_snapshot_json IS NOT NULL AND (NEW.pricing_snapshot_json IS NOT OLD.pricing_snapshot_json OR NEW.pricing_version_id IS NOT OLD.pricing_version_id OR NEW.pricing_config_version_id IS NOT OLD.pricing_config_version_id OR NEW.service_purchased_at IS NOT OLD.service_purchased_at)
 AND NOT EXISTS(SELECT 1 FROM order_route_change_proposals p WHERE p.order_id=OLD.id AND p.status='APPLYING' AND p.old_route_id=OLD.route_id AND p.new_route_id=NEW.route_id AND p.quote_json=NEW.pricing_snapshot_json AND p.confirmed_by IS NOT NULL AND NEW.service_purchased_at IS OLD.service_purchased_at AND OLD.purchase_completed_at IS NULL AND OLD.tracking IS NULL AND NOT EXISTS(SELECT 1 FROM order_trackings WHERE order_id=OLD.id))
 BEGIN SELECT RAISE(ABORT,'Purchased pricing is immutable'); END;
 CREATE TRIGGER route_config_immutable BEFORE UPDATE OF route_variables_json,pricing_engine ON service_route_configs WHEN (NEW.route_variables_json IS NOT OLD.route_variables_json OR NEW.pricing_engine IS NOT OLD.pricing_engine) AND EXISTS(SELECT 1 FROM orders WHERE route_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Route config has orders; create a new route'); END;
 CREATE TRIGGER route_status_sync AFTER UPDATE OF status ON service_route_configs WHEN NEW.status IS NOT OLD.status BEGIN UPDATE service_route_configs SET active=CASE WHEN NEW.status='ACTIVE' THEN 1 ELSE 0 END WHERE id=NEW.id; END;
 CREATE TRIGGER route_identity_immutable BEFORE UPDATE OF service,sub_service,supplier,service_identity_id ON service_route_configs WHEN NEW.service IS NOT OLD.service OR NEW.sub_service IS NOT OLD.sub_service OR NEW.supplier IS NOT OLD.supplier OR (OLD.service_identity_id IS NOT NULL AND NEW.service_identity_id IS NOT OLD.service_identity_id) BEGIN SELECT RAISE(ABORT,'Route identity is immutable; create a new route'); END;
 CREATE TRIGGER route_identity_insert AFTER INSERT ON service_route_configs BEGIN
 INSERT OR IGNORE INTO service_identities(service,sub_service) VALUES(trim(NEW.service),trim(NEW.sub_service));
 UPDATE service_route_configs SET service_identity_id=(SELECT id FROM service_identities WHERE lower(trim(service))=lower(trim(NEW.service)) AND lower(trim(sub_service))=lower(trim(NEW.sub_service))),status=CASE WHEN NEW.active=1 THEN 'ACTIVE' ELSE NEW.status END WHERE id=NEW.id; END;
 CREATE TRIGGER route_active_status AFTER UPDATE OF active ON service_route_configs WHEN NEW.active IS NOT OLD.active BEGIN UPDATE service_route_configs SET status=CASE WHEN NEW.active=1 THEN 'ACTIVE' WHEN NEW.status='ARCHIVED' THEN 'ARCHIVED' ELSE 'INACTIVE' END WHERE id=NEW.id; END;
 CREATE TRIGGER route_delete_orders BEFORE DELETE ON service_route_configs WHEN EXISTS(SELECT 1 FROM orders WHERE route_id=OLD.id) OR EXISTS(SELECT 1 FROM route_architecture_issues WHERE entity_type='ORDER' AND reason='AMBIGUOUS' AND EXISTS(SELECT 1 FROM json_each(candidates_json) WHERE value=OLD.id)) BEGIN SELECT RAISE(ABORT,'Route has historical orders; archive instead'); END;
 CREATE TRIGGER order_route_insert BEFORE INSERT ON orders WHEN NEW.route_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM service_route_configs WHERE id=NEW.route_id AND active=1 AND service=NEW.service COLLATE NOCASE AND sub_service=NEW.sub_service COLLATE NOCASE AND supplier=NEW.supplier COLLATE NOCASE) BEGIN SELECT RAISE(ABORT,'Invalid configured order route'); END;
 CREATE TRIGGER order_route_validate BEFORE UPDATE OF route_id,service,sub_service,supplier ON orders WHEN NEW.route_id IS NOT NULL AND (NEW.route_id IS NOT OLD.route_id OR NEW.service IS NOT OLD.service OR NEW.sub_service IS NOT OLD.sub_service OR NEW.supplier IS NOT OLD.supplier) AND NOT EXISTS(SELECT 1 FROM service_route_configs WHERE id=NEW.route_id AND service=NEW.service COLLATE NOCASE AND sub_service=NEW.sub_service COLLATE NOCASE AND supplier=NEW.supplier COLLATE NOCASE) BEGIN SELECT RAISE(ABORT,'Order fields must match concrete Route'); END;
 CREATE TRIGGER order_route_update BEFORE UPDATE OF route_id,service,sub_service,supplier ON orders WHEN OLD.route_id IS NOT NULL AND (NEW.route_id IS NOT OLD.route_id OR NEW.service IS NOT OLD.service OR NEW.sub_service IS NOT OLD.sub_service OR NEW.supplier IS NOT OLD.supplier) AND (OLD.purchase_completed_at IS NOT NULL OR OLD.tracking IS NOT NULL OR EXISTS(SELECT 1 FROM order_trackings WHERE order_id=OLD.id) OR (OLD.pricing_snapshot_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM order_route_change_proposals WHERE order_id=OLD.id AND status='APPLYING' AND old_route_id=OLD.route_id AND new_route_id=NEW.route_id AND confirmed_by IS NOT NULL))) BEGIN SELECT RAISE(ABORT,'Purchased/tracked route is immutable'); END;
 CREATE TRIGGER setting_identity_insert AFTER INSERT ON client_service_settings BEGIN
 INSERT OR IGNORE INTO service_identities(service,sub_service) VALUES(trim(NEW.service),trim(NEW.sub_service));
 UPDATE client_service_settings SET service_identity_id=(SELECT id FROM service_identities WHERE lower(trim(service))=lower(trim(NEW.service)) AND lower(trim(sub_service))=lower(trim(NEW.sub_service))) WHERE id=NEW.id; END;
 INSERT INTO route_architecture_migrations(version) VALUES(1);`);
 }).immediate();}finally{
 db.pragma('legacy_alter_table = OFF');
 db.pragma('foreign_keys = ON');
 }
 fs.writeFileSync(dbPath+'.route-backfill-report.json',JSON.stringify({issues},null,2));
}

// Older warehouse schemas can be restored independently of the Route migration.
export function backfillLegacyManifestRoutes(db:Database.Database){
 for(const m of db.prepare('SELECT id FROM manifest_cartons WHERE route_config_id IS NULL').all() as Row[]){
 const orders=db.prepare('SELECT DISTINCT o.* FROM orders o JOIN manifest_carton_items i ON i.order_id=o.id WHERE i.manifest_carton_id=?').all(m.id) as Row[];
 const ids=new Set<number>();let unique=orders.length>0;
 for(const o of orders){const rows=o.route_id?db.prepare('SELECT id FROM service_route_configs WHERE id=?').all(o.route_id):db.prepare("SELECT id FROM service_route_configs WHERE lower(trim(service))=lower(trim(?)) AND lower(trim(sub_service))=lower(trim(?)) AND (?='' OR lower(trim(supplier))=lower(trim(?)))").all(String(o.service||''),String(o.sub_service||''),String(o.supplier||''),String(o.supplier||''));if(rows.length!==1){unique=false;break}ids.add(Number((rows[0] as Row).id));}
 if(unique&&ids.size===1)db.prepare('UPDATE manifest_cartons SET route_config_id=? WHERE id=?').run([...ids][0],m.id);
 }
}
