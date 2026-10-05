const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),assert=require("node:assert/strict");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-epacket-"));process.env.DMD_DB_PATH=path.join(tmp,"test.db");process.env.NODE_ENV="test";
const {seed}=require("./seed-epacket.cjs"),{db}=require("../src/lib/db.ts"),p=require("../src/lib/epacket-pricing.ts"),r=require("../src/lib/route-pricing.ts"),{createSession}=require("../src/lib/auth.ts"),{NextRequest}=require("next/server");
const api=require("../src/app/api/client-orders/route.ts"),ordersApi=require("../src/app/api/orders/route.ts"),detailApi=require("../src/app/api/orders/[id]/route.ts"),configApi=require("../src/app/api/route-pricing/route.ts"),{upsertOrder}=require("../src/lib/finance.ts"),{parseClientFile}=require("../src/lib/client-order-import.ts"),ExcelJS=require("exceljs");
let checks=0;function check(v,m){checks++;assert.ok(v,m)}function near(a,b){check(Math.abs(a-b)<1e-9,a+" ~= "+b)}
function throws(fn,m){checks++;assert.throws(fn,m)}
function req(method,body,user,url="http://local/api/client-orders"){return new NextRequest(url,{method,headers:{cookie:"dmd_session="+createSession(user.id).token,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined})}
async function main(){
 const result=seed();check(result.orders===44,"seed 36 valid and 8 invalid");
 const clients=db.prepare("SELECT * FROM users WHERE username LIKE 'epacket.client.%' ORDER BY username").all(),admin=db.prepare("SELECT * FROM users WHERE role='ADMIN'").get(),sales=db.prepare("SELECT * FROM users WHERE role='SALES'").get();
 const route=db.prepare("SELECT * FROM service_route_configs WHERE sub_service='Standard' AND supplier='DMD'").get();
 for(const alias of ["US","U.S","u.s.","USA","United States","United States of America"," united-states "])check(p.normalizeCountry(alias)==="US","normalize "+alias);
 const input={service:"ePacket",sub_service:"Standard",supplier:"DMD",country:"US",carton_count:1,weight:.041,length:10,width:5,height:3};
 for(const [weight,tier] of [[.041,.05],[.05,.05],[.0500000001,.1],[.051,.1],[1.01,1.1],[2.01,2.2],[10,10]])check(p.quote({...input,weight},p.STANDARD).tier===tier,"tier "+weight);
 near(p.quote(input,p.STANDARD).net,5.01);near(p.quote(input,p.ECO).net,4.84);
 const volume=p.quote({...input,length:50,width:20,height:10},p.STANDARD);near(volume.volumetric_weight,2);near(volume.chargeable_weight,2);
 for(const bad of [{weight:10.00001},{carton_count:2},{country:"CA"},{length:80,width:50,height:20}])check(!p.quote({...input,...bad},p.STANDARD).eligible,"invalid quote");
 for(const [i,target] of [1.05,1.10,1.15].entries()){const discount=(1-target/1.16)*100,q=p.quote(input,p.STANDARD,6,16,discount);near(q.sale_price,q.net*target);check(q.guidance.floor===97&&q.guidance.base===100&&q.guidance.retail===110,"safe guidance");check(clients[i].sales_user_id===sales.id,"seed ownership");check(db.prepare("SELECT COUNT(*) n FROM client_service_settings WHERE client_user_id=? AND sub_service IN ('Standard','Eco')").get(clients[i].id).n===2,"two route discounts")}
 const equal=p.quote(input,p.STANDARD,6,16,(1-1.06/1.16)*100),below=p.quote(input,p.STANDARD,6,16,(1-1.05/1.16)*100),above=p.quote(input,p.STANDARD,6,16,(1-1.10/1.16)*100);
 near(equal.commission,.001*equal.sale_price);near(below.commission,.001*below.sale_price);near(above.commission,.001*above.sale_price+.12*(above.sale_price-above.base));
 for(const [length,amount] of [[55,0],[55.001,5],[75,5],[75.001,10.5]])near(p.quote({...input,length},p.STANDARD).surcharge,amount);
 const stacked=p.quote({...input,length:80,state:"HI"},p.STANDARD);near(stacked.surcharge,25.5);near(stacked.commission,p.quote({...input,length:80},p.STANDARD).commission);near(stacked.gross_profit_base,p.quote({...input,length:80},p.STANDARD).gross_profit_base);
 for(const area of [{state:"AK"},{state:"Hawaii"},{state:"PR"},{state:"Guam"},{state:"VI"},{state:"AS"},{state:"MP"},{state:"AA"},{city:"APO"},{city:"FPO"},{city:"DPO"},{zip:"09012"},{zip:"09801"},{zip:"34002"},{zip:"96201"},{zip:"96699"}])check(p.remoteArea(area),"remote "+JSON.stringify(area));
 check(!p.remoteArea({state:"CA",zip:"90012"}),"no invented continental remote");check(p.remoteArea({zip:"90012"},["90012"]),"configured ZIP");
 throws(()=>p.validateTiers([{weight:.1,net:1},{weight:.1,net:2},{weight:10,net:3}]));
 throws(()=>p.validateTiers([{weight:10,net:-1}]));throws(()=>p.validateRules({...p.DEFAULT_SURCHARGES,remote_zips:["900"]}));
 const invalid=db.prepare("SELECT * FROM orders WHERE order_id LIKE 'EPK-INVALID-%'").all();for(const o of invalid){check(!JSON.parse(o.pricing_eligibility_json).eligible,"invalid draft saved");throws(()=>r.purchaseService(o.id,{id:o.client_user_id,role:"CLIENT"}));check(!db.prepare("SELECT id FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=?").get(String(o.id)),"invalid draft not charged")}
 const client=clients[1];let response=await api.GET(req("GET",null,client));let body=await response.json();check(body.routes.length===2,"client offered two routes");check(!JSON.stringify(body).includes("supplier"),"client no supplier/template");
 const manual={...input,order_id:"CLIENT-MANUAL",recipient_name:"Anna Nguyen",address1:"100 Market St",city:"Los Angeles",state:"CA",zip:"90012",phone:"2025550100",item:"T-shirt",material:"Cotton"};
 async function post(action,rows,extra={}){return api.POST(req("POST",{action,route_id:route.id,rows,...extra},client))}
 response=await post("preview",[manual]);body=await response.json();check(response.status===200&&body.rows[0].pricing.eligible,"manual preview");check(body.rows[0].input.country==="US","preview normalization");check(!JSON.stringify(body).includes('"net"')&&!JSON.stringify(body).includes('"base"'),"preview doesn't disclose internals");
 response=await post("save",[manual]);body=await response.json();check(response.status===201,"client save");const id=body.orders[0].id;
 check(!db.prepare("SELECT id FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=?").get(String(id)),"no draft charge");
 const purchased=r.purchaseService(id,{id:client.id,role:"CLIENT"}),snapshot=purchased.pricing_snapshot_json,charged=purchased.total_due;
 check(purchased.service_purchased_at&&purchased.workflow_status==="PENDING_PURCHASE","client purchase queue");
 r.purchaseService(id,{id:client.id,role:"CLIENT"});check(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=?").get(String(id)).n===0,"reserve does not charge before completion");
 check(db.prepare("SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=? AND status='RESERVED'").get(id).n===1,"idempotent reserve");
 throws(()=>upsertOrder({...manual,id,weight:2,client_user_id:client.id}));
 throws(()=>r.purchaseService(id,{id:clients[0].id,role:"CLIENT"}));
 const draft=db.prepare("SELECT * FROM orders WHERE order_id NOT LIKE '%INVALID%' AND service_purchased_at IS NULL LIMIT 1").get(),before=r.refreshDraft(draft.id).sales_price;
 const newVersion=r.createPriceVersion(route.id,p.STANDARD.map(t=>({...t,net:t.net*2})),admin.id);
 r.activatePricing(route.id,{price_version_id:newVersion.id,base_markup:7,retail_markup:18},admin.id);
 check(r.refreshDraft(id).pricing_snapshot_json===snapshot&&r.refreshDraft(id).total_due===charged,"purchased immutability");check(r.refreshDraft(draft.id).sales_price!==before,"draft recalc active");
 throws(()=>db.prepare("UPDATE route_price_versions SET tiers_json='[]' WHERE id=?").run(newVersion.id));
 throws(()=>db.prepare("UPDATE orders SET pricing_snapshot_json='{}' WHERE id=?").run(id));
 const active=r.activePricing(route.id).price_version_id;
 r.activatePricing(route.id,{price_version_id:1,effective_at:"2099-01-01T00:00:00Z"},admin.id);check(r.activePricing(route.id).price_version_id===active,"future activation not premature");
 response=await ordersApi.GET(req("GET",null,sales,"http://local/api/orders"));body=await response.json();check(!JSON.stringify(body).includes("pricing_snapshot_json")&&!JSON.stringify(body).includes("commission_basis")&&!JSON.stringify(body).includes('"net"'),"sales-safe order list");
 response=await detailApi.GET(req("GET",null,client),{params:Promise.resolve({id:String(id)})});body=await response.json();check(body.pricing.service_price>0&&!body.pricing_snapshot_json&&!body.base_cost,"client-safe detail");
 response=await configApi.GET(req("GET",null,sales,"http://local/api/route-pricing?route_id="+route.id));check(response.status===403,"Sales config forbidden");
 const csv="order_id,weight,length,width,height,carton_count,recipient_name,address1,city,state,zip,country,phone,item,material\r\nCSV-1,0.051,10,5,3,1,Emma,\"100 Main St, Apt 2\",Houston,TX,77002,USA,2025550100,Bag,Cotton\r\nCSV-2,11,10,5,3,1,James,42 Broadway,New York,NY,10001,US,2025550101,Bag,Cotton";
 const csvRows=await parseClientFile(Buffer.from(csv),"test.csv");check(csvRows.length===2&&csvRows[0].address1.includes(","),"CSV quoted fields");
 response=await post("preview",csvRows);body=await response.json();check(body.rows[0].pricing.eligible&&!body.rows[1].pricing.eligible,"import per-row eligibility");
 response=await post("save",csvRows);body=await response.json();check(response.status===201&&body.orders.length===2,"import invalid draft retained");
 response=await post("purchase",[],{order_ids:body.orders.map(o=>o.id)});check(response.status===400,"atomic import purchase rejects invalid");
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Orders");sheet.addRow(Object.keys(manual));sheet.addRow(Object.values(manual));const xrows=await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()),"orders.xlsx");check(xrows[0].order_id==="CLIENT-MANUAL","XLSX import reader");
 throws(()=>r.activatePricing(route.id,{price_version_id:newVersion.id,base_markup:30,retail_markup:16},admin.id));
 const frozenQuote=r.orderQuote(r.refreshDraft(id));
 near(frozenQuote.sale_price,JSON.parse(snapshot).sale_price);
 check(frozenQuote.pricing_version_id===JSON.parse(snapshot).pricing_version_id,"Ops quote uses purchased version after activation");
 response=await post("save",[{...manual,order_id:"INVALID-MISSING-ADDRESS",address1:""}]);body=await response.json();
 check(response.status===422&&!JSON.stringify(body).includes('"supplier"')&&!JSON.stringify(body).includes('"client_user_id"'),"validation error uses client-safe fields");
 const noBalance=clients[2];db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount) VALUES (?,'ADJUSTMENT_DEBIT','DEBIT',100000)").run(noBalance.id);const balanceDraft=db.prepare("SELECT * FROM orders WHERE client_user_id=? AND service_purchased_at IS NULL AND order_id NOT LIKE '%INVALID%' LIMIT 1").get(noBalance.id);throws(()=>r.purchaseService(balanceDraft.id,{id:noBalance.id,role:"CLIENT"}),/Balance/);

 const legacyId=Number(db.prepare("INSERT INTO orders(order_id,service,sub_service,supplier,workflow_status,sales_price,total_due,weight,carton_count,country) VALUES ('LEGACY-PAID','ePacket','Standard','DMD','PURCHASED',12.34,12.34,1,1,'US')").run().lastInsertRowid);
 check(r.refreshDraft(legacyId).sales_price===12.34&&r.safePricing(r.refreshDraft(legacyId),"CLIENT")===null,"legacy purchased order not repriced");
 response=await post("save",[{...manual,order_id:"API-PURCHASE"}]);body=await response.json();const apiId=body.orders[0].id;
 response=await post("purchase",[],{order_ids:[apiId]});check(response.status===200,"Client purchase API");
 response=await post("purchase",[],{order_ids:[apiId]});check(response.status===200,"Client API retry idempotent");
 check(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=?").get(String(apiId)).n===0,"API purchase reserves before completion");
 const invalidDraft=invalid[0];
 response=await post("save",[{...manual,id:invalidDraft.id,order_id:invalidDraft.order_id,weight:.5}]);check(response.status===400,"Client cannot edit another Client draft");
 response=await post("save",[{...manual,id:apiId,order_id:"EDIT-PAID"}]);check(response.status===400,"paid Client draft edit forbidden");
 const upload=new FormData();upload.set("route_id",String(route.id));upload.set("file",new File([csv],"upload.csv"));
 response=await api.POST(new NextRequest("http://local/api/client-orders",{method:"POST",headers:{cookie:"dmd_session="+createSession(client.id).token},body:upload}));body=await response.json();check(response.status===200&&body.rows.length===2,"multipart CSV preview endpoint");
 const pending=db.prepare("SELECT * FROM orders WHERE client_user_id=? AND service_purchased_at IS NULL AND order_id NOT LIKE '%INVALID%' LIMIT 1").get(client.id);
 db.prepare("UPDATE service_route_configs SET client_self_purchase=0 WHERE id=?").run(route.id);
 throws(()=>r.purchaseService(pending.id,{id:client.id,role:"CLIENT"}),/Route/);
 db.prepare("UPDATE service_route_configs SET client_self_purchase=1,warehouse_hold=1 WHERE id=?").run(route.id);
 throws(()=>r.purchaseService(pending.id,{id:client.id,role:"CLIENT"}),/Hold/);
 db.prepare("UPDATE service_route_configs SET warehouse_hold=0 WHERE id=?").run(route.id);
 check(r.pricingAdmin(route.id).activations.every(a=>a.actor_user_id===admin.id),"version audit actor");

 response=await post("save",[{...manual,order_id:"HOLD-DRAFT"}]);body=await response.json();const holdId=body.orders[0].id;
 db.prepare("UPDATE orders SET workflow_status='HOLD' WHERE id=?").run(holdId);
 response=await post("preview",[{...manual,id:holdId,order_id:"HOLD-DRAFT"}]);body=await response.json();check(!body.rows[0].pricing.eligible&&body.rows[0].pricing.reasons.some(r=>r.includes("Hold")),"held draft preview");
 response=await post("save",[{...manual,id:holdId,order_id:"HOLD-DRAFT"}]);check(response.status===201&&db.prepare("SELECT workflow_status FROM orders WHERE id=?").get(holdId).workflow_status==="HOLD","Client save preserves Hold");
 throws(()=>r.purchaseService(holdId,{id:client.id,role:"CLIENT"}),/Hold/);
 throws(()=>require("../src/lib/purchase-templates.ts").genericPurchaseRows([invalid[0].id]),/điều kiện/);
 throws(()=>require("../src/lib/order-operations.ts").addOrderTracking({orderId:invalid[0].id,tracking:"INVALID-LABEL"}),/điều kiện/);
 db.prepare("UPDATE orders SET workflow_status='CANCELLED' WHERE id=?").run(apiId);
 throws(()=>r.purchaseService(apiId,{id:client.id,role:"CLIENT"}),/huỷ/);
 const missing=p.quote({...input,weight:0},p.STANDARD);check(missing.tier===null&&missing.sale_price===0,"no price before measurement data");
 response=await configApi.POST(req("POST",{route_id:route.id,action:"self-purchase",enabled:false},admin));
 check(response.status===200&&db.prepare("SELECT action,actor_user_id FROM route_pricing_audit WHERE route_id=? ORDER BY id DESC LIMIT 1").get(route.id).actor_user_id===admin.id,"toggle audit");
 db.prepare("UPDATE service_route_configs SET client_self_purchase=1 WHERE id=?").run(route.id);
 check(db.prepare("PRAGMA foreign_key_check").all().length===0,"seed FK integrity");
 console.log("EPACKET PASS ("+checks+" assertions)");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{db.close();delete globalThis.dmdDb;fs.rmSync(tmp,{recursive:true,force:true})});
