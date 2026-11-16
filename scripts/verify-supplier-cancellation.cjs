require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts');
const {cancelOrder}=require('../src/lib/order-cancellation.ts');
const {supplierCancellationQueue:queue,updateSupplierCancellation:update}=require('../src/lib/supplier-cancellation.ts');
const {supplierAccountSchema}=require('../src/lib/supplier-account.ts');supplierAccountSchema();
const {listOrderEvents}=require('../src/lib/order-audit.ts');
const users={};for(const role of ['ADMIN','SALES','CLIENT','FINANCE','BOD','WAREHOUSE'])users[role]=createUser({username:'supplier.cancel.'+role,password:'TestPass123!',display_name:role,role,...(role==='CLIENT'?{sales_user_id:users.SALES.id}:{})});
let seq=0,checks=0;const check=(v,m)=>{checks++;assert.ok(v,m);},reject=(fn,m)=>{checks++;assert.throws(fn,undefined,m);};
function order(supplier='DMD',label='https://labels.test/original.pdf'){
 // Explicit TEST policy, including blank supplier legacy-follow-up fixtures.
 db.prepare("INSERT OR IGNORE INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','T11',?)").run(supplier);
 const rid=db.prepare("SELECT id FROM service_route_configs WHERE service='ePacket' AND sub_service='T11' AND supplier=?").get(supplier).id;
 if(!require('../src/lib/cancellation-config.ts').readCancellationRules(rid))require('../src/lib/cancellation-config.ts').saveCancellationRules(rid,{ISSUED:{allowed:true,refund_percent:90}},"TEST policy",users.ADMIN.id);
 const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,customer,service,sub_service,supplier,workflow_status,total_due,sales_price,label,tracking) VALUES (?,?,'Client','ePacket','T11',?,'PURCHASING',100,100,?,?)").run('SC-'+(++seq),users.CLIENT.id,supplier,label,'SC-TRACK-'+seq).lastInsertRowid);
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',100,'ORDER',?)").run(users.CLIENT.id,String(id));return id;
}
const counts=()=>JSON.stringify(['supplier_account_entries','supplier_claims','supplier_claim_approvals','supplier_claim_settlements','supplier_costs'].map(t=>db.prepare('SELECT COUNT(*) n FROM '+t).get().n));
const before=counts(),id=order(),result=cancelOrder(id,users.ADMIN,{refund_percent:100,reason:'Admin hỗ trợ khách'});
check(result.refund_amount===100,'explicit Admin support full refund');
const row=queue(users.ADMIN,{supplier:'DMD'}).find(r=>r.order_id===id);
check(row.status==='PENDING'&&row.history.length===1,'pending supplier follow-up independent of client full refund');
check(row.tracking_label.legacy_tracking==='SC-TRACK-1'&&row.tracking_label.legacy_label==='https://labels.test/original.pdf','original tracking and label snapshots');
cancelOrder(id,users.ADMIN,{refund_percent:100});
check(queue(users.ADMIN).find(r=>r.order_id===id).history.length===1,'repeat cancel creates no second record');
for(const role of ['SALES','CLIENT','WAREHOUSE']){
 reject(()=>queue(users[role]),role+' cannot read supplier follow-up');
 reject(()=>update(users[role],{}),role+' cannot update supplier follow-up');
 reject(()=>cancelOrder(order(),users[role],{refund_percent:100}),role+' cannot choose Admin support');
}
for(const role of ['BOD','FINANCE'])reject(()=>cancelOrder(order(),users[role]),role+' cannot cancel orders');
const body={order_id:id,status:'FOLLOWING_UP',note:'Đã gửi email chờ Supplier trả lời',expected_event_id:row.history[0].id,request_key:'sc-followup-1'};
const event=update(users.FINANCE,body);
check(update(users.FINANCE,body).id===event.id,'exact retry idempotent');
reject(()=>update(users.ADMIN,body),'request key cannot replay across actors');
reject(()=>update(users.FINANCE,{...body,note:'different'}),'changed payload rejected');
reject(()=>update(users.ADMIN,{...body,request_key:'stale'}),'stale update rejected');
const closed=update(users.ADMIN,{order_id:id,status:'RESOLVED',note:'Đã đối chiếu ticket Supplier; không ghi nhận tiền ở thao tác này',expected_event_id:event.id,request_key:'sc-close'});
check(!queue(users.ADMIN).some(r=>r.order_id===id),'default queue excludes resolved');
check(queue(users.BOD,{status:'RESOLVED'}).some(r=>r.order_id===id),'resolved filter and BOD read');
update(users.ADMIN,{order_id:id,status:'PENDING',note:'Mở lại theo dõi',expected_event_id:closed.id,request_key:'sc-reopen'});
check(queue(users.ADMIN,{supplier:'OTHER'}).every(r=>r.supplier==='OTHER'),'supplier filter');
check(queue(users.ADMIN).find(r=>r.order_id===id).history.length===4,'append-only follow-up history');
reject(()=>db.prepare("UPDATE supplier_cancellations SET supplier='OTHER' WHERE order_id=?").run(id),'snapshot immutable');
reject(()=>db.prepare("DELETE FROM supplier_cancellation_events WHERE order_id=?").run(id),'history immutable');
check(!listOrderEvents(id,'CLIENT').some(e=>String(e.event_type).startsWith('SUPPLIER_CANCELLATION')),'supplier follow-up absent from public history');
check(counts()===before,'no Supplier cost, claim, receivable or money inferred');
const rollback=order();db.exec("CREATE TRIGGER reject_supplier_cancel BEFORE INSERT ON order_events WHEN NEW.event_type='ORDER_CANCELLED' AND NEW.order_id="+rollback+" BEGIN SELECT RAISE(ABORT,'test failure'); END");
reject(()=>cancelOrder(rollback,users.ADMIN),'audit failure rejected');
check(!db.prepare('SELECT 1 FROM supplier_cancellations WHERE order_id=?').get(rollback),'record rolls back with cancellation');
check(!db.prepare("SELECT 1 FROM ledger_entries WHERE reference_type='ORDER_CANCELLATION' AND reference_id=?").get(String(rollback)),'refund rollback');
check(db.prepare('SELECT workflow_status FROM orders WHERE id=?').get(rollback).workflow_status==='PURCHASING','order rollback');
check(db.pragma('foreign_key_check').length===0,'foreign keys intact');
db.close();console.log('SUPPLIER CANCELLATION PASS ('+checks+' assertions)');
