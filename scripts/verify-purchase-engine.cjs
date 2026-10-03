const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const ExcelJS=require("exceljs");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-purchase-engine-"+process.pid+".db");
const templatePath=path.join(os.tmpdir(),"dmd-purchase-template-"+process.pid+".xlsx");
process.env.DMD_DB_PATH=dbPath;
process.env.NODE_ENV="test";
for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});

const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){
  if(request.startsWith("@/")){
    const target=path.join(root,"src",request.slice(2));
    for(const candidate of [target,target+".ts",target+".tsx",path.join(target,"index.ts")])if(fs.existsSync(candidate))return candidate;
  }
  return originalResolve.call(this,request,parent,isMain,options);
};
require.extensions[".ts"]=function(module,filename){
  const source=fs.readFileSync(filename,"utf8");
  const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:filename});
  module._compile(result.outputText,filename);
};

const {db}=require(path.join(root,"src/lib/db.ts"));
const {createUser}=require(path.join(root,"src/lib/auth.ts"));
const {upsertOrder,addSupplierCost}=require(path.join(root,"src/lib/finance.ts"));
const {saveOrderShipmentStructure,validatePurchaseReadiness}=require(path.join(root,"src/lib/order-shipments.ts"));
const {addOrderTracking}=require(path.join(root,"src/lib/order-operations.ts"));
const {generatePurchaseFiles,scanPurchaseWorkbook,genericPurchaseRows,missingRoutePlaceholders}=require(path.join(root,"src/lib/purchase-templates.ts"));
const {listOrderEvents,publishPublicNote}=require(path.join(root,"src/lib/order-audit.ts"));

let checks=0;
function assert(condition,message){checks++;if(!condition)throw new Error("ASSERTION FAILED: "+message)}

async function workbookRows(buffer){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet=workbook.getWorksheet("Invoice");
  return sheet.getSheetValues().map(row=>Array.isArray(row)?row.slice(1):row);
}

async function main(){
  const admin=createUser({display_name:"Admin",username:"purchase.admin",password:"TestPass123!",role:"ADMIN",is_root_admin:true});
  const sales=createUser({display_name:"Sales",username:"purchase.sales",password:"TestPass123!",role:"SALES",created_by_user_id:admin.id});
  const client=createUser({display_name:"Client",username:"purchase.client",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id,created_by_user_id:admin.id});
  db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,default_sub_service,default_supplier) VALUES (?,?,?,?,?,?,?)")
    .run(client.id,"ePacket","",1,0,"T11","KILOSHIP");

  const order=upsertOrder({
    client_user_id:client.id,created_at:"03/10/2026",order_id:"PURCHASE-001",customer:"Client",sales:"Sales",
    service:"ePacket",sub_service:"T11",supplier:"KILOSHIP",item:"Legacy summary",material:"Mixed",carton_count:2,
    weight:5,length:30,width:20,height:10,declared_value:16,sales_price:100,recipient_name:"Jane Doe",
    address1:"1 Main St",city:"Austin",state:"TX",zip:"78701",country:"US",phone:"+1 555 0100",
  });
  const structure=saveOrderShipmentStructure(order.id,{lot_count:2,cartons:[
    {carton_number:1,lot_number:1,weight:2,length:20,width:10,height:10,items:[
      {sku:"SKU-A",description:"Shirt",material:"Cotton",quantity:2,unit_manufacturing_value:3,currency:"USD"},
    ]},
    {carton_number:2,lot_number:2,weight:3,length:30,width:20,height:10,items:[
      {sku:"SKU-B",description:"Shoes",material:"Leather",quantity:1,unit_manufacturing_value:10,currency:"USD"},
    ]},
  ]});
  assert(structure.lots.length===2&&structure.cartons.length===2,"Order should normalize to two Lots and two Cartons");
  assert(validatePurchaseReadiness(order.id).ready,"fully declared cartons should be purchase-ready");

  const cartons=structure.cartons;
  addOrderTracking({orderId:order.id,tracking:"LOT-1-TRACK",labelUrl:"https://labels.test/1.pdf",cartonId:Number(cartons[0].id),actorId:admin.id});
  addOrderTracking({orderId:order.id,tracking:"LOT-2-TRACK",labelUrl:"https://labels.test/2.pdf",cartonId:Number(cartons[1].id),actorId:admin.id});
  addSupplierCost({supplier:"KILOSHIP",service:"ePacket",sub_service:"T11",tracking:"LOT-1-TRACK",total_net_cost:10,source_key:"purchase-cost-1"});
  addSupplierCost({supplier:"KILOSHIP",service:"ePacket",sub_service:"T11",tracking:"LOT-2-TRACK",total_net_cost:20,extra_surcharge:5,import_tax:7,surcharge_type:"Remote area",source_key:"purchase-cost-2"});

  const current=db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  const lots=db.prepare("SELECT * FROM order_lots WHERE order_id=? ORDER BY lot_number").all(order.id);
  assert(lots[0].net_cost===10&&lots[1].net_cost===20&&lots.every(lot=>lot.cost_status==="MATCHED"),"each Lot should carry its matched supplier cost");
  assert(current.gross_profit_net===70,"gross profit should be sales price minus total Lot cost");
  assert(current.total_due===112,"surcharge and tax should affect amount due");
  const salesEvents=listOrderEvents(order.id,"SALES");
  const adminEvents=listOrderEvents(order.id,"ADMIN");
  assert(!salesEvents.some(event=>event.event_type==="SUPPLIER_COST_MATCHED"),"Sales history must not expose supplier cost audit");
  assert(adminEvents.filter(event=>event.event_type==="SUPPLIER_COST_MATCHED").length===2,"Admin history should keep supplier cost audit");
  let rejected=false;
  try{publishPublicNote({orderId:order.id,eventType:"SUPPLIER_COST_MATCHED",summary:"should not publish"})}catch{rejected=true}
  assert(rejected,"public note must reject event types outside the allowlist");

  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet("Invoice");
  sheet.addRow(["DMD Order","Lot","Carton","SKU","Qty","Line value","Lot total","Order total","Supplier Service","Sender"]);
  sheet.addRow(["{{order.dmd_order_id}}","{{lot.number}}","{{carton.number}}","{{item.sku}}","{{item.quantity}}","{{item.total_manufacturing_value}}","{{lot.total_manufacturing_value}}","{{order.total_manufacturing_value}}","{{route.service_code}}","{{route.sender_address}}"]);
  await workbook.xlsx.writeFile(templatePath);
  const scan=await scanPurchaseWorkbook(fs.readFileSync(templatePath));
  assert(scan.unknown.length===0&&scan.placeholders.length===10,"template scanner should accept order and route placeholders");
  assert(missingRoutePlaceholders(scan.placeholders,{service_code:"EP_T11"}).includes("route.sender_address"),"template validation should catch missing route variables");

  const routeVariables={service_code:"EP_T11",sender_address:"DMD Warehouse, Hanoi"};
  const routeId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json,created_by_user_id) VALUES (?,?,?,?,?)").run("ePacket","T11","KILOSHIP",JSON.stringify(routeVariables),admin.id).lastInsertRowid);
  const templateId=Number(db.prepare("INSERT INTO purchase_templates(route_config_id,name,output_mode,repeat_sections_json,created_by_user_id) VALUES (?,?,?,?,?)")
    .run(routeId,"Invoice per Lot","PER_LOT",JSON.stringify([{sheet:"Invoice",row:2,scope:"CARTON_ITEM"}]),admin.id).lastInsertRowid);
  db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status,placeholder_map_json,validation_json,created_by_user_id,activated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .run(templateId,1,"invoice.xlsx",templatePath,"ACTIVE",JSON.stringify(scan.placeholders),JSON.stringify({errors:[],warnings:[]}),admin.id);

  const generated=await generatePurchaseFiles([order.id]);
  assert(generated.missing.length===0&&generated.files.length===2,"PER_LOT template should generate one file for each Lot");
  const rendered=await Promise.all(generated.files.map(file=>workbookRows(file.buffer)));
  const flattened=rendered.map(rows=>JSON.stringify(rows));
  assert(flattened.some(value=>value.includes("SKU-A")&&!value.includes("SKU-B")),"Lot 1 file should contain only Lot 1 goods");
  assert(flattened.some(value=>value.includes("SKU-B")&&!value.includes("SKU-A")),"Lot 2 file should contain only Lot 2 goods");
  assert(flattened.every(value=>value.includes("16")),"each Lot file should retain the computed Order total");
  assert(flattened.every(value=>value.includes("EP_T11")&&value.includes("DMD Warehouse, Hanoi")),"route variables should render into every generated workbook");
  const generic=genericPurchaseRows([order.id]);
  assert(generic.length===2&&generic[0].order_total_manufacturing_value===16,"generic fallback should expose carton-item rows and computed totals");

  console.log("PURCHASE ENGINE PASS ("+checks+" assertions)");
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1}).finally(()=>{
  try{db.close()}catch{}
  for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
  fs.rmSync(templatePath,{force:true});
});
