// Disposable fixture: real route handlers, no browser or network claims.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-bulk-recovery-'));
process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs'),{db}=require('../src/lib/db.ts');
const {createSession}=require('../src/lib/auth.ts'),{NextRequest}=require('next/server');
const {upsertOrder}=require('../src/lib/finance.ts'),{purchaseService}=require('../src/lib/route-pricing.ts');
const api=require('../src/app/api/orders/tracking-queue/route.ts');
let checks=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)};
(async()=>{try{
 seed();const admin=db.prepare("SELECT * FROM users WHERE role='ADMIN'").get(),client=db.prepare("SELECT * FROM users WHERE role='CLIENT' ORDER BY id").get();
 const cookie='dmd_session='+createSession(admin.id).token;
 async function post(rows){const r=await api.POST(new NextRequest('http://local/api/orders/tracking-queue',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({rows})}));return {status:r.status,data:await r.json()}}
 const make=name=>upsertOrder({client_user_id:client.id,customer:client.display_name,order_id:name,service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:.5,length:10,width:5,height:3,item:'Shirt',material:'Cotton',declared_value:10,recipient_name:'Synthetic',address1:'42 Broadway',city:'New York',state:'NY',zip:'10001',phone:'2025550100'});
 const a=make('RECOVERY-A'),b=make('RECOVERY-B');
 for(const o of [a,b])purchaseService(o.id,{id:client.id,role:'CLIENT'});
 const row=(o,tracking)=>({order_pk:o.id,carton_slot:1,tracking,label_url:'https://labels.test/synthetic.pdf'});
 const snapshot=()=>({reserves:db.prepare('SELECT * FROM purchase_reserves WHERE order_id IN (?,?) ORDER BY order_id').all(a.id,b.id),charges:db.prepare("SELECT * FROM ledger_entries WHERE reference_type='ORDER' AND reference_id IN (?,?) ORDER BY id").all(String(a.id),String(b.id)),trackings:db.prepare('SELECT * FROM order_trackings WHERE order_id IN (?,?) ORDER BY id').all(a.id,b.id),events:db.prepare('SELECT * FROM order_events WHERE order_id IN (?,?) ORDER BY id').all(a.id,b.id)});
 const before=snapshot();
 // Both groups pass initial validation. The second insert fails after the first
 // has completed its reserve, so this exercises transaction rollback of money.
 db.exec("CREATE TRIGGER synthetic_tracking_failure BEFORE INSERT ON order_trackings WHEN NEW.tracking='RECOVERY-FAIL' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 let r=await post([row(a,'RECOVERY-A'),row(b,'RECOVERY-FAIL')]);eq(r.status,400,'injected second-group failure');eq(r.data.error.includes('synthetic failure'),true,'failure reaches second group rather than missing optional sub-service');eq(snapshot(),before,'all tracking, charge, reserve and events rolled back');
 db.exec('DROP TRIGGER synthetic_tracking_failure');
 r=await post([row(a,'RECOVERY-A')]);eq(r.status,200,'manual reselect only first order, optional route retained');
 eq(db.prepare('SELECT sub_service FROM orders WHERE id=?').get(a.id).sub_service,'Standard','locked route preserved');
 eq(db.prepare('SELECT status FROM purchase_reserves WHERE order_id=?').get(b.id).status,'RESERVED','unselected sibling stays reserved');
 const charges=()=>db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND reference_type='ORDER' AND reference_id IN (?,?)").get(String(a.id),String(b.id)).n;
 eq(charges(),1,'one selected order charged');
 r=await post([row(a,'RECOVERY-A')]);eq(r.status,200,'exact retry');eq(charges(),1,'retry no duplicate charge');
 eq(db.prepare('SELECT COUNT(*) n FROM order_trackings WHERE order_id=?').get(a.id).n,1,'retry no duplicate tracking');
 r=await post([row(b,'RECOVERY-B')]);eq(r.status,200,'explicit remaining selection succeeds');eq(charges(),2,'one charge per order');
 const {purchaseBatch}=require('../src/lib/client-bulk-purchase.ts');
 const good=make('PARTIAL-GOOD'),bad=make('PARTIAL-BAD');
 db.prepare('UPDATE orders SET weight=11 WHERE id=?').run(bad.id);
 const actor={id:client.id,role:'CLIENT'},batch=purchaseBatch([good.id,bad.id],actor);
 eq([batch.succeeded,batch.failed],[1,1],'partial purchase retains valid order');
 eq(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=?').get(bad.id).n,0,'failed Draft has no reserve');
 db.prepare('UPDATE orders SET weight=.5 WHERE id=?').run(bad.id);
 // A read/reload after correcting data must not implicitly retry the failed Draft.
 const {accountFinancials}=require('../src/lib/credit.ts');accountFinancials(client.id);
 eq(db.prepare('SELECT service_purchased_at FROM orders WHERE id=?').get(bad.id).service_purchased_at,null,'correction/read does not auto purchase');
 eq(purchaseBatch([bad.id],actor).succeeded,1,'explicit failed Draft reselection');
 eq(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id IN (?,?)').get(good.id,bad.id).n,2,'one reserve per successful selection');
 db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,max_cartons_per_order,client_self_purchase) VALUES ('UPS','','DMD',2,1)").run();
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,is_enabled,default_supplier) VALUES (?,'UPS',1,'DMD')").run(client.id);
 const manual=upsertOrder({client_user_id:client.id,customer:client.display_name,order_id:'EMPTY-SUBSERVICE',service:'UPS',supplier:'DMD',country:'US',carton_count:2,weight:2,length:20,width:10,height:5,item:'Shirt',material:'Cotton',declared_value:10,recipient_name:'Synthetic',address1:'42 Broadway',city:'New York',state:'NY',zip:'10001',phone:'2025550100'});
 require('../src/lib/order-shipments.ts').saveOrderShipmentStructure(manual.id,{lot_count:1,cartons:[1,2].map(n=>({carton_number:n,lot_number:1,weight:1,length:10,width:10,height:5,items:[{description:'Shirt',quantity:1,unit_manufacturing_value:5}]}))});
 purchaseService(manual.id,actor);
 const manualRows=[1,2].map(n=>({order_pk:manual.id,carton_slot:n,sub_service:'',supplier:'DMD',manual_total_price:35,tracking:'EMPTY-SUB-'+n,label_url:'https://labels.test/synthetic.pdf'}));
 r=await post(manualRows);eq(r.status,200,'manual empty Sub-Service matches configured route: '+JSON.stringify(r.data));
 r=await post(manualRows);eq(r.status,200,'manual empty Sub-Service exact replay keeps route locked consistently');
 r=await post(manualRows.map(row=>({...row,sub_service:'Saver'})));eq(r.status,400,'normalizing blank does not permit a real route change after price lock');
 const manualCharges=db.prepare("SELECT amount FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND reference_type='ORDER' AND reference_id=?").all(String(manual.id));eq(manualCharges.map(c=>c.amount),[35],'two Cartons and retry charge one Order total');
 eq(db.pragma('integrity_check',{simple:true}),'ok','integrity');eq(db.pragma('foreign_key_check'),[],'foreign keys');
 console.log('BULK RECOVERY PASS ('+checks+' assertions)');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
