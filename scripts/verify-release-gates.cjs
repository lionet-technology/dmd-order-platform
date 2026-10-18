const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript"),assert=require("node:assert/strict");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-release-gates-")),root=path.resolve(__dirname,"..");
process.env.DMD_DB_PATH=path.join(dir,"fixture.db");process.env.NODE_ENV="test";
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){if(r.startsWith("@/"))r=path.join(root,"src",r.slice(2));return resolve.call(this,r,p,m,o)};
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {db}=require("../src/lib/db.ts");
let checks=0;const check=(v,m)=>{checks++;assert.ok(v,m)},rejects=(f,m)=>{checks++;assert.throws(f,undefined,m)};
// Start from the pre-finance-role schema. Migration must preserve ALL columns and sessions.
require("../src/lib/credit.ts");
db.prepare("INSERT INTO users(username,display_name,password_hash,role,credit_limit_cents,credit_term_days) VALUES ('legacy.keep','Legacy','fixture-hash','ADMIN',123456,45)").run();
db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (1,'fixture-session','2100-01-01')").run();
const before=db.prepare("SELECT * FROM users").all(),sessions=db.prepare("SELECT * FROM sessions").all();
const auth=require("../src/lib/auth.ts"),{NextRequest}=require("next/server");
check(JSON.stringify(before)===JSON.stringify(db.prepare("SELECT * FROM users").all()),"Role migration preserves every user column and financial limit");
check(JSON.stringify(sessions)===JSON.stringify(db.prepare("SELECT * FROM sessions").all()),"Role migration preserves sessions");
check(db.prepare("PRAGMA foreign_key_check").all().length===0,"Role migration preserves FK integrity");
require("../src/lib/finance-role-schema.ts").ensureFinanceRoles();check(db.prepare("SELECT COUNT(*) n FROM users").get().n===1,"Migration rerun is idempotent");
const create=(role,extra={})=>auth.createUser({username:"gates."+role.toLowerCase(),display_name:role,password:"TestPass123!",role,...extra});
const owner=auth.createUser({username:"gates.owner",display_name:"Owner",password:"TestPass123!",role:"ADMIN",is_root_admin:true}),ops=create("ADMIN"),sales=create("SALES"),client=create("CLIENT",{sales_user_id:sales.id}),warehouse=create("WAREHOUSE"),finance=create("FINANCE"),bod=create("BOD");
const tokens=new Map();function req(url,user,body,method){if(user&&!tokens.has(user.id))tokens.set(user.id,auth.createSession(user.id).token);return new NextRequest("http://local"+url,{method:method||(body?"POST":"GET"),headers:{...(user?{cookie:"dmd_session="+tokens.get(user.id)}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined})}
async function main(){
const users=require("../src/app/api/users/route.ts"),userDetail=require("../src/app/api/users/[id]/route.ts");
let response=await users.POST(req("/api/users",ops,{username:"ops.escalation",display_name:"No",password:"TestPass123!",role:"FINANCE"}));check(response.status===403,"Ops Admin cannot create a Finance account");
response=await userDetail.PATCH(req("/api/users/"+finance.id,ops,{password:"ChangedPass123!"},"PATCH"),{params:Promise.resolve({id:String(finance.id)})});check(response.status===403,"Ops Admin cannot take over Finance by resetting password");
response=await users.POST(req("/api/users",owner,{username:"owner.finance",display_name:"Approved",password:"TestPass123!",role:"FINANCE"}));check(response.status===201,"Owner can explicitly provision Finance");
for(const [url,module] of [["/api/costs","costs"],["/api/reconciliation","reconciliation"],["/api/supplier-payables","supplier-payables"]]){
 const api=require("../src/app/api/"+module+"/route.ts");
 for(const user of [undefined,ops,sales,client,warehouse,finance,bod]){
 response=await api.GET(req(url,user));check(response.status===(user?auth.isFinanceRole(user.role)?200:403:401),url+" role "+(user?.role||"anonymous"));
 if(!user||!auth.isFinanceRole(user.role)){response=await api.POST(req(url,user,{}));check(response.status===(user?403:401),url+" denied writes "+user?.role)}
 }
}
for(const user of [finance,bod]){
 check((await users.POST(req("/api/users",user,{role:"ADMIN"}))).status===403,"Finance cannot create Admin");
 check((await require("../src/app/api/orders/route.ts").GET(req("/api/orders",user))).status===403,"Finance has no unrelated Orders access");
 check((await require("../src/app/api/ledger/route.ts").POST(req("/api/ledger",user,{entry_type:"PAYMENT"}))).status===403,"Finance cannot mutate Client wallet");
 check((await require("../src/app/api/service-routes/route.ts").POST(req("/api/service-routes",user,{}))).status===403,"Finance cannot mutate route config");
}
const importApi=require("../src/app/api/import/route.ts");
for(const kind of ["orders","tracking_updates","balance"]){const form=new FormData();form.set("kind",kind);response=await importApi.POST(new NextRequest("http://local/api/import",{method:"POST",headers:{cookie:"dmd_session="+tokens.get(finance.id)},body:form}));check(response.status===403,"Finance cannot import "+kind);}
const sentinel=912345.67;
const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,workflow_status,est_net_cost,true_net_cost,gross_profit_net,estimated_gp,finalized_gp,cost_coverage_json,pricing_snapshot_json,pricing_eligibility_json) VALUES ('PRIVATE-COST',?,?,'PURCHASED',?,?,?,?,?,?,?,?)").run(client.id,sales.id,sentinel,sentinel,sentinel,sentinel,sentinel,JSON.stringify({actual_cents:91234567}),JSON.stringify({net:sentinel}),JSON.stringify({eligible:true})).lastInsertRowid);
db.prepare("INSERT INTO order_events(order_id,event_type,summary,visibility,before_json,after_json) VALUES (?,'SUPPLIER_COST_IMPORTED',?,'ADMIN',?,?)").run(id,String(sentinel),JSON.stringify({cost:sentinel}),JSON.stringify({cost:sentinel}));
for(const user of [owner,ops,sales,client]){
 const list=await require("../src/app/api/orders/route.ts").GET(req("/api/orders",user)),detail=await require("../src/app/api/orders/[id]/route.ts").GET(req("/api/orders/"+id,user),{params:Promise.resolve({id:String(id)})});
 for(const result of [list,detail]){check(result.status===200,"Operational order response succeeds "+user.role);const text=await result.text();check(!text.includes(String(sentinel))&&!text.includes('"pricing_snapshot_json"')&&!text.includes('"true_net_cost"'),"No private costs/snapshots/audit escape "+user.role)}
}
db.prepare("INSERT INTO order_lots(order_id,lot_number,net_cost) VALUES (?,1,?)").run(id,sentinel);
const structureResponse=await require("../src/app/api/orders/[id]/shipment-structure/route.ts").GET(req("/api/orders/"+id+"/shipment-structure",ops),{params:Promise.resolve({id:String(id)})});check(structureResponse.status===200,"Operations can read shipment structure");check(!(await structureResponse.text()).includes(String(sentinel)),"Shipment structure does not disclose Lot Net");
const writeResponse=await require("../src/app/api/orders/route.ts").POST(req("/api/orders",ops,{order_id:"WRITE-COST",customer:"Fixture",service:"ePacket",item:"Shirt",material:"Cotton",carton_count:1,weight:1,manual_volume:5000,sales_price:123,est_net_cost:sentinel}));check(writeResponse.status===201,"Operational order mutation succeeds");check(!(await writeResponse.text()).includes(String(sentinel)),"Mutation response does not disclose Net");
const financeReport=await require("../src/app/api/reconciliation/route.ts").GET(req("/api/reconciliation",finance));check((await financeReport.json()).items.some(r=>r.finalized_gp===sentinel),"Finance can read GP-Net through the approved Reconciliation module");
const projection=require("../src/lib/financial-privacy.ts").operationalProjection({tracking_data:JSON.stringify([{net_cost:sentinel,tracking:"SAFE"}]),nested:{cost_snapshot_json:"{\"net\":912345.67}"},events:[{visibility:"ADMIN",summary:String(sentinel)}]});
check(!JSON.stringify(projection).includes(String(sentinel)),"Serialized nested JSON and finance audit events are filtered");
check(require("../src/lib/financial-privacy.ts").operationalProjection({public_note:"[10:00] Tracking updated"}).public_note==="[10:00] Tracking updated","Timestamped public notes remain visible");
const p=require("../src/lib/epacket-pricing.ts"),r=require("../src/lib/route-pricing.ts");
const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Standard','DMD')").run().lastInsertRowid);
const input={service:"ePacket",sub_service:"Standard",supplier:"DMD",country:"US",carton_count:1,weight:.05,length:10,width:5,height:3};
rejects(()=>r.createPriceVersion(route,p.STANDARD,owner.id),"Net-only table cannot become an approved price version");
const rates=p.STANDARD.map(t=>({...t,base_rate:10}));
let version=r.createPriceVersion(route,rates,owner.id);r.activatePricing(route,{price_version_id:version.id,retail_markup:10},owner.id);
const priceApi=require("../src/app/api/route-pricing/route.ts");
response=await priceApi.GET(req("/api/route-pricing?route_id="+route,owner));const priceData=await response.json();check(response.status===200&&priceData.active.sales_markup_percent===10&&!JSON.stringify(priceData).includes('"net"'),"Owner can reload independent markup without Net disclosure");
let q=r.orderQuote(input);check(q.base===10&&q.retail===11&&q.sale_price===11,"Base -> markup -> sale uses independent approved rates");
version=r.createPriceVersion(route,rates.map(t=>({...t,net:t.net*99})),owner.id);r.activatePricing(route,{price_version_id:version.id,retail_markup:10},owner.id);
q=r.orderQuote(input);check(q.sale_price===11&&q.base===10,"Changing Estimated Net cannot change Base or sale");
rejects(()=>r.activatePricing(route,{price_version_id:version.id,base_markup:6},owner.id),"Old Net-based markup cannot be activated");
const legacy=Number(db.prepare("INSERT INTO route_price_versions(route_id,version_number,tiers_json) VALUES (?,99,?)").run(route,JSON.stringify(p.STANDARD)).lastInsertRowid);
const config=Number(db.prepare("INSERT INTO route_pricing_configs(route_id,base_markup,retail_markup,currency,surcharges_json) VALUES (?,6,16,'USD',?)").run(route,JSON.stringify(p.DEFAULT_SURCHARGES)).lastInsertRowid);
db.prepare("INSERT INTO route_pricing_activations(route_id,price_version_id,config_version_id,effective_at) VALUES (?,?,?,'2000-01-01')").run(route,legacy,config);
// Latest effective activation intentionally selects legacy to emulate a real pre-migration route.
const now=new Date(Date.now()+1000).toISOString();check(r.activePricing(route,now).price_version_id===version.id,"Existing version ordering remains deterministic");
const legacyRoute=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Eco','DMD')").run().lastInsertRowid);
const lv=Number(db.prepare("INSERT INTO route_price_versions(route_id,version_number,tiers_json) VALUES (?,1,?)").run(legacyRoute,JSON.stringify(p.ECO)).lastInsertRowid);
const lc=Number(db.prepare("INSERT INTO route_pricing_configs(route_id,base_markup,retail_markup,currency,surcharges_json) VALUES (?,6,16,'USD',?)").run(legacyRoute,JSON.stringify(p.DEFAULT_SURCHARGES)).lastInsertRowid);
db.prepare("INSERT INTO route_pricing_activations(route_id,price_version_id,config_version_id,effective_at) VALUES (?,?,?,'2000-01-01')").run(legacyRoute,lv,lc);
q=r.orderQuote({...input,sub_service:"Eco"});check(!q.eligible&&q.reasons.some(s=>s.includes("Base Rate")),"Legacy route without approved Base Rate is blocked");
check((await priceApi.GET(req("/api/route-pricing?route_id="+route,ops))).status===403,"Only Owner can manage approved Base Rate");
check((await priceApi.POST(req("/api/route-pricing",owner,{action:"upload",route_id:route,tiers:[{weight:10,net:9,base_rate:12}]}))).status===400,"Upload requires explicit Owner approval");
const ratesFile=new FormData();ratesFile.set("route_id",String(route));ratesFile.set("approval_confirmed","true");ratesFile.set("file",new File(["weight,net,base_rate\n10,9,12\n"],"approved-fixture.csv"));
response=await priceApi.POST(new NextRequest("http://local/api/route-pricing",{method:"POST",headers:{cookie:"dmd_session="+tokens.get(owner.id)},body:ratesFile}));check(response.status===201,"Owner CSV Base Rate upload works");const uploaded=await response.json();
response=await priceApi.POST(req("/api/route-pricing",owner,{action:"activate",route_id:route,price_version_id:uploaded.id,retail_markup:14}));check(response.status===200,"Owner activates approved Base Rate");
check(Math.abs(r.orderQuote(input).sale_price-13.68)<1e-8,"Uploaded Base Rate is used for pricing");
response=await priceApi.GET(req("/api/route-pricing?route_id="+route+"&download=1",owner));check((await response.text()).includes("10,,12"),"CSV download leaves private Net blank");
const ExcelJS=require("exceljs"),book=new ExcelJS.Workbook();book.addWorksheet("Sheet").getCell("A1").value="{{lot.net_cost}}";
const scan=await require("../src/lib/purchase-templates.ts").scanPurchaseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));check(scan.unknown.some(p=>p.token==="lot.net_cost"),"Operational Excel templates cannot expose Lot Net");
check(db.prepare("PRAGMA foreign_key_check").all().length===0,"Final fixture FK integrity");
console.log("RELEASE GATES PASS ("+checks+" assertions)");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{db.close();delete globalThis.dmdDb;fs.rmSync(dir,{recursive:true,force:true})});
