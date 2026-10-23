import type Database from "better-sqlite3";
export function installEmergencySchema(db:Database.Database){
 db.exec(`
 CREATE TABLE IF NOT EXISTS emergency_route_holds(
 id INTEGER PRIMARY KEY,route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
 actor_id INTEGER NOT NULL,reason TEXT NOT NULL,prior_warehouse_hold INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,undone_at TEXT,undone_by INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS emergency_route_active ON emergency_route_holds(route_id) WHERE undone_at IS NULL;
 CREATE TABLE IF NOT EXISTS emergency_hold_orders(
 hold_id INTEGER NOT NULL REFERENCES emergency_route_holds(id),order_id INTEGER NOT NULL REFERENCES orders(id),
 snapshot_json TEXT NOT NULL,PRIMARY KEY(hold_id,order_id));
 CREATE TRIGGER IF NOT EXISTS emergency_route_freeze BEFORE UPDATE ON service_route_configs
 WHEN EXISTS(SELECT 1 FROM emergency_route_holds WHERE route_id=OLD.id AND undone_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'Undo Emergency Hold before editing route'); END;
 CREATE TRIGGER IF NOT EXISTS emergency_route_delete BEFORE DELETE ON service_route_configs
 WHEN EXISTS(SELECT 1 FROM emergency_route_holds WHERE route_id=OLD.id AND undone_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'Undo Emergency Hold before deleting route'); END;
 CREATE TRIGGER IF NOT EXISTS emergency_order_reassign BEFORE UPDATE OF service,sub_service,supplier ON orders
 WHEN (NEW.service IS NOT OLD.service OR NEW.sub_service IS NOT OLD.sub_service OR NEW.supplier IS NOT OLD.supplier)
 AND EXISTS(SELECT 1 FROM emergency_route_holds h JOIN service_route_configs r ON r.id=h.route_id WHERE h.undone_at IS NULL AND r.service=NEW.service COLLATE NOCASE AND r.sub_service=NEW.sub_service COLLATE NOCASE AND r.supplier=NEW.supplier COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'Route is under Emergency Hold'); END;
 CREATE TRIGGER IF NOT EXISTS emergency_order_freeze BEFORE UPDATE ON orders
 WHEN (NEW.workflow_status IS NOT OLD.workflow_status OR NEW.service IS NOT OLD.service OR NEW.sub_service IS NOT OLD.sub_service OR NEW.supplier IS NOT OLD.supplier OR NEW.total_due IS NOT OLD.total_due OR NEW.tracking IS NOT OLD.tracking OR NEW.label IS NOT OLD.label)
 AND EXISTS(SELECT 1 FROM emergency_hold_orders i JOIN emergency_route_holds h ON h.id=i.hold_id WHERE i.order_id=OLD.id AND h.undone_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'Order is under Emergency Hold'); END;
 CREATE TRIGGER IF NOT EXISTS emergency_order_delete BEFORE DELETE ON orders
 WHEN EXISTS(SELECT 1 FROM emergency_hold_orders i JOIN emergency_route_holds h ON h.id=i.hold_id WHERE i.order_id=OLD.id AND h.undone_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'Order is under Emergency Hold'); END;
 CREATE TRIGGER IF NOT EXISTS emergency_route_purchase BEFORE INSERT ON orders
 WHEN EXISTS(SELECT 1 FROM emergency_route_holds h JOIN service_route_configs r ON r.id=h.route_id WHERE h.undone_at IS NULL AND r.service=NEW.service COLLATE NOCASE AND r.sub_service=NEW.sub_service COLLATE NOCASE AND r.supplier=NEW.supplier COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'Route is under Emergency Hold'); END;
 `);
 for(const operation of ["INSERT","UPDATE","DELETE"]){
 const refs=operation==="UPDATE"?"OLD.order_id,NEW.order_id":(operation==="INSERT"?"NEW.order_id":"OLD.order_id");
 db.exec(`CREATE TRIGGER IF NOT EXISTS emergency_tracking_${operation} BEFORE ${operation} ON order_trackings
 WHEN EXISTS(SELECT 1 FROM emergency_hold_orders i JOIN emergency_route_holds h ON h.id=i.hold_id WHERE i.order_id IN (${refs}) AND h.undone_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'Tracking is under Emergency Hold'); END;`);
 }
}
