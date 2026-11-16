import {db} from './db';
import type {AuthUser} from './auth';
import {logAdminEvent} from './order-audit';
type Row=Record<string,unknown>;
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
for(const table of ['supplier_cancellations','supplier_cancellation_events'])for(const op of ['UPDATE','DELETE'])
 db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Supplier cancellation history is immutable'); END;`);
function access(user:AuthUser){if(!['ADMIN','FINANCE','BOD'].includes(user.role))throw Error('Không có quyền theo dõi huỷ với Supplier.');}
/** Called inside the cancellation transaction; snapshot before in-app Tracking is cancelled. */
export function recordSupplierCancellation(order:Row,user:AuthUser,reason:string){
 const orderId=Number(order.id);
 const snapshot={legacy_tracking:order.tracking||null,legacy_label:order.label||null,
 trackings:db.prepare('SELECT id,tracking,label_url,status FROM order_trackings WHERE order_id=? ORDER BY id').all(orderId)};
 db.prepare('INSERT INTO supplier_cancellations(order_id,supplier,tracking_label_json,reason,actor_id) VALUES (?,?,?,?,?)')
 .run(orderId,String(order.supplier||''),JSON.stringify(snapshot),reason,user.id);
 db.prepare("INSERT INTO supplier_cancellation_events(order_id,status,note,actor_id,request_key) VALUES (?,'PENDING',?,?,?)")
 .run(orderId,'Chờ liên hệ Supplier; chưa xác nhận Supplier huỷ hoặc hoàn tiền.',user.id,'cancellation:'+orderId);
 logAdminEvent({orderId,eventType:'SUPPLIER_CANCELLATION_PENDING',summary:'Đơn huỷ chờ xử lý Supplier.',actorId:user.id,after:{supplier:order.supplier,status:'PENDING',snapshot}});
}
export function supplierCancellationQueue(user:AuthUser,filter:{supplier?:string;status?:string}={}){
 access(user);
 if(filter.status&&!['PENDING','FOLLOWING_UP','RESOLVED','ALL'].includes(filter.status))throw Error('Trạng thái không hợp lệ.');
 const rows=db.prepare(`SELECT c.*,o.system_order_code,o.order_id client_order_id,
 (SELECT status FROM supplier_cancellation_events e WHERE e.order_id=c.order_id ORDER BY id DESC LIMIT 1) status
 FROM supplier_cancellations c JOIN orders o ON o.id=c.order_id ORDER BY c.created_at,c.order_id`).all() as Row[];
 return rows.filter(r=>(!filter.supplier||r.supplier===filter.supplier)&&(filter.status==='ALL'||(filter.status?r.status===filter.status:r.status!=='RESOLVED')))
 .map(r=>({...r,tracking_label:JSON.parse(String(r.tracking_label_json)),history:db.prepare('SELECT * FROM supplier_cancellation_events WHERE order_id=? ORDER BY id').all(r.order_id)}));
}
export function updateSupplierCancellation(user:AuthUser,input:Row){
 access(user);
 const orderId=Number(input.order_id),status=String(input.status),note=String(input.note||'').trim(),key=String(input.request_key||'').trim();
 if(!Number.isSafeInteger(orderId)||orderId<=0||!['PENDING','FOLLOWING_UP','RESOLVED'].includes(status)||!note||note.length>2000||!key||key.length>200)throw Error('Cần Order, trạng thái, ghi chú và request_key hợp lệ.');
 return db.transaction(()=>{
 const prior=db.prepare('SELECT * FROM supplier_cancellation_events WHERE request_key=?').get(key) as Row|undefined;
 if(prior){if(prior.order_id!==orderId||prior.status!==status||prior.note!==note||prior.actor_id!==user.id)throw Error('request_key đã dùng cho thao tác khác.');return prior;}
 if(!db.prepare('SELECT 1 FROM supplier_cancellations WHERE order_id=?').get(orderId))throw Error('Không có record huỷ Supplier.');
 const latest=db.prepare('SELECT id FROM supplier_cancellation_events WHERE order_id=? ORDER BY id DESC LIMIT 1').get(orderId) as {id:number};
 if(Number(input.expected_event_id)!==latest.id)throw Error('Trạng thái đã thay đổi; tải lại trước khi cập nhật.');
 const id=Number(db.prepare('INSERT INTO supplier_cancellation_events(order_id,status,note,actor_id,request_key) VALUES (?,?,?,?,?)').run(orderId,status,note,user.id,key).lastInsertRowid);
 logAdminEvent({orderId,eventType:'SUPPLIER_CANCELLATION_FOLLOWUP',summary:'Cập nhật xử lý huỷ với Supplier.',actorId:user.id,after:{status,note,event_id:id}});
 return db.prepare('SELECT * FROM supplier_cancellation_events WHERE id=?').get(id);
 }).immediate();
}
