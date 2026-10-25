import type Database from 'better-sqlite3';

/** Snapshot in SQLite's purchase write lock: owner changes cannot interleave. */
export function installSalesAttributionSchema(db:Database.Database){
 db.transaction(()=>{
 if(!(db.prepare('PRAGMA table_info(orders)').all() as {name:string}[]).some(c=>c.name==='sales_attributed_at'))db.exec('ALTER TABLE orders ADD COLUMN sales_attributed_at TEXT');
 // Preserve existing attribution verbatim; never infer the historical owner from today's Client.
 db.exec(`UPDATE orders SET sales_attributed_at=COALESCE(service_purchased_at,purchase_completed_at,created_at)
 WHERE sales_attributed_at IS NULL AND (service_purchased_at IS NOT NULL OR purchase_completed_at IS NOT NULL);
 CREATE TABLE IF NOT EXISTS order_sales_snapshots(order_id INTEGER PRIMARY KEY,client_id INTEGER,sales_user_id INTEGER,sales_name TEXT,attributed_at TEXT NOT NULL,actor_id INTEGER);
 CREATE TRIGGER IF NOT EXISTS immutable_sales_snapshot_update BEFORE UPDATE ON order_sales_snapshots BEGIN SELECT RAISE(ABORT,'Sales snapshot is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_sales_snapshot_delete BEFORE DELETE ON order_sales_snapshots BEGIN SELECT RAISE(ABORT,'Sales snapshot is immutable'); END;
 CREATE TABLE IF NOT EXISTS client_sales_owner_history(
 id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL,previous_sales_user_id INTEGER,next_sales_user_id INTEGER,
 actor_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TRIGGER IF NOT EXISTS immutable_owner_history_update BEFORE UPDATE ON client_sales_owner_history BEGIN SELECT RAISE(ABORT,'Owner audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_owner_history_delete BEFORE DELETE ON client_sales_owner_history BEGIN SELECT RAISE(ABORT,'Owner audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS purchased_sales_immutable BEFORE UPDATE ON orders
 WHEN OLD.sales_attributed_at IS NOT NULL AND
 (NEW.sales_user_id IS NOT OLD.sales_user_id OR NEW.sales IS NOT OLD.sales OR NEW.client_user_id IS NOT OLD.client_user_id OR NEW.sales_attributed_at IS NOT OLD.sales_attributed_at)
 BEGIN SELECT RAISE(ABORT,'Purchased Sales attribution is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS snapshot_purchase_sales AFTER UPDATE OF service_purchased_at,purchase_completed_at ON orders
 WHEN OLD.service_purchased_at IS NULL AND OLD.purchase_completed_at IS NULL
 AND (NEW.service_purchased_at IS NOT NULL OR NEW.purchase_completed_at IS NOT NULL)
 AND OLD.sales_attributed_at IS NULL
 BEGIN
 SELECT CASE WHEN NEW.client_user_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM users c JOIN users s ON s.id=c.sales_user_id WHERE c.id=NEW.client_user_id AND c.role='CLIENT' AND s.role='SALES' AND s.active=1)
 THEN RAISE(ABORT,'Client cần Sales phụ trách active trước khi mua.') END;
 UPDATE orders SET sales_user_id=CASE WHEN NEW.client_user_id IS NULL THEN NEW.sales_user_id ELSE (SELECT sales_user_id FROM users WHERE id=NEW.client_user_id) END,
 sales=CASE WHEN NEW.client_user_id IS NULL THEN NEW.sales ELSE (SELECT s.display_name FROM users c JOIN users s ON s.id=c.sales_user_id WHERE c.id=NEW.client_user_id) END,
 sales_attributed_at=COALESCE(NEW.service_purchased_at,NEW.purchase_completed_at) WHERE id=NEW.id;
 INSERT INTO order_sales_snapshots(order_id,client_id,sales_user_id,sales_name,attributed_at,actor_id)
 SELECT id,client_user_id,sales_user_id,sales,sales_attributed_at,updated_by_user_id FROM orders WHERE id=NEW.id;
 END;`);
 }).immediate();
}
