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
const order=(clientId,key)=>Number(db.prepare("INSERT INTO orders(workflow_status,client_user_id,order_id,system_order_code,service,sub_service,supplier,total_due,chargeable_weight,dimensional_divisor) VALUES ('PURCHASED',?,?,?,'ePacket','Standard','DMD',10,.05,5000)").run(clientId,key,'DMD-'+key).lastInsertRowid);
const a=order(client.id,'A'),b=order(client.id,'B'),x=order(other.id,'X');
const hold=cases.caseAction(sales,{action:'create',kind:'HOLD',visibility:'INTERNAL',order_ids:[a,b],summary:'Packaging',due_date:credit.shiftDay(credit.localDay(),-1)});
assert(cases.hasCaseHold(a)&&cases.hasCaseHold(b),'Bulk hold');assert(cases.casesFor(client).length===0,'Internal case hidden');rejects(()=>cases.caseAction(sales,{action:'update',case_id:hold.id,status:'RESOLVED'}),'Only admin releases hold');cases.caseAction(admin,{action:'update',case_id:hold.id,status:'RESOLVED'});assert(!cases.hasCaseHold(a),'Hold released independently of lifecycle');
rejects(()=>cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[x],summary:'Other'}),'Cross-client claim blocked');
const original=credit.accountFinancials(client.id).balance_cents;
const claim=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[a,b],summary:'Delayed',due_date:credit.shiftDay(credit.localDay(),-1)});
assert(credit.accountFinancials(client.id).balance_cents===original,'Claim opening does not release funds');rejects(()=>claims.claimAction(sales,{action:'finalize',case_id:claim.id,refund_amount:1,reason:'x'}),'Sales cannot refund');
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',10,'ORDER',?)").run(client.id,String(a));
claims.claimAction(admin,{action:'finalize',case_id:claim.id,refund_amount:5,refund_allocations:[{order_id:a,amount:5},{order_id:b,amount:0}],compensation_amount:2,reason:'Approved'});assert(credit.accountFinancials(client.id).balance_cents===-300,'Separate refund compensation credited once');claims.claimAction(admin,{action:'finalize',case_id:claim.id,refund_amount:5,compensation_amount:2,reason:'Retry'});assert(credit.accountFinancials(client.id).balance_cents===-300,'Claim finalize idempotent');
const keyedClaim={action:'finalize',case_id:claim.id,refund_amount:5,compensation_amount:2,reason:'Retry',request_key:'claim-retry'};assert(JSON.stringify(claims.claimAction(admin,keyedClaim))===JSON.stringify(claims.claimAction(admin,keyedClaim)),'Claim original result receipt');
// Allocation regressions run in a rolled-back transaction to preserve other fixtures.
const refunds=require(path.join(root,'src/lib/order-refunds.ts'));
const rollback=Error('allocation test rollback');
try{db.transaction(()=>{
 assert(refunds.orderRefundedCents(a)===500&&refunds.orderRefundedCents(b)===0,'Refund allocated only to selected Order');
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',10,'ORDER',?)").run(client.id,String(b));
 const next=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[a,b],summary:'Allocation test'});
 const payload={action:'finalize',case_id:next.id,refund_amount:6,reason:'Allocation test'};
 rejects(()=>claims.claimAction(admin,payload),'Multi-order refund requires explicit allocations');
 rejects(()=>claims.claimAction(admin,{...payload,refund_allocations:[{order_id:a,amount:6},{order_id:b,amount:0}]}),'Per-order remaining limit enforced');
 rejects(()=>claims.claimAction(admin,{...payload,refund_allocations:[{order_id:b,amount:3},{order_id:b,amount:3}]}),'Duplicate allocation rejected');
 rejects(()=>claims.claimAction(admin,{...payload,refund_allocations:[{order_id:a,amount:0},{order_id:b,amount:5}]}),'Allocation total mismatch rejected');
 claims.claimAction(admin,{...payload,refund_allocations:[{order_id:a,amount:0},{order_id:b,amount:6}]});
 assert(refunds.orderRefundedCents(a)===500&&refunds.orderRefundedCents(b)===600,'Overlapping claims preserve remaining amount per Order');
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'REFUND','CREDIT',1,'ORDER_CANCELLATION',?)").run(client.id,String(b));
 assert(refunds.orderRefundedCents(b)===700,'Cancellation refund shares remaining limit');
 db.prepare('DELETE FROM claim_refund_allocations WHERE case_id=?').run(next.id);
 assert(refunds.orderRefundedCents(a)===1100,'Legacy unallocated claim remains conservative');
 throw rollback;
 }).immediate()}catch(e){if(e!==rollback)throw e}
const recovery=claims.claimAction(admin,{action:'create_recovery',case_id:claim.id,supplier:'DMD',expected_amount:6});claims.claimAction(admin,{action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:4,reference:'BANK-1'});claims.claimAction(admin,{action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:4,reference:'BANK-1'});const keyedReceipt={action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:4,reference:'BANK-1',request_key:'receipt-retry'};assert(JSON.stringify(claims.claimAction(admin,keyedReceipt))===JSON.stringify(claims.claimAction(admin,keyedReceipt)),'Receipt exact retry');assert(claims.recoveriesFor(admin)[0].receipts[0].created_at&&claims.recoveriesFor(admin)[0].receipts[0].occurred_at,'Supplier receipt has separate economic and recording times');assert(claims.recoveriesFor(admin)[0].recovered_cents===400,'Recovery receipt idempotent');assert(credit.accountFinancials(client.id).balance_cents===-300,'Supplier receipt does not credit client');rejects(()=>claims.recoveriesFor(sales),'Supplier recovery private');assert(!JSON.stringify(cases.casesFor(sales)).includes('SUPPLIER_RECOVERY_RECEIVED'),'Supplier financial audit private');
const parcel=inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-A'});assert(parcel.status==='RECEIVED','DMD scan identified');assert(inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-A'}).id===parcel.id,'Repeated inbound scan idempotent');
const unknown=inbound.inboundAction(warehouse,{action:'scan',scan_key:'unknown'});assert(unknown.status==='UNIDENTIFIED','Unknown inventory retained');inbound.inboundAction(sales,{action:'match',parcel_id:unknown.id,order_id:b});assert(inbound.inboundFor(sales).parcels.length===2,'Sales sees assigned client inbound');rejects(()=>inbound.inboundFor(client),'Client cannot inspect internal warehouse');
const legacyCarton=Number(db.prepare("INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height,chargeable_weight) VALUES (?,1,.05,10,5,3,.05)").run(b).lastInsertRowid);
const measured=inbound.inboundAction(warehouse,{action:'measure',parcel_id:unknown.id,carton_id:legacyCarton,weight:.1,length:10,width:5,height:3});
assert(cases.casesFor(sales).some(c=>c.next_action==='Sales/Admin nhập phụ thu từ bảng giá route'),'Manual pricing enters actionable queue');
const manual=inbound.inboundAction(sales,{action:'quote_adjustment',parcel_id:unknown.id,measurement_id:measured.measurement_id,amount:1.5});
const manualBefore=credit.accountFinancials(client.id).balance_cents;inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:unknown.id,adjustment_id:manual.id});assert(credit.accountFinancials(client.id).balance_cents===manualBefore-150,'Manual route surcharge approved after notice');
const carton=Number(db.prepare("INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height,chargeable_weight) VALUES (?,1,.05,10,5,3,.05)").run(a).lastInsertRowid);
const pricing=require(path.join(root,'src/lib/route-pricing.ts')),p=require(path.join(root,'src/lib/epacket-pricing.ts'));
const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Standard','DMD')").run().lastInsertRowid),version=pricing.createPriceVersion(route,p.STANDARD.map(t=>({...t,base_rate:t.net*1.06})),admin.id);pricing.activatePricing(route,{price_version_id:version.id,retail_markup:(1.16/1.06-1)*100},admin.id);const active=pricing.activePricing(route),frozen=p.quote({country:'US',carton_count:1,weight:.05,length:10,width:5,height:3},p.STANDARD);
db.prepare("UPDATE orders SET country='US',pricing_snapshot_json=?,pricing_version_id=?,pricing_config_version_id=? WHERE id=?").run(JSON.stringify(frozen),version.id,active.config_version_id,a);
const before=credit.accountFinancials(client.id).balance_cents;
const measurementPayload={action:'measure',parcel_id:parcel.id,carton_id:carton,weight:.1,length:10,width:5,height:3,request_key:'auto-weight-1'};
const automatic=inbound.inboundAction(warehouse,measurementPayload);const adjustment=inbound.inboundFor(admin).adjustments[0];assert(adjustment.status==='CHARGED','Valid versioned ePacket weight surcharge automatically charged without approval');
assert(credit.accountFinancials(client.id).balance_cents===before-Number(adjustment.amount_cents),'Auto surcharge debits Balance once');
assert(JSON.stringify(inbound.inboundAction(warehouse,measurementPayload))===JSON.stringify(automatic),'Measurement exact retry returns original result');
const afterAuto=credit.accountFinancials(client.id).balance_cents;
for(const weight of [.1,.05])inbound.inboundAction(warehouse,{action:'measure',parcel_id:parcel.id,carton_id:carton,weight,length:10,width:5,height:3});
assert(credit.accountFinancials(client.id).balance_cents===afterAuto,'Same/lower remeasurement never double charges or refunds');
inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:parcel.id,adjustment_id:adjustment.id});assert(credit.accountFinancials(client.id).balance_cents===afterAuto,'Legacy approval cannot charge automatic adjustment again');
const snapshot=db.prepare('SELECT pricing_snapshot_json,sales_price FROM orders WHERE id=?').get(a);
const extraBefore=Number(db.prepare("SELECT SUM(amount_cents) n FROM weight_adjustments WHERE order_id=? AND status='CHARGED'").get(a).n);
inbound.inboundAction(warehouse,{action:'measure',parcel_id:parcel.id,carton_id:carton,weight:.15,length:10,width:5,height:3});
const total=Number(db.prepare("SELECT SUM(amount_cents) n FROM weight_adjustments WHERE order_id=? AND status='CHARGED'").get(a).n);
assert(total===credit.cents(p.quote({country:'US',carton_count:1,weight:.15,length:10,width:5,height:3},p.STANDARD).total_charge)-credit.cents(frozen.total_charge)&&total>extraBefore,'Higher remeasurement only charges remaining delta');
assert(JSON.stringify(db.prepare('SELECT pricing_snapshot_json,sales_price FROM orders WHERE id=?').get(a))===JSON.stringify(snapshot),'Warehouse preserves frozen sale price and snapshot');
const {orderChargedCents}=require('../src/lib/order-refunds.ts');assert(orderChargedCents(a)>=total,'Weight surcharge included in refundable charged amount');
const invalidBefore=credit.accountFinancials(client.id).balance_cents;
const invalidMeasurement=inbound.inboundAction(warehouse,{action:'measure',parcel_id:parcel.id,carton_id:carton,weight:11,length:10,width:5,height:3});
assert(invalidMeasurement.service_valid===false&&invalidMeasurement.hold_case_id,'Invalid service opens Hold for Admin');assert(db.prepare('SELECT id FROM inbound_measurements WHERE id=?').get(invalidMeasurement.measurement_id),'Invalid service preserves measurement evidence');
assert(cases.hasCaseHold(a),'Service invalid blocks outbound via existing Hold guard');assert(credit.accountFinancials(client.id).balance_cents===invalidBefore,'Invalid service never debits surcharge');
rejects(()=>cases.caseAction(sales,{action:'update',case_id:invalidMeasurement.hold_case_id,status:'RESOLVED'}),'Only Admin releases invalid-service Hold');
cases.caseAction(admin,{action:'update',case_id:invalidMeasurement.hold_case_id,status:'RESOLVED',next_action:'Fixture exception reviewed'});
const extraOrder=order(client.id,'WEIGHT-BOUNDARY');
db.prepare("UPDATE orders SET country='US',pricing_snapshot_json=?,pricing_version_id=?,pricing_config_version_id=? WHERE id=?").run(JSON.stringify(frozen),version.id,active.config_version_id,extraOrder);
const extraCarton=Number(db.prepare('INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height,chargeable_weight) VALUES (?,1,.05,10,5,3,.05)').run(extraOrder).lastInsertRowid);
const extraParcel=inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-WEIGHT-BOUNDARY'});
const extraMeasure={action:'measure',parcel_id:extraParcel.id,carton_id:extraCarton,weight:1,length:10,width:5,height:3};
inbound.inboundAction(warehouse,extraMeasure);
const beforeOversize=credit.accountFinancials(client.id).balance_cents;
inbound.inboundAction(warehouse,{...extraMeasure,length:60});assert(credit.accountFinancials(client.id).balance_cents===beforeOversize-500,'Same weight tier oversize length still automatically charges valid surcharge');
const beforeFailure={count:db.prepare('SELECT COUNT(*) n FROM inbound_measurements').get().n,ledger:db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n};
db.exec("CREATE TRIGGER test_weight_audit_failure BEFORE INSERT ON financial_audit WHEN NEW.event='AUTO_WEIGHT_ADJUSTMENT' BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
rejects(()=>inbound.inboundAction(warehouse,{...extraMeasure,weight:2,length:60,request_key:'audit-weight-fail'}),'Automatic debit fails if audit cannot be written');
assert(db.prepare('SELECT COUNT(*) n FROM inbound_measurements').get().n===beforeFailure.count&&db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n===beforeFailure.ledger,'Measurement/debit/note transaction rolls back together');db.exec('DROP TRIGGER test_weight_audit_failure');
const unavailableOrder=order(client.id,'WEIGHT-MISSING-CONFIG');
db.prepare("UPDATE orders SET country='US',pricing_snapshot_json=?,pricing_version_id=999999,pricing_config_version_id=? WHERE id=?").run(JSON.stringify(frozen),active.config_version_id,unavailableOrder);
const unavailableCarton=Number(db.prepare('INSERT INTO order_cartons(order_id,carton_number,weight,length,width,height) VALUES (?,1,.05,10,5,3)').run(unavailableOrder).lastInsertRowid);
const unavailableParcel=inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-WEIGHT-MISSING-CONFIG'});
const missingConfig=inbound.inboundAction(warehouse,{...extraMeasure,parcel_id:unavailableParcel.id,carton_id:unavailableCarton,weight:2,length:60});assert(missingConfig.pricing_available===false&&missingConfig.hold_case_id,'Missing frozen configuration holds without losing measurement');
assert(db.prepare('SELECT id FROM inbound_measurements WHERE id=?').get(missingConfig.measurement_id),'Missing pricing retains evidence');
const tower=controlTower(admin);assert(tower.net_claim_loss_cents===300,'Control Tower net claim loss');assert(controlTower(client).supplier_recovered_cents===undefined,'Control Tower hides supplier metrics');
const old=credit.shiftDay(credit.localDay(),-90),recent=credit.localDay();
const purchased=(id,first,price,gp)=>db.prepare("UPDATE orders SET service_purchased_at=?,purchase_completed_at=?,sales_price=?,gross_profit_net=? WHERE id=?").run(first,first,price,gp,id);
purchased(order(client.id,"COHORT-FIRST-A"),old,0,0);purchased(order(client.id,"COHORT-RECENT-A"),recent,100,30);purchased(order(other.id,"COHORT-FIRST-B"),old,0,0);purchased(order(other.id,"COHORT-RECENT-B"),recent,100,40);
const k=controlTower(admin).new_client_quality;assert(k.company_margin_percent===35,"Company margin uses same rolling revenue window");assert(k.cohorts.length===1&&k.cohorts[0].matured_clients===2,"Monthly first-purchase cohort matures after 60 days");assert(k.cohorts[0].revenue_share===0.5,"KPI measures revenue share not client count");

// Client Hold requests stay Claims and do not block warehouse until reviewed.
const request=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[a],summary:'Hold request',hold_requested:true,due_date:'2030-01-01'});
let requestRow=cases.casesFor(sales).find(c=>c.id===request.id);assert(requestRow.hold_requested===1&&requestRow.assigned_to===sales.id&&!cases.hasCaseHold(a),'Hold request prioritized and assigned without technical Hold');
assert(Date.parse(requestRow.first_response_due_at)-Date.parse(String(requestRow.created_at).replace(' ','T')+'Z')===48*3600000,'First response fixed 48h regardless Client date');
cases.caseAction(sales,{action:'comment',case_id:request.id,message:'Private investigation',visibility:'INTERNAL'});assert(!cases.casesFor(sales).find(c=>c.id===request.id).first_responded_at,'Private note does not satisfy response');
cases.caseAction(sales,{action:'comment',case_id:request.id,message:'Review underway',visibility:'PUBLIC'});cases.caseAction(sales,{action:'update',case_id:request.id,next_action:'Check supplier',next_action_due_at:credit.shiftDay(credit.localDay(),-1)});requestRow=cases.casesFor(sales).find(c=>c.id===request.id);assert(requestRow.first_response_sla_status==='DONE'&&requestRow.next_action_sla_status==='OVERDUE','Public response and follow-up independent');
rejects(()=>cases.caseAction(client,{action:'create',kind:'HOLD',visibility:'PUBLIC',order_ids:[a],summary:'Direct hold'}),'Client cannot create actual Hold');
const claimHistory=db.prepare("SELECT summary FROM order_events WHERE order_id=? AND event_type='REFUND'").all(a);assert(claimHistory.every(e=>!e.summary.includes('hoàn cước tổng')&&e.summary.includes('Claim #')),'Multi-order timeline references Claim without total payout duplication');
const overlap=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[a],summary:'Overlap'});rejects(()=>claims.claimAction(admin,{action:'finalize',case_id:overlap.id,refund_amount:orderChargedCents(a)/100+1,reason:'Over remaining'}),'Overlapping Claim refund bounded by remaining charge');
assert(credit.accountFinancials(client.id).purchase_blocked,'Mandatory weight debit and balance limit block future buying');
const huge=claims.claimAction(admin,{action:'finalize',case_id:overlap.id,compensation_amount:1000,reason:'Approved exceptional compensation'});assert(huge.warnings.length===1,'Compensation above declared value warns without blocking');
rejects(()=>claims.claimAction(admin,{action:'receive_recovery',case_id:claim.id,recovery_id:recovery.id,amount:3,reference:'EXCESS'}),'Supplier over-recovery requires decision');
const invalid=order(client.id,'TERMINAL');db.prepare("UPDATE orders SET workflow_status='CANCELLED' WHERE id=?").run(invalid);const orphan=inbound.inboundAction(warehouse,{action:'scan',scan_key:'Orphan'});rejects(()=>inbound.inboundAction(sales,{action:'match',parcel_id:orphan.id,order_id:invalid}),'Unidentified cannot match cancelled');rejects(()=>inbound.inboundAction(warehouse,{action:'scan',scan_key:'DMD-TERMINAL'}),'Cancelled scan blocked');


cases.caseAction(sales,{action:'review_hold',case_id:request.id,decision:'NO_HOLD',reason:'Warehouse can continue'});assert(!cases.casesFor(sales).find(c=>c.id===request.id).hold_requested&&!cases.hasCaseHold(a),'Reviewed request no longer stays urgent forever');
const holdRequest=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[b],summary:'Review Hold',hold_requested:true});const reviewed=cases.caseAction(sales,{action:'review_hold',case_id:holdRequest.id,decision:'PLACE_HOLD',reason:'Inspect packaging'});assert(cases.hasCaseHold(b)&&reviewed.hold_case_id,'Sales review creates audited internal Hold');cases.caseAction(sales,{action:'review_hold',case_id:holdRequest.id,decision:'PLACE_HOLD',reason:'Retry'});assert(db.prepare("SELECT COUNT(*) n FROM operation_cases c JOIN operation_case_orders co ON co.case_id=c.id WHERE co.order_id=? AND c.kind='HOLD' AND c.status='OPEN'").get(b).n===1,'Hold review retry does not create duplicate Holds');
const projection=require('../src/lib/order-timeline.ts');assert(projection.orderTimeline(a,'CLIENT').some(e=>e.event_type==='WAREHOUSE_RECEIVED'),'Client timeline includes safe warehouse receipt');assert(!projection.orderTimeline(a,'CLIENT').some(e=>e.event_type==='WAREHOUSE_MEASURED'),'Internal measurement stays out of Client timeline');assert(projection.orderTimeline(a,'SALES').some(e=>e.event_type==='WAREHOUSE_MEASURED'),'Sales timeline includes warehouse measurement');

console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
