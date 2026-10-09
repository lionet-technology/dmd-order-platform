const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,".."),temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-manifest-cartons-"));
process.env.DMD_DB_PATH=path.join(temporary,"test.db");process.env.NODE_ENV="test";
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith("@/")){const target=path.join(root,"src",request.slice(2));for(const candidate of [target,target+".ts",target+".tsx",path.join(target,"index.ts")])if(fs.existsSync(candidate))return candidate}return resolve.call(this,request,parent,isMain,options)};
require.extensions[".ts"]=require.extensions[".tsx"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
const {NextRequest}=require("next/server"),{db}=require("../src/lib/db.ts"),{createUser,createSession}=require("../src/lib/auth.ts");
const routes=require("../src/app/api/service-routes/route.ts"),guard=require("../src/lib/warehouse-guard.ts");
let checks=0;function check(value,message){checks++;if(!value)throw Error(message)}
function req(method,body,cookie){return new NextRequest("http://local/api/service-routes",{method,headers:{cookie,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined})}
async function main(){
 const admin=createUser({username:"seg.admin",display_name:"Admin",password:"TestPass123!",role:"ADMIN",is_root_admin:true});
 const wh=createUser({username:"seg.wh",display_name:"Kho",password:"TestPass123!",role:"WAREHOUSE"});
 const cookie="dmd_session="+createSession(admin.id).token,whCookie="dmd_session="+createSession(wh.id).token;
 db.prepare("INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,active,sort_order) VALUES ('SUPPLIER','DMD','',1,100)").run();
 const identity={service:"ePacket",sub_service:"Standard",supplier:"DMD",route_variables:{sender_address:"Hanoi"}};
 async function save(segmentation,extra={}){return routes.POST(req("POST",{...identity,...extra,...(segmentation===undefined?{}:{segmentation})},cookie))}
 let response=await save();check(response.status===201,"create normal route: "+await response.clone().text());let row=await response.json();const id=row.id;
 check(row.segmentation.enabled===false&&row.segmentation.rules.length===0,"default OFF");
 const orderId=Number(db.prepare("INSERT INTO orders(system_order_code,order_id,service,sub_service,supplier,workflow_status) VALUES ('SEG-1','SEG-CLIENT','ePacket','Standard','DMD','PURCHASED')").run().lastInsertRowid);
 const order={order_id:orderId},carton={route_config_id:id,segment_key:"EAST"};
 const result=()=>guard.warehouseGuard(order,carton);
 check(result().decision==="ALLOW","normal route with optional carton segment");
 response=await save({enabled:true,rules:[]});check(response.status===200&&result().decision==="ALLOW","enabled no rules allows");
 const rule={rule_type:"US_ZIP_REGION",segments:["EAST","WEST"],priority:10,active:true,config:{future:{version:1}}};
 response=await save({enabled:true,rules:[rule]});row=await response.json();
 check(response.status===200&&row.segmentation.rules[0].config.future.version===1,"generic config persists");
 check(result().decision==="ALLOW","unimplemented ZIP evaluator allows");
 guard.registerWarehouseSegmentEvaluator("US_ZIP_REGION",()=>null);check(result().decision==="ALLOW","null evaluator allows");
 guard.registerWarehouseSegmentEvaluator("US_ZIP_REGION",()=>"");check(result().decision==="ALLOW","empty evaluator allows");
 guard.registerWarehouseSegmentEvaluator("US_ZIP_REGION",()=>"WEST");check(result().reason_code==="SEGMENT_MISMATCH","concrete mismatch blocks");
 check(guard.warehouseGuard(order,{...carton,segment_key:null}).decision==="ALLOW","segment never mandatory");
 guard.registerWarehouseSegmentEvaluator("US_ZIP_REGION",(order,config)=>{check(order.zip===null&&config.segments[0]==="EAST","hook gets current order and config");return "EAST"});
 check(result().decision==="ALLOW","matching segment allows");
 guard.registerWarehouseSegmentEvaluator("US_ZIP_REGION",()=>"WEST");
 await save({enabled:false,rules:[rule]});check(result().decision==="ALLOW","OFF bypasses mismatch");
 await save(undefined,{route_variables:{sender_address:"Hanoi"}});row=await (await routes.GET(req("GET",undefined,cookie))).json();
 check(row.find(route=>route.id===id).segmentation.rules.length===1&&!row.find(route=>route.id===id).segmentation.enabled,"unrelated save preserves disabled definitions");
 await save({enabled:true,rules:[{...rule,active:false}]});check(result().decision==="ALLOW","inactive rule skipped");
 guard.registerWarehouseSegmentEvaluator("HIGH",()=>"EAST");
 await save({enabled:true,rules:[rule,{...rule,rule_type:"HIGH",priority:20}]});check(result().decision==="ALLOW","highest concrete priority wins");
 guard.registerWarehouseSegmentEvaluator("HIGH",()=>null);check(result().reason_code==="SEGMENT_MISMATCH","null high priority falls through");
 const before=JSON.stringify((await (await routes.GET(req("GET",undefined,cookie))).json()).find(route=>route.id===id));
 for(const invalid of [
  {enabled:"true",rules:[]}, {enabled:true,rules:[{...rule,priority:1.5}]},
  {enabled:true,rules:[{...rule,segments:["EAST","EAST"]}]}, {enabled:true,rules:[{...rule,rule_type:"bad key"}]},
  {enabled:true,rules:[{...rule,config:[]}]}, {enabled:true,rules:[{...rule,config:JSON.parse('{"__proto__":{}}')}]},
  {enabled:true,rules:[{...rule,config:{text:"x".repeat(65537)}}]},
  {enabled:true,rules:[{...rule,config:{deep:JSON.parse("[".repeat(14)+"0"+"]".repeat(14))}}]},
  {enabled:true,rules:Array(51).fill(rule)}, {enabled:true,rules:[{...rule,priority:10001}]}
 ])check((await save(invalid,{route_variables:{sender_address:"must-not-save"}})).status===400,"invalid definition rejected: "+JSON.stringify(invalid).slice(0,150));
 db.exec("CREATE TEMP TRIGGER reject_seg_rule BEFORE INSERT ON warehouse_routing_rules WHEN NEW.evaluator_key='FAIL' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 check((await save({enabled:false,rules:[{...rule,rule_type:"FAIL"}]},{route_variables:{sender_address:"must-not-save"}})).status===400,"rule insert failure rejected");
 db.exec("DROP TRIGGER reject_seg_rule");
 const after=JSON.stringify((await (await routes.GET(req("GET",undefined,cookie))).json()).find(route=>route.id===id));check(before===after,"invalid request leaves all route data unchanged");
 check((await routes.POST(req("POST",{...identity,segmentation:{enabled:false,rules:[]}},whCookie))).status===403,"warehouse cannot edit segmentation");
 check((await routes.GET(req("GET",undefined,whCookie))).status===403,"warehouse cannot read admin config");
 db.close();delete globalThis.dmdDb;delete require.cache[require.resolve("../src/lib/db.ts")];
 const reopened=require("../src/lib/db.ts").db;
 check(reopened.prepare("SELECT segmentation_enabled FROM service_route_configs WHERE id=?").get(id).segmentation_enabled===1,"enabled persists restart");
 check(reopened.prepare("SELECT COUNT(*) n FROM warehouse_routing_rules WHERE route_config_id=?").get(id).n===2,"rules persist restart");
 reopened.exec("ALTER TABLE service_route_configs DROP COLUMN segmentation_enabled; ALTER TABLE warehouse_routing_rules DROP COLUMN priority");
 reopened.close();delete globalThis.dmdDb;delete require.cache[require.resolve("../src/lib/db.ts")];
 const migrated=require("../src/lib/db.ts").db;
 check(migrated.prepare("SELECT segmentation_enabled FROM service_route_configs WHERE id=?").get(id).segmentation_enabled===0,"legacy routes migrate OFF");
 check(migrated.prepare("SELECT priority FROM warehouse_routing_rules WHERE route_config_id=?").all(id).every(rule=>rule.priority===0),"legacy rules migrate default priority");
 check(migrated.prepare("SELECT COUNT(*) n FROM warehouse_routing_rules WHERE route_config_id=?").get(id).n===2,"migration preserves definitions");
 migrated.close();delete globalThis.dmdDb;
 console.log("ROUTE SEGMENTATION PASS ("+checks+" assertions)");
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1}).finally(()=>{try{db.close()}catch{}fs.rmSync(temporary,{recursive:true,force:true})});
