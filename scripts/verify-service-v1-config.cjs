const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,".."),temp=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-service-v1-"));
process.env.NODE_ENV="test";process.env.DMD_DB_PATH=path.join(temp,"test.db");
const original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){return original.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,...rest)};
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {db}=require("../src/lib/db.ts"),{createUser,createSession}=require("../src/lib/auth.ts"),config=require("../src/lib/service-v1-config.ts"),api=require("../src/app/api/service-v1/configuration/route.ts"),{NextRequest}=require("next/server");
let checks=0;function check(value,message){checks++;assert.ok(value,message)}
async function main(){
 const owner=createUser({username:"v1.owner",display_name:"Owner",password:"TestPass123!",role:"ADMIN",is_root_admin:true});
 const sales=createUser({username:"v1.sales",display_name:"Sales",password:"TestPass123!",role:"SALES"});
 const admin=createUser({username:"v1.admin",display_name:"Admin",password:"TestPass123!",role:"ADMIN"});
 const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,active) VALUES ('UPS','Saver','SBay',1)").run().lastInsertRowid);
 const payload={route_id:route,expected_revision:0,request_key:"config-test-0001",config:{currency:"VND",adapter:"UPS",markets:["US","VN"]}};
 const before=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(route);
 const first=config.saveServiceV1Config(payload,owner.id);
 check(first.revision===1,"first config");
 check(config.saveServiceV1Config(payload,owner.id).id===first.id,"idempotent retry");
 assert.throws(()=>config.saveServiceV1Config({...payload,config:{...payload.config,markets:["US"]}},owner.id),/Request key/);checks++;
 assert.throws(()=>config.saveServiceV1Config({...payload,request_key:"config-stale-0001"},owner.id),/đã thay đổi/);checks++;
 for(const invalid of [{...payload.config,currency:"USD"},{...payload.config,markets:[]},{...payload.config,markets:["US","US"]},{...payload.config,adapter:"EPACKET"},{...payload.config,enabled:true}]){
  assert.throws(()=>config.saveServiceV1Config({...payload,expected_revision:1,request_key:"invalid-config-0001",config:invalid},owner.id));checks++;
 }
 for(const actor of [sales,admin]){assert.throws(()=>config.saveServiceV1Config({...payload,expected_revision:1,request_key:"config-denied-0001"},actor.id),/Owner/);checks++;}
 check(JSON.stringify(db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(route))===JSON.stringify(before),"staged config never changes live route");
 check(db.prepare("SELECT COUNT(*) n FROM service_v1_config_versions").get().n===1,"invalid/stale/denied changes leave no version");
 assert.throws(()=>db.prepare("UPDATE service_v1_config_versions SET config_json='{}'").run(),/Immutable/);checks++;
 assert.throws(()=>db.prepare("DELETE FROM service_v1_config_versions").run(),/Immutable/);checks++;
 db.exec("CREATE TEMP TRIGGER v1_config_reject BEFORE INSERT ON service_v1_config_versions WHEN NEW.revision=2 BEGIN SELECT RAISE(ABORT,'injected rollback'); END");
 assert.throws(()=>config.saveServiceV1Config({...payload,expected_revision:1,request_key:"config-next-0001"},owner.id),/injected/);checks++;
 check(config.readServiceV1Config(route,owner.id).revision===1,"insert failure rolls back");
 db.exec("DROP TRIGGER v1_config_reject");
 const next=config.saveServiceV1Config({...payload,expected_revision:1,request_key:"config-next-0001"},owner.id);
 check(next.revision===2,"retry after rollback");
 const cookie=id=>"dmd_session="+createSession(id).token;
 const ownerCookie=cookie(owner.id),salesCookie=cookie(sales.id),adminCookie=cookie(admin.id);
 function req(method,body,c){return new NextRequest("http://local/api/service-v1/configuration?route_id="+route,{method,headers:{...(c?{cookie:c}:{}),"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});}
 check((await api.GET(req("GET",null,ownerCookie))).status===200,"Owner API");
 for(const c of [salesCookie,adminCookie,undefined]){
  check((await api.GET(req("GET",null,c))).status>=400,"private config read denied");
  check((await api.POST(req("POST",payload,c))).status>=400,"private config write denied");
 }
 db.close();delete globalThis.dmdDb;delete require.cache[require.resolve("../src/lib/db.ts")];
 const reopened=require("../src/lib/db.ts").db;
 check(reopened.prepare("SELECT MAX(revision) r FROM service_v1_config_versions WHERE route_id=?").get(route).r===2,"restart persistence");
 reopened.close();
 console.log("SERVICE V1 CONFIGURATION PASS ("+checks+" checks; disposable DB "+temp+")");
}
main().catch(e=>{console.error(e);process.exitCode=1});
