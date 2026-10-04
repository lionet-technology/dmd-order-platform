const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript"),ExcelJS=require("exceljs");
const root=path.resolve(__dirname,".."),temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-manifest-cartons-"));
process.env.DMD_DB_PATH=path.join(temporary,"test.db");process.env.NODE_ENV="test";
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith("@/")){const target=path.join(root,"src",request.slice(2));for(const candidate of [target,target+".ts",target+".tsx",path.join(target,"index.ts")])if(fs.existsSync(candidate))return candidate}return resolve.call(this,request,parent,isMain,options)};
require.extensions[".ts"]=require.extensions[".tsx"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
const {NextRequest}=require("next/server"),{db}=require("../src/lib/db.ts"),{createUser,createSession}=require("../src/lib/auth.ts");
const cartonsRoute=require("../src/app/api/manifest-cartons/route.ts"),cartonRoute=require("../src/app/api/manifest-cartons/[id]/route.ts"),exportRoute=require("../src/app/api/manifest-export/route.ts"),usersRoute=require("../src/app/api/users/route.ts");
let checks=0;const check=(value,message)=>{checks++;if(!value)throw Error(message)};
function req(url,method="GET",body,cookie){return new NextRequest(url,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
async function json(response){return {status:response.status,body:await response.clone().json().catch(()=>null),response}}
function addOrder({code,client,service="ePacket",sub="Standard",supplier="DMD",trackings}){
 const orderId=Number(db.prepare("INSERT INTO orders(system_order_code,order_id,workflow_status,customer,service,sub_service,supplier,recipient_name,address1,city,state,zip,country,phone,recipient_email,carton_count) VALUES (?,?,'PURCHASED','Warehouse QA',?,?,?,?, '1 Main St','Austin','TX','78701','US','555','qa@example.com',?)").run(code,client,service,sub,supplier,"Receiver",trackings.length).lastInsertRowid);
 const lotId=Number(db.prepare("INSERT INTO order_lots(order_id,lot_number) VALUES (?,1)").run(orderId).lastInsertRowid);const itemId=Number(db.prepare("INSERT INTO order_items(order_id,sku,description,material,unit_manufacturing_value,currency) VALUES (?,'SKU','Shirt','Cotton',5,'USD')").run(orderId).lastInsertRowid);
 trackings.forEach((tracking,index)=>{const cartonId=Number(db.prepare("INSERT INTO order_cartons(order_id,order_lot_id,carton_number,weight,length,width,height,details_complete) VALUES (?,?,?,?,20,15,10,1)").run(orderId,lotId,index+1,1).lastInsertRowid);db.prepare("INSERT INTO carton_items(carton_id,order_item_id,quantity) VALUES (?,?,1)").run(cartonId,itemId);db.prepare("INSERT INTO order_trackings(order_id,lot_number,tracking,normalized_tracking,status,carton_id) VALUES (?,?,?,?,'ACTIVE',?)").run(orderId,1,tracking,tracking.replace(/[\s-]+/g,"").toUpperCase(),cartonId)});return orderId;
}
async function main(){
 const admin=createUser({username:"manifest.admin",display_name:"Admin",password:"TestPass123!",role:"ADMIN",is_root_admin:true});const warehouse=createUser({username:"manifest.warehouse",display_name:"Kho",password:"TestPass123!",role:"WAREHOUSE"});const sales=createUser({username:"manifest.sales",display_name:"Sales",password:"TestPass123!",role:"SALES"});
 const cookie=id=>"dmd_session="+createSession(id).token,adminCookie=cookie(admin.id),warehouseCookie=cookie(warehouse.id),salesCookie=cookie(sales.id);
 const createdWarehouse=await json(await usersRoute.POST(req("http://local/api/users","POST",{username:"warehouse.two",display_name:"Kho 2",password:"TestPass123!",role:"WAREHOUSE"},adminCookie)));check(createdWarehouse.status===201&&createdWarehouse.body.role==="WAREHOUSE","Admin creates Warehouse role");
 const routeId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json) VALUES ('ePacket','Standard','DMD',?)").run(JSON.stringify({sender_address:"Hanoi",service_code:"Epacket Zero"})).lastInsertRowid);const templateId=Number(db.prepare("INSERT INTO purchase_templates(route_config_id,name,template_kind,output_mode,repeat_sections_json) VALUES (?,'Manifest','MANIFEST','MULTI_ORDER',?)").run(routeId,JSON.stringify([{sheet:"Sheet1",row:2,scope:"CARTON"}])).lastInsertRowid);db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status) VALUES (?,1,'manifest.xlsx',?,'ACTIVE')").run(templateId,path.join(root,"config/templates/epacket-standard-dmd/manifest.xlsx"));
 const altRouteId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json) VALUES ('ePacket','T11','KILOSHIP',?)").run(JSON.stringify({sender_address:"Hanoi",service_code:"Epacket T11"})).lastInsertRowid);const altTemplateId=Number(db.prepare("INSERT INTO purchase_templates(route_config_id,name,template_kind,output_mode,repeat_sections_json) VALUES (?,'Manifest Alt','MANIFEST','MULTI_ORDER',?)").run(altRouteId,JSON.stringify([{sheet:"Sheet1",row:2,scope:"CARTON"}])).lastInsertRowid);db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status) VALUES (?,1,'manifest.xlsx',?,'ACTIVE')").run(altTemplateId,path.join(root,"config/templates/epacket-standard-dmd/manifest.xlsx"));
 addOrder({code:"DMD-WH-001",client:"CLIENT-WH-001",trackings:["WH-TRACK-1","WH-TRACK-2"]});addOrder({code:"DMD-ALT-001",client:"CLIENT-ALT-001",sub:"T11",supplier:"KILOSHIP",trackings:["ALT-TRACK-1"]});addOrder({code:"DMD-NO-TEMPLATE",client:"CLIENT-NO-TEMPLATE",sub:"Express",supplier:"OTHER",trackings:["NO-TEMPLATE-1"]});addOrder({code:"DMD-UPS-001",client:"CLIENT-UPS-001",service:"UPS",sub:"Express",supplier:"DMD",trackings:["UPS-TRACK-1"]});
 check((await json(await cartonsRoute.GET(req("http://local/api/manifest-cartons",undefined,undefined,salesCookie)))).status===403,"Sales cannot access warehouse cartons");
 let result=await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"DMD-WH-001"},warehouseCookie)));check(result.status===201&&result.body.carton.carton_code.match(/^EPACKET-\d{8}-001$/),"first order creates dated service carton");check(result.body.items.length===2&&result.body.carton.order_count===1,"order adds every tracked carton");const cartonId=result.body.carton.id;
 check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:cartonId},warehouseCookie)))).status===400,"duplicate physical carton rejected");check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"DMD-UPS-001",manifest_carton_id:cartonId},warehouseCookie)))).status===400,"mixed service rejected");
 const wrongRoute=await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"DMD-ALT-001",manifest_carton_id:cartonId},warehouseCookie)));check(wrongRoute.status===400&&String(wrongRoute.body.error).includes("chỉ nhận"),"same service with a different route is rejected before packing");
 const missingTemplate=await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"DMD-NO-TEMPLATE",manifest_carton_id:cartonId},warehouseCookie)));check(missingTemplate.status===400&&missingTemplate.body.reason_code==="ROUTE_MISMATCH","unsupported route is rejected before packing");
 result=await json(await cartonRoute.POST(req("http://local/api/manifest-cartons/"+cartonId,"POST",{action:"remove",item_id:result.body.items[0].item_id},warehouseCookie),{params:Promise.resolve({id:String(cartonId)})}));check(result.status===200&&result.body.items.length===1,"warehouse removes item before close");
 result=await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:cartonId},warehouseCookie)));check(result.status===201&&result.body.items.length===2,"removed item can be scanned again");
 const closed=await json(await cartonRoute.POST(req("http://local/api/manifest-cartons/"+cartonId,"POST",{action:"close"},warehouseCookie),{params:Promise.resolve({id:String(cartonId)})}));check(closed.status===200&&closed.body.closed.carton.status==="CLOSED","full carton closes");check(closed.body.next.carton.carton_code.match(/^EPACKET-\d{8}-002$/)&&closed.body.next.carton.status==="OPEN","close automatically opens next daily sequence");
 check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:cartonId},warehouseCookie)))).status===400,"closed carton is immutable");
 const exported=await exportRoute.POST(req("http://local/api/manifest-export","POST",{manifest_carton_id:cartonId},warehouseCookie));check(exported.status===200&&exported.headers.get("content-disposition").includes(closed.body.closed.carton.carton_code),"Warehouse exports closed carton using carton code");const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));check(book.getWorksheet("Sheet1").getCell("F2").value&&book.getWorksheet("Sheet1").getCell("F3").value,"export contains both packed trackings");
 const detail=await json(await cartonRoute.GET(req("http://local/api/manifest-cartons/"+cartonId,"GET",undefined,warehouseCookie),{params:Promise.resolve({id:String(cartonId)})}));check(Boolean(detail.body.carton.exported_at),"export timestamp recorded");
 const flow=require("../src/lib/manifest-cartons.ts"),guard=require("../src/lib/warehouse-guard.ts");
 const order=db.prepare("SELECT *,id order_id FROM orders WHERE system_order_code='DMD-WH-001'").get();
 const carton=detail.body.carton;
 check(guard.warehouseGuard(order,carton).decision==="ALLOW","guard allows matching route");
 for(const key of ["service","sub_service","supplier"]){db.prepare("UPDATE orders SET "+key+"='wrong' WHERE id=?").run(order.id);check(guard.warehouseGuard(order,carton).reason_code==="ROUTE_MISMATCH","full route blocks current database "+key);db.prepare("UPDATE orders SET "+key+"=? WHERE id=?").run(order[key],order.id)}
 db.prepare("UPDATE orders SET workflow_status='CANCELLED' WHERE id=?").run(order.id);
 check(guard.warehouseGuard(order,carton).reason_code==="ORDER_CANCELLED","cancel blocks");
 flow.changeManifestStatus(cartonId,"reopen",warehouse.id);
 check(flow.removeManifestIdentifier("WH-TRACK-1",cartonId,warehouse.id).removed_count===1,"remove cancelled item by scan");
 db.prepare("UPDATE orders SET workflow_status='PURCHASED' WHERE id=?").run(order.id);
 for(const source of ["CLIENT","SALES","ADMIN"]){
 const h=db.prepare("INSERT INTO warehouse_order_holds(order_id,source,reason,created_by_user_id) VALUES (?,?,?,?)").run(order.id,source,"test",admin.id);
 check(guard.warehouseGuard(order,carton).reason_code==="ORDER_HOLD","hold source "+source);
 check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:cartonId},warehouseCookie)))).body.reason_code==="ORDER_HOLD","API enforces hold");
 db.prepare("DELETE FROM warehouse_order_holds WHERE id=?").run(h.lastInsertRowid);
 }
 db.prepare("UPDATE service_route_configs SET warehouse_hold=1 WHERE id=?").run(routeId);
 check(guard.warehouseGuard(order,carton).reason_code==="ROUTE_HOLD","route hold");
 db.prepare("UPDATE service_route_configs SET warehouse_hold=0 WHERE id=?").run(routeId);
 db.prepare("INSERT INTO warehouse_routing_rules(route_config_id,evaluator_key) VALUES (?,'test')").run(routeId);
 check(guard.warehouseGuard(order,{...carton,segment_key:"east"}).reason_code==="RULE_UNAVAILABLE","unknown evaluator fails closed");
 guard.registerWarehouseSegmentEvaluator("test",()=>"west");
 check(guard.warehouseGuard(order,{...carton,segment_key:"east"}).reason_code==="SEGMENT_MISMATCH","segment mismatch");
 check(guard.warehouseGuard(order,{...carton,segment_key:"west"}).decision==="ALLOW","segment match");
 db.prepare("DELETE FROM warehouse_routing_rules").run();
 flow.changeManifestStatus(cartonId,"pause",warehouse.id);
 check(flow.manifestCartonDetail(cartonId).carton.status==="PAUSED","pause");
 check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:cartonId},warehouseCookie)))).status===400,"paused rejects scan");
 const another=flow.createManifestCarton(routeId,undefined,warehouse.id);
 check(another.carton.status==="OPEN","multiple cartons per route");
 flow.changeManifestStatus(cartonId,"resume",warehouse.id);
 flow.addManifestIdentifier("WH-TRACK-1",cartonId,warehouse.id);
 check(flow.manifestCartonDetail(cartonId).history.some(e=>e.action==="REMOVE")&&flow.manifestCartonDetail(cartonId).history.some(e=>e.action==="REOPEN"),"audit preserves removal and reopen");
 const before=db.prepare("SELECT COUNT(*) n FROM manifest_cartons").get().n;
 check((await json(await cartonsRoute.POST(req("http://local/api/manifest-cartons","POST",{identifier:"WH-TRACK-1",manifest_carton_id:999999},warehouseCookie)))).status===400,"invalid carton rejected");
 check(db.prepare("SELECT COUNT(*) n FROM manifest_cartons").get().n===before,"invalid scan does not create carton");
 const orderHoldRoute=require("../src/app/api/orders/[id]/warehouse-hold/route.ts");
 const routeHoldRoute=require("../src/app/api/service-routes/[id]/warehouse-hold/route.ts");
 const orderParams={params:Promise.resolve({id:String(order.id)})},routeParams={params:Promise.resolve({id:String(routeId)})};
 check((await orderHoldRoute.POST(req("http://local/api/orders/hold","POST",{hold:true,reason:"test"},warehouseCookie),orderParams)).status===403,"warehouse cannot issue holds");
 check((await orderHoldRoute.POST(req("http://local/api/orders/hold","POST",{hold:true,reason:"test"},salesCookie),orderParams)).status===403,"sales cannot hold unowned order");
 check((await orderHoldRoute.POST(req("http://local/api/orders/hold","POST",{hold:true,reason:"test"},adminCookie),orderParams)).status===200,"admin hold API");
 check(guard.warehouseGuard(order,carton).reason_code==="ORDER_HOLD","hold API blocks packing");
 check((await orderHoldRoute.POST(req("http://local/api/orders/hold","POST",{hold:false},adminCookie),orderParams)).status===200,"admin releases hold");
 check((await routeHoldRoute.POST(req("http://local/api/routes/hold","POST",{hold:true},salesCookie),routeParams)).status===403,"route hold admin only");
 check((await routeHoldRoute.POST(req("http://local/api/routes/hold","POST",{hold:true},adminCookie),routeParams)).status===200,"route hold API");
 check(guard.warehouseGuard(order,carton).reason_code==="ROUTE_HOLD","route hold API blocks packing");
 check((await routeHoldRoute.POST(req("http://local/api/routes/hold","POST",{hold:false},adminCookie),routeParams)).status===200,"route release API");
 const heldClose=db.prepare("INSERT INTO warehouse_order_holds(order_id,source,reason,created_by_user_id) VALUES (?,'ADMIN','close-check',?)").run(order.id,admin.id);
 let blocked=false;try{flow.closeManifestCarton(cartonId,warehouse.id)}catch(error){blocked=error.reason_code==="ORDER_HOLD"}
 check(blocked&&flow.manifestCartonDetail(cartonId).carton.status==="OPEN","close rechecks guard atomically");
 db.prepare("DELETE FROM warehouse_order_holds WHERE id=?").run(heldClose.lastInsertRowid);
 // Simulate a pre-workflow database, including a populated and an empty carton.
 db.pragma("foreign_keys = OFF");
 const oldSql="CREATE TABLE IF NOT EXISTS manifest_cartons (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  carton_code TEXT NOT NULL UNIQUE,\n  service TEXT NOT NULL COLLATE NOCASE,\n  manifest_date TEXT NOT NULL,\n  daily_sequence INTEGER NOT NULL,\n  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),\n  created_by_user_id INTEGER,\n  closed_by_user_id INTEGER,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  closed_at TEXT,\n  exported_at TEXT,\n  UNIQUE(service,manifest_date,daily_sequence)\n);";
 db.exec(oldSql.replace("IF NOT EXISTS manifest_cartons","manifest_cartons_legacy"));
 db.exec("INSERT INTO manifest_cartons_legacy SELECT id,carton_code,service,manifest_date,daily_sequence,status,created_by_user_id,closed_by_user_id,created_at,closed_at,exported_at FROM manifest_cartons; DROP TABLE manifest_cartons; ALTER TABLE manifest_cartons_legacy RENAME TO manifest_cartons;");
 db.close();delete globalThis.dmdDb;delete require.cache[require.resolve("../src/lib/db.ts")];
 const migrated=require("../src/lib/db.ts").db;
 check(migrated.prepare("SELECT route_config_id FROM manifest_cartons WHERE id=?").get(cartonId).route_config_id===routeId,"migration backfills full route from packed orders");
 check(migrated.prepare("SELECT COUNT(*) n FROM manifest_carton_items WHERE manifest_carton_id=?").get(cartonId).n===2,"migration preserves items");
 check(migrated.pragma("foreign_key_check").length===0,"migration preserves foreign keys");
 migrated.prepare("UPDATE manifest_cartons SET status='PAUSED' WHERE id=?").run(cartonId);
 migrated.close();delete globalThis.dmdDb;delete require.cache[require.resolve("../src/lib/db.ts")];
 const restarted=require("../src/lib/db.ts").db;
 check(restarted.prepare("SELECT status FROM manifest_cartons WHERE id=?").get(cartonId).status==="PAUSED","restart with multiple open cartons is idempotent");
 restarted.close();delete globalThis.dmdDb;
 console.log("MANIFEST CARTONS PASS ("+checks+" assertions)");
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1}).finally(()=>{try{db.close()}catch{}fs.rmSync(temporary,{recursive:true,force:true})});
