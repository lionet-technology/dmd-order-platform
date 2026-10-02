const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||`/tmp/dmd-order-flow-${process.pid}.db`;
process.env.DMD_DB_PATH=dbPath;process.env.NODE_ENV="test";
for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith("@/")){const target=path.join(root,"src",request.slice(2));for(const candidate of [target,`${target}.ts`,`${target}.tsx`,path.join(target,"index.ts")])if(fs.existsSync(candidate))return candidate;}return originalResolve.call(this,request,parent,isMain,options)};
require.extensions[".ts"]=function(module,filename){const source=fs.readFileSync(filename,"utf8");const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:filename});module._compile(result.outputText,filename)};
const {db}=require(path.join(root,"src/lib/db.ts"));
const {createUser}=require(path.join(root,"src/lib/auth.ts"));
const {upsertOrder,addSupplierCost}=require(path.join(root,"src/lib/finance.ts"));
const {addOrderTracking,updateOrderTracking,replaceOrderTracking,listOrderTrackings}=require(path.join(root,"src/lib/order-operations.ts"));
let checks=0;function assert(condition,message){checks++;if(!condition)throw new Error(`ASSERTION FAILED: ${message}`)}
function order(id){return db.prepare("SELECT * FROM orders WHERE id=?").get(id)}
async function main(){
  const admin=createUser({display_name:"Admin",username:"admin.test",password:"TestPass123!",role:"ADMIN",is_root_admin:true});
  const sales=createUser({display_name:"Sales",username:"sales.test",password:"TestPass123!",role:"SALES",created_by_user_id:admin.id});
  const client=createUser({display_name:"Client",username:"client.test",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id,created_by_user_id:admin.id});
  db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,?,?,?,?)").run(client.id,"ePacket","",1,5);
  db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,?,?,?,?)").run(client.id,"UPS","",0,0);

  const first=upsertOrder({client_user_id:client.id,created_at:"30/09/2026",order_id:"FLOW-001",customer:"Client",sales:"Sales",service:"ePacket",sub_service:"T11",item:"T-shirt",material:"Cotton",carton_count:3,weight:12,length:50,width:40,height:30,declared_value:100,sales_price:100});
  assert(first.calculated_volume===60000&&first.volume===60000,"dimensions should calculate aggregate volume");
  assert(first.chargeable_weight===12,"chargeable weight should be max(12kg, 60000/5000)");
  assert(first.discount===5&&first.discount_source==="DEFAULT","client default discount should snapshot onto Order");
  assert(first.workflow_status==="PENDING_PURCHASE","new Order should enter purchase queue");

  const manual=upsertOrder({client_user_id:client.id,created_at:"30/09/2026",order_id:"FLOW-002",customer:"Client",sales:"Sales",service:"ePacket",item:"Shoes",material:"Leather",carton_count:2,weight:15,manual_volume:90000,declared_value:120});
  assert(manual.calculated_volume===null&&manual.manual_volume===90000&&manual.chargeable_weight===18,"manual volume should work without dimensions");
  let blocked=false;try{upsertOrder({client_user_id:client.id,order_id:"BLOCKED",service:"UPS",item:"Bag",material:"Nylon",carton_count:1,weight:1,manual_volume:5000})}catch(error){blocked=String(error.message).includes("bị chặn")}
  assert(blocked,"disabled client service must reject Order");
  let noteRequired=false;try{upsertOrder({client_user_id:client.id,order_id:"OVERRIDE-NO-NOTE",service:"ePacket",item:"Bag",material:"Nylon",carton_count:1,weight:1,manual_volume:5000,discount:8})}catch(error){noteRequired=String(error.message).includes("lý do")}
  assert(noteRequired,"manual discount override must require a reason");
  const override=upsertOrder({client_user_id:client.id,order_id:"OVERRIDE",service:"ePacket",item:"Bag",material:"Nylon",carton_count:1,weight:1,manual_volume:5000,discount:8,discount_note:"Campaign exception"});
  assert(override.discount_source==="MANUAL","manual discount should be auditable");

  const a1=addOrderTracking({orderId:first.id,tracking:"1Z-A1",labelUrl:"https://labels.test/a1.pdf",lotNumber:1,actorId:admin.id,isPrimary:true});
  const a2=addOrderTracking({orderId:first.id,tracking:"1Z-A2",labelUrl:"https://labels.test/a2.pdf",lotNumber:1,actorId:admin.id});
  addOrderTracking({orderId:first.id,tracking:"1Z-B1",labelUrl:"https://labels.test/b1.pdf",lotNumber:2,actorId:admin.id});
  assert(listOrderTrackings(first.id,false).length===3,"Order should keep multiple trackings across lots");
  updateOrderTracking({orderId:first.id,id:a2.id,costMatchType:"INCLUDED_IN_PARENT",costParentTrackingId:a1.id});
  const replacement=replaceOrderTracking({orderId:first.id,oldTrackingId:a1.id,newTracking:"1Z-A1-NEW",newLabelUrl:"https://labels.test/a1-new.pdf",reason:"Supplier replaced label",actorId:admin.id});
  const afterReplacement=listOrderTrackings(first.id,true);
  assert(afterReplacement.some(row=>row.id===a1.id&&row.status==="REPLACED"),"old tracking must remain as history");
  assert(afterReplacement.find(row=>row.id===a2.id).cost_parent_tracking_id===replacement.id,"auxiliary cost link should follow the replacement tracking");
  assert(order(first.id).tracking===replacement.tracking,"new primary tracking should sync to legacy Order field");

  const oldCost=addSupplierCost({supplier:"KILOSHIP",service:"ePacket",sub_service:"T11",tracking:"1Z-A1",total_net_cost:25,extra_surcharge:2,import_tax:3,note:"Address correction",source_key:"cost-a1"});
  const lot2Cost=addSupplierCost({supplier:"KILOSHIP",service:"ePacket",sub_service:"T11",tracking:"1Z-B1",total_net_cost:18,source_key:"cost-b1"});
  assert(oldCost.matched&&lot2Cost.matched,"cost must match current and replaced tracking aliases");
  const reconciled=order(first.id);
  assert(reconciled.true_net_cost===43,"Order True Net Cost should sum billable tracking rows");
  assert(reconciled.extra_surcharge===2&&reconciled.extra_import_tax===3,"tax and surcharge should aggregate across trackings");
  assert(reconciled.total_due===105,"total due should equal sales price plus tax and surcharge");
  assert(String(reconciled.note).includes("Address correction")&&String(reconciled.note).includes("Đổi Tracking"),"shared Order note should contain tracking and charge events");
  const duplicate=addSupplierCost({supplier:"KILOSHIP",service:"ePacket",sub_service:"T11",tracking:"1Z-A1",total_net_cost:25,extra_surcharge:2,import_tax:3,note:"Address correction",source_key:"cost-a1"});
  assert(duplicate.duplicate&&order(first.id).true_net_cost===43,"duplicate import row must not double count");
  console.log(`ORDER FLOW PASS (${checks} assertions)`);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1}).finally(()=>{try{db.close()}catch{}for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true})});
