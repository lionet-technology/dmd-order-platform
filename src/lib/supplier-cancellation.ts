import {db} from './db';
import type {AuthUser} from './auth';
import {emergencyException} from './emergency-hold';
import {logAdminEvent} from './order-audit';
import {vnd,compareVnd,multiplyVnd} from './vnd-money';
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
db.exec(`CREATE TABLE IF NOT EXISTS supplier_cancellation_refund_choices(event_id INTEGER PRIMARY KEY REFERENCES supplier_cancellation_events(id),choice_json TEXT NOT NULL);`);
for(const table of ['supplier_cancellations','supplier_cancellation_events','supplier_cancellation_refund_choices'])for(const op of ['UPDATE','DELETE'])
 db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Supplier cancellation history is immutable'); END;`);
function access(user:AuthUser){const actual=db.prepare('SELECT role,active FROM users WHERE id=?').get(user.id) as Row|undefined;if(!actual?.active||actual.role!==user.role||!['ADMIN','FINANCE','BOD'].includes(user.role))throw Error('Không có quyền theo dõi huỷ với Supplier.');}
db.exec(`CREATE TABLE IF NOT EXISTS supplier_void_policies(
 id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES service_route_configs(id),
 fee_vnd TEXT NOT NULL, evidence_required TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
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
for(const table of ['supplier_void_cases','supplier_void_events','supplier_void_policies'])for(const op of ['UPDATE','DELETE'])
 db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table}
 BEGIN SELECT RAISE(ABORT,'Supplier void history is immutable'); END;`);

const voidStatuses=['PENDING','FOLLOWING_UP','RESOLVED','CONFIRMED','DENIED','EXPIRED'];
function requiredText(raw:unknown,max:number){
 const value=typeof raw==='string'?raw.trim():'';
 if(!value||value.length>max)throw Error('Cần nội dung hợp lệ.');
 return value;
}

function appendVoidEvent(caseId:number,status:string,note:string,actorId:number,key:string){
 const id=db.prepare('INSERT INTO supplier_void_events(case_id,status,note,actor_id,request_key) VALUES (?,?,?,?,?)')
 .run(caseId,status,note,actorId,key).lastInsertRowid;
 return db.prepare('SELECT * FROM supplier_void_events WHERE id=?').get(id);
}

/** Capture the departing route before the caller changes its Tracking or route. */
export function recordSupplierVoid(order:Row,user:AuthUser,routeId:number,incidentId:number|null,reason:string,key:string){
 const orderId=Number(order.id);
 const route=db.prepare('SELECT service,sub_service,supplier FROM service_route_configs WHERE id=?').get(routeId) as Row|undefined;
 if(!route||['service','sub_service','supplier'].some(field=>String(route[field]).toLowerCase()!==String(order[field]).toLowerCase()))
  throw Error('Route gốc không còn khớp Order.');
 const policy=db.prepare('SELECT id,fee_vnd,evidence_required FROM supplier_void_policies WHERE route_id=? ORDER BY id DESC LIMIT 1').get(routeId)??null;
 const snapshot={
  service:route.service,sub_service:route.sub_service,policy,
  legacy_tracking:order.tracking||null,legacy_label:order.label||null,
  lots:db.prepare('SELECT id,lot_number FROM order_lots WHERE order_id=? ORDER BY lot_number').all(orderId),
  trackings:db.prepare("SELECT id,lot_number,tracking,label_url,status FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id").all(orderId),
 };
 const id=Number(db.prepare(`INSERT INTO supplier_void_cases
  (order_id,route_id,supplier,incident_id,reason,snapshot_json,request_key,actor_id) VALUES (?,?,?,?,?,?,?,?)`)
  .run(orderId,routeId,route.supplier,incidentId,reason,JSON.stringify(snapshot),key,user.id).lastInsertRowid);
 appendVoidEvent(id,'PENDING',reason,user.id,'case:'+id);
 logAdminEvent({orderId,eventType:'SUPPLIER_VOID_PENDING',summary:'Chờ xử lý void với Supplier.',actorId:user.id,after:{case_id:id,route_id:routeId,incident_id:incidentId}});
 return {id};
}

export function submitSupplierVoid(user:AuthUser,input:Row){
 access(user);
 return db.transaction(()=>{
  if(input.action==='configure_void'){
   if(user.role!=='ADMIN')throw Error('Chỉ Admin cấu hình phí void.');
   if(typeof input.fee_vnd!=='string')throw Error('Cần phí VNĐ dạng chuỗi.');
   const fee=vnd(input.fee_vnd);
   if(compareVnd(fee,'0')<0)throw Error('Phí void không được âm.');
   const routeId=Number(input.route_id),evidence=requiredText(input.evidence_required,2000);
   const latest=db.prepare('SELECT id,fee_vnd,evidence_required FROM supplier_void_policies WHERE route_id=? ORDER BY id DESC LIMIT 1').get(routeId) as Row|undefined;
   if(latest?.fee_vnd===fee&&latest.evidence_required===evidence)return {id:latest.id};
   if(Number(input.expected_policy_id??0)!==Number(latest?.id??0))throw Error('Chính sách đã thay đổi; tải lại trước khi cập nhật.');
   const {lastInsertRowid}=db.prepare('INSERT INTO supplier_void_policies(route_id,fee_vnd,evidence_required,actor_id) VALUES (?,?,?,?)')
    .run(routeId,fee,evidence,user.id);
   return {id:Number(lastInsertRowid)};
  }
  const key='user:'+requiredText(input.request_key,200);
  if(input.action==='open_void'){
   if(user.role!=='ADMIN')throw Error('Chỉ Admin mở yêu cầu void.');
   const orderId=Number(input.order_id),routeId=Number(input.route_id),reason=requiredText(input.note,2000);
   const prior=db.prepare('SELECT * FROM supplier_void_cases WHERE request_key=?').get(key) as Row|undefined;
   if(prior){
    if(prior.order_id!==orderId||prior.route_id!==routeId||prior.reason!==reason||prior.actor_id!==user.id)throw Error('request_key đã dùng.');
    return {id:prior.id};
   }
   const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as Row|undefined;
   if(!order||['CANCELLED','DELIVERED','CLOSED','HOLD'].includes(String(order.workflow_status)))throw Error('Cần Order đang hoạt động và ngoài Emergency Hold.');
   const exception=emergencyException(order);
   if(exception)throw Error(exception);
   return recordSupplierVoid(order,user,routeId,null,reason,key);
  }
  if(input.action!=='update_void')throw Error('Thao tác void không hợp lệ.');
  const caseId=Number(input.case_id),status=String(input.status),note=requiredText(input.note,2000);
  if(!voidStatuses.includes(status))throw Error('Trạng thái void không hợp lệ.');
  const prior=db.prepare('SELECT * FROM supplier_void_events WHERE request_key=?').get(key) as Row|undefined;
  if(prior){
   if(prior.case_id!==caseId||prior.status!==status||prior.note!==note||prior.actor_id!==user.id)throw Error('request_key đã dùng.');
   return prior;
  }
  const latest=db.prepare('SELECT id FROM supplier_void_events WHERE case_id=? ORDER BY id DESC LIMIT 1').get(caseId) as Row|undefined;
  if(!latest||latest.id!==Number(input.expected_event_id))throw Error('Trạng thái đã thay đổi; tải lại trước khi cập nhật.');
  return appendVoidEvent(caseId,status,note,user.id,key);
 }).immediate();
}

export function supplierVoidQueue(user:AuthUser,filter:{supplier?:string;status?:string;incident?:number}){
 access(user);
 const status=filter.status??'';
 if(status&&status!=='ALL'&&!voidStatuses.includes(status))throw Error('Trạng thái không hợp lệ.');
 const rows=db.prepare(`SELECT c.*,o.system_order_code,o.order_id client_order_id,e.status
  FROM supplier_void_cases c JOIN orders o ON o.id=c.order_id
  JOIN supplier_void_events e ON e.id=(SELECT MAX(id) FROM supplier_void_events WHERE case_id=c.id)
  WHERE (?='' OR c.supplier=?) AND (? IS NULL OR c.incident_id=?)
  AND (?='ALL' OR (?='' AND e.status IN ('PENDING','FOLLOWING_UP')) OR e.status=?)
  ORDER BY c.id DESC`).all(filter.supplier??'',filter.supplier??'',filter.incident??null,filter.incident??null,status,status,status) as Row[];
 return rows.map(row=>({...row,tracking_label:JSON.parse(String(row.snapshot_json)),
  history:db.prepare('SELECT * FROM supplier_void_events WHERE case_id=? ORDER BY id').all(row.id)}));
}

function refundChoice(user:AuthUser,orderId:number,value:unknown){
 if(value===undefined||value===null)return null;
 if(user.role!=='ADMIN')throw Error('Chỉ Admin chọn mức hoàn Supplier.');
 if(!db.prepare('SELECT 1 FROM orders o JOIN vnd_accounts v ON v.client_id=o.client_user_id WHERE o.id=?').get(orderId))throw Error('Lựa chọn này chỉ dành cho Supplier VNĐ.');
 if(typeof value!=='object'||Array.isArray(value))throw Error('Mức hoàn không hợp lệ.');
 const b=value as Row,mode=String(b.mode),evidence=typeof b.evidence==='string'?b.evidence.trim():'';
 if(!evidence||evidence.length>2000)throw Error('Cần chứng từ mức hoàn Supplier.');
 const positive=(n:unknown)=>{if(typeof n!=='string')throw Error('Cần số tiền VNĐ dạng chuỗi.');const x=vnd(n);if(compareVnd(x,'0')<0)throw Error('Số tiền không được âm.');return x;};
 if(mode==='AMOUNT')return {mode,currency:'VND',amount:positive(b.amount),evidence};
 if(mode!=='PERCENT')throw Error('Chọn tỷ lệ hoặc số tiền.');
 const basis=positive(b.basis),percent=positive(b.percent);if(compareVnd(percent,'100')>0)throw Error('Tỷ lệ phải từ 0 đến 100.');
 return {mode,currency:'VND',basis,percent,amount:multiplyVnd(multiplyVnd(basis,percent),'0.01'),evidence};
}
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
 .map(r=>({...r,tracking_label:JSON.parse(String(r.tracking_label_json)),history:db.prepare('SELECT e.*,c.choice_json FROM supplier_cancellation_events e LEFT JOIN supplier_cancellation_refund_choices c ON c.event_id=e.id WHERE e.order_id=? ORDER BY e.id').all(r.order_id)}));
}
export function updateSupplierCancellation(user:AuthUser,input:Row){
 access(user);
 const orderId=Number(input.order_id),status=String(input.status),note=String(input.note||'').trim(),key=String(input.request_key||'').trim();
 if(!Number.isSafeInteger(orderId)||orderId<=0||!['PENDING','FOLLOWING_UP','RESOLVED'].includes(status)||!note||note.length>2000||!key||key.length>200)throw Error('Cần Order, trạng thái, ghi chú và request_key hợp lệ.');
 return db.transaction(()=>{
 const choice=refundChoice(user,orderId,input.refund_choice),choiceJson=choice?JSON.stringify(choice):null;
 const prior=db.prepare('SELECT * FROM supplier_cancellation_events WHERE request_key=?').get(key) as Row|undefined;
 if(prior){const oldChoice=db.prepare('SELECT choice_json FROM supplier_cancellation_refund_choices WHERE event_id=?').get(prior.id) as Row|undefined;if((oldChoice?.choice_json??null)!==choiceJson)throw Error('request_key đã dùng cho mức hoàn khác.');if(prior.order_id!==orderId||prior.status!==status||prior.note!==note||prior.actor_id!==user.id)throw Error('request_key đã dùng cho thao tác khác.');return prior;}
 if(!db.prepare('SELECT 1 FROM supplier_cancellations WHERE order_id=?').get(orderId))throw Error('Không có record huỷ Supplier.');
 const latest=db.prepare('SELECT id FROM supplier_cancellation_events WHERE order_id=? ORDER BY id DESC LIMIT 1').get(orderId) as {id:number};
 if(Number(input.expected_event_id)!==latest.id)throw Error('Trạng thái đã thay đổi; tải lại trước khi cập nhật.');
 const id=Number(db.prepare('INSERT INTO supplier_cancellation_events(order_id,status,note,actor_id,request_key) VALUES (?,?,?,?,?)').run(orderId,status,note,user.id,key).lastInsertRowid);
 if(choiceJson)db.prepare('INSERT INTO supplier_cancellation_refund_choices(event_id,choice_json) VALUES (?,?)').run(id,choiceJson);
 logAdminEvent({orderId,eventType:'SUPPLIER_CANCELLATION_FOLLOWUP',summary:'Cập nhật xử lý huỷ với Supplier.',actorId:user.id,after:{status,note,event_id:id,refund_choice:choice}});
 return db.prepare('SELECT * FROM supplier_cancellation_events WHERE id=?').get(id);
 }).immediate();
}
