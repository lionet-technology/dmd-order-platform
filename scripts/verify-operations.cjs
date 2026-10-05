const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-purchase-engine-"+process.pid+".db");
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

const {db}=require(path.join(root,"src/lib/db.ts")),{createUser}=require(path.join(root,"src/lib/auth.ts"));
const credit=require(path.join(root,"src/lib/credit.ts")),cases=require(path.join(root,"src/lib/cases.ts")),inbound=require(path.join(root,"src/lib/inbound.ts")),claims=require(path.join(root,"src/lib/claims.ts")),{controlTower}=require(path.join(root,"src/lib/control-tower.ts"));
let checks=0;const assert=(v,m)=>{checks++;if(!v)throw Error(m)},rejects=(f,m)=>{let ok=false;try{f()}catch{ok=true}assert(ok,m)};
const user=(username,role,sales_user_id)=>createUser({username,role,sales_user_id,display_name:username,password:"TestPass123!"});
const admin=user("ops.admin","ADMIN"),sales=user("ops.sales","SALES"),client=user("ops.client","CLIENT",sales.id),other=user("ops.other","CLIENT",sales.id),warehouse=user("ops.warehouse","WAREHOUSE");
const order=(clientId,key)=>Number(db.prepare("INSERT INTO orders(client_user_id,order_id,system_order_code,service,sub_service,supplier,total_due,chargeable_weight,dimensional_divisor) VALUES (?,?,?,'ePacket','Standard','DMD',10,.05,5000)").run(clientId,key,'DMD-'+key).lastInsertRowid);
const a=order(client.id,'A'),b=order(client.id,'B'),x=order(other.id,'X');
const hold=cases.caseAction(sales,{action:'create',kind:'HOLD',visibility:'INTERNAL',order_ids:[a,b],summary:'Packaging',due_date:credit.shiftDay(credit.localDay(),-1)});
assert(cases.hasCaseHold(a)&&cases.hasCaseHold(b),'Bulk hold');assert(cases.casesFor(client).length===0,'Internal case hidden');rejects(()=>cases.caseAction(sales,{action:'update',case_id:hold.id,status:'RESOLVED'}),'Only admin releases hold');cases.caseAction(admin,{action:'update',case_id:hold.id,status:'RESOLVED'});assert(!cases.hasCaseHold(a),'Hold released independently of lifecycle');
rejects(()=>cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[x],summary:'Other'}),'Cross-client claim blocked');
const original=credit.accountFinancials(client.id).balance_cents;
const claim=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[a,b],summary:'Delayed',due_date:credit.shiftDay(credit.localDay(),-1)});
assert(credit.accountFinancials(client.id).balance_cents===original,'Claim opening does not release funds');rejects(()=>claims.claimAction(sales,{action:'finalize',case_id:claim.id,refund_amount:1,reason:'x'}),'Sales cannot refund');
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',10,'ORDER',?)").run(client.id,String(a));
claims.claimAction(admin,{action:'finalize',case_id:claim.id,refund_amount:5,compensation_amount:2,reason:'Approved'});assert(credit.accountFinancials(client.id).balance_cents===-300,'Separate refund compensation credited once');claims.claimAction(admin,{action:'finalize',case_id:claim.id,refund_amount:5,compensation_amount:2,reason:'Retry'});assert(credit.accountFinancials(client.id).balance_cents===-300,'Claim finalize idempotent');
const recovery=claims.claimAction(admin,{action:'create_recovery',case_id:claim.id,supplier:'DMD',expected_amount:6});claims.claimAction(admin,{action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:4,reference:'BANK-1'});claims.claimAction(admin,{action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:4,reference:'BANK-1'});assert(claims.recoveriesFor(admin)[0].recovered_cents===400,'Recovery receipt idempotent');assert(credit.accountFinancials(client.id).balance_cents===-300,'Supplier receipt does not credit client');rejects(()=>claims.recoveriesFor(sales),'Supplier recovery private');assert(!JSON.stringify(cases.casesFor(sales)).includes('SUPPLIER_RECOVERY_RECEIVED'),'Supplier financial audit private');
const parcel=inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-A'});assert(parcel.status==='RECEIVED','DMD scan identified');assert(inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-A'}).id===parcel.id,'Repeated inbound scan idempotent');
const unknown=inbound.inboundAction(warehouse,{action:'scan',scan_key:'unknown'});assert(unknown.status==='UNIDENTIFIED','Unknown inventory retained');inbound.inboundAction(sales,{action:'match',parcel_id:unknown.id,order_id:b});assert(inbound.inboundFor(sales).parcels.length===2,'Sales sees assigned client inbound');rejects(()=>inbound.inboundFor(client),'Client cannot inspect internal warehouse');
const legacyCarton=Number(db.prepare("INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height,chargeable_weight) VALUES (?,1,.05,10,5,3,.05)").run(b).lastInsertRowid);
const measured=inbound.inboundAction(warehouse,{action:'measure',parcel_id:unknown.id,carton_id:legacyCarton,weight:.1,length:10,width:5,height:3});
assert(cases.casesFor(sales).some(c=>c.next_action==='Sales/Admin nhập phụ thu từ bảng giá route'),'Manual pricing enters actionable queue');
const manual=inbound.inboundAction(sales,{action:'quote_adjustment',parcel_id:unknown.id,measurement_id:measured.measurement_id,amount:1.5});
const manualBefore=credit.accountFinancials(client.id).balance_cents;inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:unknown.id,adjustment_id:manual.id});assert(credit.accountFinancials(client.id).balance_cents===manualBefore-150,'Manual route surcharge approved after notice');
const carton=Number(db.prepare("INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height,chargeable_weight) VALUES (?,1,.05,10,5,3,.05)").run(a).lastInsertRowid);
const pricing=require(path.join(root,'src/lib/route-pricing.ts')),p=require(path.join(root,'src/lib/epacket-pricing.ts'));
const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Standard','DMD')").run().lastInsertRowid),version=pricing.createPriceVersion(route,p.STANDARD,admin.id);pricing.activatePricing(route,{price_version_id:version.id},admin.id);const active=pricing.activePricing(route),frozen=p.quote({country:'US',carton_count:1,weight:.05,length:10,width:5,height:3},p.STANDARD);
db.prepare("UPDATE orders SET country='US',pricing_snapshot_json=?,pricing_version_id=?,pricing_config_version_id=? WHERE id=?").run(JSON.stringify(frozen),version.id,active.config_version_id,a);
inbound.inboundAction(warehouse,{action:'measure',parcel_id:parcel.id,carton_id:carton,weight:.1,length:10,width:5,height:3});const adjustment=inbound.inboundFor(admin).adjustments[0];assert(adjustment.status==='PENDING_APPROVAL','Higher tier pending approval');const before=credit.accountFinancials(client.id).balance_cents;inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:parcel.id,adjustment_id:adjustment.id});inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:parcel.id,adjustment_id:adjustment.id});assert(credit.accountFinancials(client.id).balance_cents===before-Number(adjustment.amount_cents),'Adjustment charged exactly once after notice');
const tower=controlTower(admin);assert(tower.net_claim_loss_cents===300,'Control Tower net claim loss');assert(controlTower(client).supplier_recovered_cents===undefined,'Control Tower hides supplier metrics');
const old=credit.shiftDay(credit.localDay(),-90),recent=credit.localDay();
const purchased=(id,first,price,gp)=>db.prepare("UPDATE orders SET service_purchased_at=?,purchase_completed_at=?,sales_price=?,gross_profit_net=? WHERE id=?").run(first,first,price,gp,id);
purchased(order(client.id,"COHORT-FIRST-A"),old,0,0);purchased(order(client.id,"COHORT-RECENT-A"),recent,100,30);purchased(order(other.id,"COHORT-FIRST-B"),old,0,0);purchased(order(other.id,"COHORT-RECENT-B"),recent,100,40);
const k=controlTower(admin).new_client_quality;assert(k.company_margin_percent===35,"Company margin uses same rolling revenue window");assert(k.cohorts.length===1&&k.cohorts[0].matured_clients===2,"Monthly first-purchase cohort matures after 60 days");assert(k.cohorts[0].revenue_share===0.5,"KPI measures revenue share not client count");
console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
