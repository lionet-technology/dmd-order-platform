// Disposable UAT only: refuse every existing DB and every path outside .smoke.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.smoke');
fs.mkdirSync(dir,{recursive:true});
const target=path.resolve(process.env.DMD_DB_PATH||'');
if(process.env.NODE_ENV!=='test'||path.dirname(target)!==fs.realpathSync(dir)||!/^internal-uat-test-[a-z0-9-]+\.db$/.test(path.basename(target))||[target,target+'-wal',target+'-shm'].some(p=>fs.existsSync(p)))throw Error('NODE_ENV=test and a NEW .smoke/internal-uat-test-<name>.db required; never resets an existing DB.');
const child=spawnSync(process.execPath,[path.join(__dirname,'seed-finance-demo.cjs'),'--reset-demo'],{env:{...process.env,DMD_DB_PATH:target},stdio:'pipe'});
if(child.status!==0)throw Error(child.stderr.toString());
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{upsertOrder,addSupplierCost}=require('../src/lib/finance.ts'),{purchaseService}=require('../src/lib/route-pricing.ts'),{addOrderTracking}=require('../src/lib/order-operations.ts'),{saveOrderShipmentStructure}=require('../src/lib/order-shipments.ts');
const admin=db.prepare("SELECT * FROM users WHERE is_root_admin=1").get();
const make=(username,role,sales_user_id)=>createUser({username,display_name:'UAT '+username,role,sales_user_id,password:'Demo12345!',created_by_user_id:admin.id});
const sales=[db.prepare("SELECT * FROM users WHERE role='SALES'").get(),make('uat.sales.2','SALES'),make('uat.sales.3','SALES')];
const clients=db.prepare("SELECT * FROM users WHERE role='CLIENT'").all();
for(let i=clients.length;i<15;i++)clients.push(make('uat.client.'+(i+1),'CLIENT',sales[i%3].id));
make('uat.finance','FINANCE');make('uat.bod','BOD');
const settings=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=?").all(clients[0].id);
for(const [i,c] of clients.entries()){
 db.prepare('UPDATE users SET sales_user_id=? WHERE id=?').run(sales[i%3].id,c.id);
 for(const s of settings)db.prepare('INSERT OR IGNORE INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,default_sub_service,default_supplier,updated_by_user_id) VALUES (?,?,?,1,?,?,?,?)').run(c.id,s.service,s.sub_service,s.discount_percent,s.default_sub_service,s.default_supplier,admin.id);
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,customer,note) VALUES (?,'PAYMENT','CREDIT',10000,?,'UAT synthetic opening balance')").run(c.id,c.display_name);
}
for(const c of clients)for(const [service,sub] of [['UPS','Saver'],['Yun Express',''],['Chuyên tuyến','']])db.prepare("INSERT OR IGNORE INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,updated_by_user_id) VALUES (?,?,?,1,0,?)").run(c.id,service,sub,admin.id);
for(const [service,sub] of [['UPS','Saver'],['Chuyên tuyến','']])db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,max_cartons_per_order) VALUES (?,?,?,3) ON CONFLICT(service,sub_service,supplier) DO UPDATE SET max_cartons_per_order=3").run(service,sub,'KILOSHIP');
const summary=db.transaction(()=>{
 for(let n=0;n<500;n++){
 const c=clients[n<360?3+n%12:n%15],s=sales[n%3],sub=n%2?'Eco':'Standard',multi=n>=460;
 const service=multi?['UPS','Chuyên tuyến'][n%2]:'ePacket';
 const o=upsertOrder({client_user_id:c.id,customer:c.display_name,sales:s.display_name,order_id:'UAT-'+String(n+1).padStart(4,'0'),service,sub_service:multi?(service==='UPS'?'Saver':''):sub,supplier:multi?'KILOSHIP':'DMD',country:'US',carton_count:multi?3:1,weight:[.1,.2,.42,.8,1.01][n%5],length:15,width:10,height:5,item:['Cotton shirt','Canvas bag','Phone case'][n%3],material:'Cotton',declared_value:20,recipient_name:'UAT Recipient '+n,address1:(100+n)+' Market Street',city:'Los Angeles',state:'CA',zip:'90012',phone:'2025550100'});
 db.prepare('UPDATE orders SET sales_user_id=?,created_by_user_id=? WHERE id=?').run(s.id,c.id,o.id);
 if(n>=360)db.prepare("UPDATE orders SET workflow_status='SALES_DRAFT' WHERE id=?").run(o.id);
 if(multi){saveOrderShipmentStructure(o.id,{lot_count:2,cartons:[1,2,3].map(k=>({carton_number:k,lot_number:k===3?2:1,weight:.2,length:15,width:10,height:5,items:[{description:'Cotton shirt',material:'Cotton',quantity:1,unit_manufacturing_value:10}]}))});continue;}
 if(n>=360)continue;
 purchaseService(o.id,{...c,role:'CLIENT'});
 if(n>=330)continue; // Queue for Admin spreadsheet UAT.
 const carton=db.prepare('SELECT id FROM order_cartons WHERE order_id=?').get(o.id);
 addOrderTracking({orderId:o.id,cartonId:carton.id,tracking:'UAT9400'+String(n).padStart(10,'0'),labelUrl:'/templates/demo-usps-label.svg',actorId:admin.id});
 db.prepare("UPDATE orders SET workflow_status='PURCHASED',purchase_completed_at=CURRENT_TIMESTAMP WHERE id=?").run(o.id);
 if(n<300)addSupplierCost({supplier:'DMD',service:'ePacket',sub_service:sub,order_id:o.id,lot_number:1,total_net_cost:n%7===0?18:3,source_key:'uat-cost-'+n,note:'Synthetic aggregate cost; coverage acceptance pending'});
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key violations');
 return {database:target,users:db.prepare('SELECT role,count(*) count FROM users GROUP BY role').all(),orders:db.prepare('SELECT workflow_status,count(*) count FROM orders GROUP BY workflow_status').all(),costs:db.prepare('SELECT count(*) count FROM supplier_costs').get(),multiLot:db.prepare('SELECT count(*) count FROM orders WHERE expected_lot_count>1').get(),integrity:db.pragma('integrity_check')};
}).immediate();
fs.writeFileSync(target+'.summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));db.close();
