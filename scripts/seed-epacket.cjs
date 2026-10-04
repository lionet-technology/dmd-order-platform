const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,"..");
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){if(r.startsWith("@/"))return resolve.call(this,path.join(root,"src",r.slice(2)),p,m,o);return resolve.call(this,r,p,m,o)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
process.env.DMD_DB_PATH=process.env.DMD_DB_PATH||path.join(root,"data/dmd-finance-ops.db");
const {db}=require("../src/lib/db.ts"),{createUser}=require("../src/lib/auth.ts"),{STANDARD,ECO,DEFAULT_SURCHARGES}=require("../src/lib/epacket-pricing.ts"),{createPriceVersion,activatePricing,purchaseService}=require("../src/lib/route-pricing.ts"),{upsertOrder}=require("../src/lib/finance.ts"),{addOrderTracking}=require("../src/lib/order-operations.ts");
function seed(reset=false){
 if(reset){fs.mkdirSync(path.join(root,".smoke"),{recursive:true});db.exec("VACUUM INTO '"+path.join(root,".smoke/epacket-before-reset-"+Date.now()+".db").replace(/'/g,"''")+"'")}
 return db.transaction(()=>{
 if(reset){
 for(const table of ["manifest_carton_items","manifest_carton_events","manifest_cartons","warehouse_order_holds","order_events","supplier_costs","carton_items","order_trackings","order_cartons","order_items","order_lots","ledger_entries","orders","service_costs","import_batches"]){
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))db.prepare('DELETE FROM "'+table+'"').run();
 }
 }
 let admin=db.prepare("SELECT * FROM users WHERE role='ADMIN' AND active=1 ORDER BY is_root_admin DESC,id LIMIT 1").get();
 if(!admin)admin=createUser({username:"epacket.admin",display_name:"DMD Admin",password:"Demo12345!",role:"ADMIN",is_root_admin:true});
 function user(username,display_name,role,sales_user_id){const existing=db.prepare("SELECT * FROM users WHERE username=?").get(username);if(existing){db.prepare("UPDATE users SET active=1,sales_user_id=? WHERE id=?").run(sales_user_id||null,existing.id);return {...existing,sales_user_id}}return createUser({username,display_name,role,password:"Demo12345!",sales_user_id,created_by_user_id:admin.id})}
 const sales=user("epacket.sales","Mai Nguyen · DMD Sales","SALES"),clients=["A","B","C"].map((l,i)=>({...user("epacket.client."+l.toLowerCase(),["Lotus Apparel","Saigon Craft","Mekong Accessories"][i],"CLIENT",sales.id),target:[1.05,1.10,1.15][i]}));
 const insert=db.prepare("INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,active,sort_order) VALUES (?,?,?,1,100)");
 insert.run("SUPPLIER","DMD","");insert.run("SERVICE","ePacket","");insert.run("SUB_SERVICE","Standard","ePacket");insert.run("SUB_SERVICE","Eco","ePacket");
 const source=db.prepare("SELECT * FROM service_route_configs WHERE lower(service)='epacket' AND lower(sub_service)='standard' AND lower(supplier)='dmd'").get();
 const config=JSON.parse(fs.readFileSync(path.join(root,"config/templates/epacket-standard-dmd/route.json"),"utf8"));
 for(const [sub,tiers] of [["Standard",STANDARD],["Eco",ECO]]){
 db.prepare("INSERT OR IGNORE INTO service_route_configs(service,sub_service,supplier,route_variables_json) VALUES ('ePacket',?,'DMD',?)").run(sub,source?.route_variables_json||JSON.stringify(config.route_variables));
 const route=db.prepare("SELECT * FROM service_route_configs WHERE service='ePacket' AND sub_service=? AND supplier='DMD'").get(sub);
 db.prepare("UPDATE service_route_configs SET client_self_purchase=1,active=1,updated_by_user_id=? WHERE id=?").run(admin.id,route.id);
 const v=createPriceVersion(route.id,tiers,admin.id);activatePricing(route.id,{price_version_id:v.id,base_markup:6,retail_markup:16,surcharges:DEFAULT_SURCHARGES},admin.id);
 for(const c of clients)db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,default_sub_service,default_supplier,updated_by_user_id) VALUES (?,'ePacket',?,1,?,?,'DMD',?) ON CONFLICT(client_user_id,service,sub_service) DO UPDATE SET is_enabled=1,discount_percent=excluded.discount_percent,default_sub_service=excluded.default_sub_service,default_supplier='DMD'").run(c.id,sub,(1-c.target/1.16)*100,sub,admin.id);
 for(const kind of ["PURCHASE","MANIFEST"]){
 if(db.prepare("SELECT id FROM purchase_templates WHERE route_config_id=? AND template_kind=? AND active=1").get(route.id,kind))continue;
 const pt=Number(db.prepare("INSERT INTO purchase_templates(route_config_id,name,template_kind,output_mode,repeat_sections_json,created_by_user_id) VALUES (?,?,?,'MULTI_ORDER',?,?)").run(route.id,"ePacket "+sub+" "+kind,kind,JSON.stringify(config.repeat_sections),admin.id).lastInsertRowid);
 db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status,created_by_user_id,activated_at) VALUES (?,1,?,?,'ACTIVE',?,?)").run(pt,kind.toLowerCase()+".xlsx",path.join(root,"config/templates/epacket-standard-dmd",kind.toLowerCase()+".xlsx"),admin.id,new Date().toISOString());
 }
 }
 const locations=[["Los Angeles","CA","90012"],["New York","NY","10001"],["Houston","TX","77002"],["Honolulu","HI","96813"],["Anchorage","AK","99501"],["APO","AE","09012"]];
 for(const c of clients){
 db.prepare("INSERT INTO ledger_entries(entry_type,direction,amount,customer,client_user_id,note) VALUES ('DEPOSIT','CREDIT',5000,?,?,'USD ePacket test balance')").run(c.display_name,c.id);
 for(const sub of ["Standard","Eco"]){
 for(let n=0;n<6;n++){
 const code="EPK-"+c.id+"-"+sub+"-"+n;if(db.prepare("SELECT id FROM orders WHERE order_id=?").get(code))continue;
 const [city,state,zip]=locations[n],weights=[.041,.051,.42,1.01,2.01,5.01];
 const order=upsertOrder({client_user_id:c.id,customer:c.display_name,sales:sales.display_name,order_id:code,service:"ePacket",sub_service:sub,supplier:"DMD",country:n%2?"United States of America":"U.S.",carton_count:1,weight:weights[n],length:n===4?80:n===3?60:10,width:5,height:3,item:"Cotton T-shirt",material:"Cotton",declared_value:15,recipient_name:["Emma Wilson","James Chen","Olivia Davis","Noah Kim","Ava Miller","Liam Brown"][n],address1:"120 Market Street",city,state,zip,phone:"20255501"+String(n).padStart(2,"0")});
 db.prepare("UPDATE orders SET sales_user_id=?,created_by_user_id=?,updated_by_user_id=? WHERE id=?").run(sales.id,admin.id,admin.id,order.id);
 if(n<4){
 purchaseService(order.id,{id:c.id,role:"CLIENT"});
 const carton=db.prepare("SELECT id FROM order_cartons WHERE order_id=?").get(order.id);
 addOrderTracking({orderId:order.id,cartonId:carton.id,tracking:"9400111899223"+String(order.id).padStart(9,"0"),labelUrl:"/templates/demo-usps-label.svg",actorId:admin.id});
 db.prepare("UPDATE orders SET workflow_status='PURCHASED',purchase_completed_at=? WHERE id=?").run(new Date().toISOString(),order.id);
 }else db.prepare("UPDATE orders SET workflow_status='SALES_DRAFT' WHERE id=?").run(order.id);
 }
 }
 }
 const bad=[{weight:10.001},{country:"CA"},{length:80,width:50,height:20,weight:1},{carton_count:2}];
 for(let i=0;i<bad.length;i++)for(const sub of ["Standard","Eco"]){
 const c=clients[i%3],code="EPK-INVALID-"+sub+"-"+i;if(db.prepare("SELECT id FROM orders WHERE order_id=?").get(code))continue;
 const o=upsertOrder({client_user_id:c.id,customer:c.display_name,sales:sales.display_name,order_id:code,service:"ePacket",sub_service:sub,supplier:"DMD",country:"US",carton_count:1,weight:.5,length:10,width:5,height:3,item:"Canvas bag",material:"Cotton",declared_value:10,recipient_name:"Test Draft",address1:"42 Broadway",city:"New York",state:"NY",zip:"10001",phone:"2025550100",...bad[i]});
 db.prepare("UPDATE orders SET workflow_status='SALES_DRAFT',sales_user_id=?,created_by_user_id=? WHERE id=?").run(sales.id,admin.id,o.id);
 }
 return {clients:clients.map(c=>({id:c.id,username:c.username})),orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n};
 }).immediate();
}
module.exports={seed};
if(require.main===module){try{console.log(JSON.stringify(seed(process.argv.includes("--reset")),null,2))}finally{db.close()}}
