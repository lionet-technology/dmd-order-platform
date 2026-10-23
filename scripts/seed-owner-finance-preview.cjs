// Owns a brand-new synthetic preview DB; never resets or opens an operator DB.
const path=require('node:path'),{execFileSync}=require('node:child_process');
const database=path.resolve(__dirname,'../.smoke/internal-uat-test-owner-http-preview-'+Date.now()+'.db');
execFileSync(process.execPath,[path.join(__dirname,'seed-internal-uat.cjs')],{env:{...process.env,NODE_ENV:'test',DMD_DB_PATH:database},stdio:'pipe'});
process.env.DMD_DB_PATH=database;process.env.NODE_ENV='test';require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{financialAction,shiftDay,localDay}=require('../src/lib/credit.ts');
const {upsertOrder}=require('../src/lib/finance.ts'),{purchaseService}=require('../src/lib/route-pricing.ts'),{addOrderTracking}=require('../src/lib/order-operations.ts');
const admin=db.prepare("SELECT * FROM users WHERE username='epacket.admin'").get(),sales=db.prepare("SELECT * FROM users WHERE username='epacket.sales'").get();
function client(username,label){return createUser({username,display_name:label,role:'CLIENT',sales_user_id:sales.id,password:'Demo12345!',created_by_user_id:admin.id})}
const debt=client('review.debt','Review · Debt deadline riêng');
financialAction(admin,debt.id,{action:'additional_fee',quantity:1,unit_price:100,note:'Synthetic account receivable',request_key:'review-fee'});
financialAction(admin,debt.id,{action:'debt',amount:100,deadline:shiftDay(localDay(),30),reason:'Synthetic flexible Debt deadline',request_key:'review-debt'});
financialAction(admin,debt.id,{action:'configure',credit_limit:1000,credit_term_days:14,purchase_locked:false});
const manual=client('review.manual','Review · Admin cần chốt giá');
financialAction(admin,manual.id,{action:'configure',credit_limit:1000,credit_term_days:14,purchase_locked:false});
db.prepare("UPDATE service_route_configs SET client_self_purchase=1 WHERE service='UPS' AND sub_service='Saver' AND supplier='KILOSHIP'").run();
db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'UPS','Saver',1,0)").run(manual.id);
for(let i=0;i<3;i++){
const order=upsertOrder({client_user_id:manual.id,customer:manual.display_name,order_id:'REVIEW-MANUAL-'+i,service:'UPS',sub_service:'Saver',supplier:'KILOSHIP',country:'US',carton_count:2,weight:1,length:20,width:15,height:10,item:'Cotton shirt',material:'Cotton',recipient_name:'Synthetic Recipient',address1:'100 Test Street',city:'New York',state:'NY',zip:'10001',phone:'2025550100'});
purchaseService(order.id,{...manual,role:'CLIENT'});
if(i===0){const carton=db.prepare('SELECT id FROM order_cartons WHERE order_id=? ORDER BY id').get(order.id);addOrderTracking({orderId:order.id,cartonId:carton.id,tracking:'REVIEW-SYNTHETIC-PARTIAL',labelUrl:'/templates/demo-usps-label.svg',actorId:admin.id})}
}
console.log(JSON.stringify({database,orders:db.prepare('SELECT count(*) n FROM orders').get().n,clients:db.prepare("SELECT count(*) n FROM users WHERE role='CLIENT'").get().n,password:'Demo12345!'}));db.close();
