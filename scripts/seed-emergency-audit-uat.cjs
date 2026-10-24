// Explicit disposable-only fixture: no real DB or carrier calls.
const path=require('node:path'),os=require('node:os');
const file=process.env.DMD_DB_PATH;
if(!file||![os.tmpdir(),'/tmp','/private/tmp'].some(root=>path.resolve(file).startsWith(path.resolve(root)+path.sep))||!file.endsWith('emergency-audit-synthetic.db'))throw Error('Synthetic /tmp emergency audit DB required');
if(require('node:fs').existsSync(file))throw Error('Refusing to open an existing fixture DB; choose a new disposable path');
process.env.NODE_ENV='test';
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts');
try{
 if(db.prepare("SELECT 1 FROM users WHERE username='audit.admin'").get())throw Error('Fixture already exists');
 const admin=createUser({username:'audit.admin',display_name:'Synthetic Audit Admin',role:'ADMIN',password:'Synthetic123!',is_root_admin:true});
 const sales=createUser({username:'audit.sales',display_name:'Synthetic Sales',role:'SALES',password:'Synthetic123!'});
 const client=createUser({username:'audit.client',display_name:'Synthetic Client',role:'CLIENT',sales_user_id:sales.id,password:'Synthetic123!'});
 for(const [type,value,parent] of [['SERVICE','Audit Express',''],['SUB_SERVICE','Old','Audit Express'],['SUB_SERVICE','New','Audit Express'],['SUPPLIER','Audit Old',''],['SUPPLIER','Audit New','']])db.prepare('INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,active) VALUES (?,?,?,1)').run(type,value,parent);
 const old=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,max_cartons_per_order) VALUES ('Audit Express','Old','Audit Old',3)").run().lastInsertRowid);
 const fresh=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,max_cartons_per_order) VALUES ('Audit Express','New','Audit New',3)").run().lastInsertRowid);
 const order=Number(db.prepare("INSERT INTO orders(service,sub_service,supplier,workflow_status,order_id,sales_price,total_due,est_net_cost,client_user_id,carton_count) VALUES ('Audit Express','Old','Audit Old','PURCHASED','AUDIT-UI-ORDER',25,25,10,?,2)").run(client.id).lastInsertRowid);
 for(let i=1;i<=2;i++){const carton=Number(db.prepare('INSERT INTO order_cartons(order_id,carton_number) VALUES (?,?)').run(order,i).lastInsertRowid);db.prepare("INSERT INTO order_trackings(order_id,carton_id,tracking,normalized_tracking,label_url,is_primary) VALUES (?,?,?,?,?,?)").run(order,carton,'AUDITOLD'+i,'AUDITOLD'+i,'/old.pdf',i===1?1:0)}
 require('../src/lib/order-shipments.ts').ensureOrderShipmentStructure(order);
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',25,'ORDER',?)").run(client.id,String(order));
 console.log(JSON.stringify({oldRoute:old,newRoute:fresh,order,admin:admin.username}));
}finally{db.close()}
