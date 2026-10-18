const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,".."),work=path.join(root,".smoke","cancellation-"+Date.now());
fs.mkdirSync(work,{recursive:true});process.env.DMD_DB_PATH=path.join(work,"test.db");process.env.NODE_ENV="production";
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith("@/")){const file=path.join(root,"src",request.slice(2));for(const p of [file,file+".ts",file+".tsx"])if(fs.existsSync(p))return p}return resolve.call(this,request,parent,isMain,options)};
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
let {db}=require("../src/lib/db.ts");
const {createUser}=require("../src/lib/auth.ts");
const {saveCancellationRules,parseCancellationRules}=require("../src/lib/cancellation-config.ts");
const {cancelOrder,cancellationPolicy}=require("../src/lib/order-cancellation.ts");
const {addOrderTracking,updateOrderTracking,replaceOrderTracking,recomputeOrderFinancials}=require("../src/lib/order-operations.ts");
const {upsertOrder,addLedgerEntry}=require("../src/lib/finance.ts");
const admin=createUser({username:"cancel.admin",display_name:"Cancel Admin",password:"TestPass123!",role:"ADMIN"});
const sales=createUser({username:"cancel.sales",display_name:"Cancel Sales",password:"TestPass123!",role:"SALES"});
const client=createUser({username:"cancel.client",display_name:"Cancel Client",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id});
  db.prepare("UPDATE users SET credit_limit_cents=1000000,credit_term_days=365 WHERE id=?").run(client.id); // Explicit purchasing room for legacy fixtures.
const routeId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','T11','DMD')").run().lastInsertRowid);
const rules={PRE_PURCHASE:{allowed:true,refund_percent:100},PURCHASED:{allowed:true,refund_percent:95},ISSUED:{allowed:true,refund_percent:90}};
saveCancellationRules(routeId,rules,"Supplier test policy",admin.id);
const stranger=createUser({username:"cancel.other",display_name:"Other Client",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id});
const otherSales=createUser({username:"cancel.sales2",display_name:"Other Sales",password:"TestPass123!",role:"SALES"});
let checks=0,seq=0;function check(value,label){checks++;if(!value)throw new Error(label)}
function rejects(fn,label){let rejected=false;try{fn()}catch{rejected=true}check(rejected,label)}
function order({price=100,charged=true,service="ePacket",label=null,tracking=null}={}){
 const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,customer,service,sub_service,supplier,sales_price,total_due,carton_count,weight,workflow_status,label,tracking) VALUES (?,?,?,?,?,'T11','DMD',?,?,1,1,'PENDING_PURCHASE',?,?)").run("CANCEL-"+(++seq),client.id,sales.id,client.display_name,service,price,price,label,tracking).lastInsertRowid);
 if(charged)recomputeOrderFinancials(id);return id;
}
const get=id=>db.prepare("SELECT * FROM orders WHERE id=?").get(id);
const ledger=id=>db.prepare("SELECT * FROM ledger_entries WHERE reference_id=? AND reference_type='ORDER_CANCELLATION'").all(String(id));
const balance=id=>db.prepare("SELECT SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) amount FROM ledger_entries WHERE reference_id=? AND reference_type IN ('ORDER','ORDER_CANCELLATION')").get(String(id)).amount;
let restartId;
for(const actor of [admin,sales,client]){
 for(const issued of [false,true]){
  const id=order({price:99.99});if(issued)addOrderTracking({orderId:id,tracking:"CANCEL-TRACK-"+id,labelUrl:"https://labels.test/cancel.pdf"});
  const result=cancelOrder(id,actor,"Customer changed mind");
  check(result.refund_percent===(issued?90:100),"role "+actor.role+" refund rule");
  check(result.refund_amount===(issued?89.99:99.99),"refund rounded to cents");
  check(get(id).total_due===(issued?10:0),"retained fee in payable total");
  check(get(id).gross_profit_net===(issued?10:0),"profit reflects refund immediately");
  check(Math.abs(balance(id)+(issued?10:0))<1e-8,"ledger net matches retained fee");
  check(ledger(id).length===1&&ledger(id)[0].client_user_id===client.id&&ledger(id)[0].created_by_user_id===actor.id,"refund client and actor attribution");
  const event=db.prepare("SELECT * FROM order_events WHERE order_id=? AND event_type='ORDER_CANCELLED'").get(id);
  check(event.actor_username===actor.username&&event.actor_role===actor.role&&event.actor_user_id===actor.id,"audit account and role");
  const before=JSON.stringify(ledger(id));const repeat=cancelOrder(id,actor,"repeat");
  check(repeat.already_cancelled&&JSON.stringify(ledger(id))===before,"retry does not duplicate refund");
  check(db.prepare("SELECT COUNT(*) c FROM order_events WHERE order_id=? AND event_type='ORDER_CANCELLED'").get(id).c===1,"retry does not duplicate audit");
  rejects(()=>upsertOrder({id,weight:2}),"cancelled order cannot be edited");
  rejects(()=>addOrderTracking({orderId:id,tracking:"NEW-"+id}),"cannot issue tracking after cancel");
  recomputeOrderFinancials(id);check(get(id).total_due===(issued?10:0)&&Math.abs(balance(id)+(issued?10:0))<1e-8,"reconciliation does not recharge cancelled order");
  if(issued){check(db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=? AND status='ACTIVE'").get(id).c===0,"tracking inactive after cancel");restartId=id}
 }
}
const blocked=order();for(const actor of [stranger,otherSales])rejects(()=>cancelOrder(blocked,actor,""),"cross-client cancellation forbidden");
check(get(blocked).workflow_status!=="CANCELLED"&&ledger(blocked).length===0,"permission rejection no mutation");
for(const status of ["RECEIVED","IN_TRANSIT","DELIVERED","ALERT","EXCEPTION"]){
 const id=order();const track=addOrderTracking({orderId:id,tracking:"STATUS-"+id});
 db.prepare("UPDATE order_trackings SET shipment_status=? WHERE id=?").run(status,track.id);
 rejects(()=>cancelOrder(id,admin,""),"block "+status+" even for admin");
 check(get(id).workflow_status!=="CANCELLED"&&ledger(id).length===0,"blocked status no refund");
}
const previous=order(),pt=addOrderTracking({orderId:previous,tracking:"PREVIOUS-"+previous});
db.prepare("UPDATE order_trackings SET shipment_status='IN_TRANSIT',status='REPLACED' WHERE id=?").run(pt.id);
addOrderTracking({orderId:previous,tracking:"PREVIOUS-NEW-"+previous});rejects(()=>cancelOrder(previous,client,""),"replaced tracking cannot bypass handover");
const reset=order();db.prepare("UPDATE orders SET fulfillment_started_at=CURRENT_TIMESTAMP WHERE id=?").run(reset);
rejects(()=>cancelOrder(reset,client,""),"latch blocks cancellation after status reset");
const historical=order();db.prepare("INSERT INTO order_events(order_id,event_type,summary,after_json) VALUES (?,'SHIPMENT_STATUS_UPDATED','old status',?)").run(historical,JSON.stringify({shipment_status:"RECEIVED"}));
rejects(()=>cancelOrder(historical,admin,""),"existing status history blocks cancellation");
const cargo=order({service:"Cargo Custom"});rejects(()=>cancelOrder(cargo,admin,""),"Cargo excluded");check(!cancellationPolicy(get(cargo)).allowed,"Cargo preview blocked");
const empty=order({price:0,charged:false});check(cancelOrder(empty,client,"").refund_amount===0&&ledger(empty).length===0,"uncharged order no phantom credit");
const legacy=order({label:"https://labels.test/legacy.pdf"});check(cancelOrder(legacy,admin,"").refund_percent===90,"legacy label uses ninety percent");
const partial=order(),partialTracking=addOrderTracking({orderId:partial,tracking:"PARTIAL-"+partial});check(cancelOrder(partial,admin,"").refund_percent===90,"tracking without label uses ninety percent");
rejects(()=>updateOrderTracking({orderId:partial,id:partialTracking.id,labelUrl:"x"}),"cannot update cancelled tracking");
rejects(()=>replaceOrderTracking({orderId:partial,oldTrackingId:partialTracking.id,newTracking:"X",reason:"X"}),"cannot replace cancelled tracking");
rejects(()=>addLedgerEntry({entry_type:"REFUND",reference_type:"ORDER_CANCELLATION",reference_id:"1",amount:1}),"manual refund cannot forge automatic reference");
rejects(()=>parseCancellationRules({ISSUED:{allowed:true,refund_percent:101}}),"Reject excessive rate");
rejects(()=>saveCancellationRules(routeId,rules,"",admin.id),"Policy audit reason required");
const noPolicy=order();db.prepare("UPDATE orders SET supplier='OTHER' WHERE id=?").run(noPolicy);rejects(()=>cancelOrder(noPolicy,admin),"No policy denies Admin too");
const configured=order();saveCancellationRules(routeId,{...rules,PRE_PURCHASE:{allowed:true,refund_percent:72.5}},"New supplier rate",admin.id);
check(cancelOrder(configured,client).refund_amount===72.5,"Configured custom rate automatic Client refund");
saveCancellationRules(routeId,rules,"Restore fixture",admin.id);
const surcharge=order();db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ADDITIONAL_FEE','DEBIT',5,'ORDER',?)").run(client.id,String(surcharge));
check(cancelOrder(surcharge,sales).refund_amount===105,"Refund includes charged surcharge");
const prior=order();const c=Number(db.prepare("INSERT INTO operation_cases(kind,severity,status,visibility,summary,created_by) VALUES ('CLAIM','MEDIUM','OPEN','PUBLIC','partial',?)").run(admin.id).lastInsertRowid);
db.prepare("INSERT INTO operation_case_orders(case_id,order_id) VALUES (?,?)").run(c,prior);
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'REFUND','CREDIT',30,'CLAIM',?)").run(client.id,String(c));
check(cancelOrder(prior,client).refund_amount===70&&get(prior).total_due===0,"Prior refund subtracts from cap and retained amount");
const reserveOnly=order({charged:false});const credit=require("../src/lib/credit.ts");credit.reservePurchase(reserveOnly,client.id,100,admin.id);
check(cancelOrder(reserveOnly,client).refund_amount===0&&ledger(reserveOnly).length===0,"Pre-charge no refund");
check(db.prepare("SELECT status FROM purchase_reserves WHERE order_id=? LIMIT 1").get(reserveOnly).status==='CANCELLED',"Reserve released atomically");
const shipped=order();db.prepare("UPDATE orders SET fulfillment_started_at=CURRENT_TIMESTAMP WHERE id=?").run(shipped);
saveCancellationRules(routeId,{...rules,SHIPPED:{allowed:true,refund_percent:20}},"Supplier allows after handover",admin.id);
check(cancelOrder(shipped,client).refund_amount===20,"Explicit shipped supplier rule permits auto cancellation");
const deliveredPolicy=order();const deliveredTrack=addOrderTracking({orderId:deliveredPolicy,tracking:"DELIVERED-POLICY"});
db.prepare("UPDATE order_trackings SET shipment_status='DELIVERED' WHERE id=?").run(deliveredTrack.id);
rejects(()=>cancelOrder(deliveredPolicy,admin),"Delivered cannot use shipped policy");
const lotFee=order();const lot=db.prepare("SELECT id FROM order_lots WHERE order_id=?").get(lotFee);
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ADDITIONAL_FEE','DEBIT',5,'LOT_RECONCILIATION',?)").run(client.id,String(lot.id));
check(cancelOrder(lotFee,client).refund_amount===105&&get(lotFee).gross_profit_net===0,"Lot fee refunded once and not added again to GP");
const historyCount=db.prepare("SELECT COUNT(*) n FROM route_cancellation_policy_history WHERE route_id=?").get(routeId).n;
rejects(()=>db.prepare("UPDATE route_cancellation_policy_history SET reason='Changed' WHERE route_id=?").run(routeId),"Policy history immutable");
check(db.prepare("SELECT COUNT(*) n FROM route_cancellation_policy_history WHERE route_id=?").get(routeId).n===historyCount,"Policy historical versions retained");
saveCancellationRules(routeId,rules,"Restore shipped deny",admin.id);
const denied=order();saveCancellationRules(routeId,{...rules,PRE_PURCHASE:{allowed:false,refund_percent:0}},"Supplier denies",admin.id);rejects(()=>cancelOrder(denied,admin),"Admin cannot override denied policy");saveCancellationRules(routeId,rules,"Restore",admin.id);
const waiting=order();db.prepare("INSERT INTO cancellation_requests(order_id,requested_by) VALUES (?,?)").run(waiting,client.id);
delete require.cache[require.resolve("../src/lib/order-cancellation.ts")];require("../src/lib/order-cancellation.ts");
check(db.prepare("SELECT status FROM cancellation_requests WHERE order_id=?").get(waiting).status==='POLICY_RECHECK'&&ledger(waiting).length===0&&get(waiting).workflow_status!=='CANCELLED',"Migration retains requests without executing refund");
check(db.prepare("SELECT COUNT(*) n FROM order_events WHERE order_id=? AND event_type='CANCELLATION_POLICY_MIGRATED'").get(waiting).n===1,"Migration audit");
delete require.cache[require.resolve("../src/lib/order-cancellation.ts")];require("../src/lib/order-cancellation.ts");
check(db.prepare("SELECT COUNT(*) n FROM order_events WHERE order_id=? AND event_type='CANCELLATION_POLICY_MIGRATED'").get(waiting).n===1,"Migration idempotent");
cancelOrder(waiting,client);check(db.prepare("SELECT status FROM cancellation_requests WHERE order_id=?").get(waiting).status==='AUTO_COMPLETED',"Legacy request rechecked without approval");
const rollback=order();db.exec("CREATE TRIGGER reject_cancel_audit BEFORE INSERT ON order_events WHEN NEW.event_type='ORDER_CANCELLED' AND NEW.order_id="+rollback+" BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
rejects(()=>cancelOrder(rollback,admin,""),"audit error aborts cancellation");check(get(rollback).workflow_status!=="CANCELLED"&&ledger(rollback).length===0&&balance(rollback)===-100,"audit failure rolls back refund and status");db.exec("DROP TRIGGER reject_cancel_audit");
const supportCommand={action:"balance_credit",amount:10,reason:"Supplier policy excludes support; DMD goodwill",request_key:"support-credit"};
const supportBefore=credit.accountFinancials(client.id).balance_cents,cancelledBefore=JSON.stringify(get(configured)),costBefore=db.prepare("SELECT SUM(total_net_cost) n FROM supplier_costs").get().n;
credit.financialAction(admin,client.id,supportCommand);credit.financialAction(admin,client.id,supportCommand);
check(credit.accountFinancials(client.id).balance_cents===supportBefore+1000,"Support credit increases Balance exactly once");
check(get(configured).cancellation_refund_amount===JSON.parse(cancelledBefore).cancellation_refund_amount&&db.prepare("SELECT SUM(total_net_cost) n FROM supplier_costs").get().n===costBefore,"Support does not override cancellation or Supplier Cost");
check(db.prepare("SELECT COUNT(*) n FROM financial_audit WHERE client_id=? AND event='balance_credit'").get(client.id).n===1,"Support credit audit exactly once");
rejects(()=>credit.financialAction(sales,client.id,{...supportCommand,request_key:"sales-support"}),"Sales cannot support credit");
rejects(()=>credit.financialAction(admin,client.id,{...supportCommand,reason:"",request_key:"reason-support"}),"Support reason required");
rejects(()=>credit.financialAction(admin,client.id,{...supportCommand,amount:11}),"Support same key different payload rejected");
check(db.pragma("quick_check")[0].quick_check==="ok"&&db.pragma("foreign_key_check").length===0,"database integrity");
db.close();delete require.cache[require.resolve("../src/lib/db.ts")];db=require("../src/lib/db.ts").db;
check(db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=? AND status='ACTIVE'").get(restartId).c===0,"restart never reactivates cancelled tracking");
check(db.prepare("SELECT COUNT(*) c FROM ledger_entries WHERE reference_type='ORDER_CANCELLATION' AND reference_id=?").get(String(restartId)).c===1,"restart preserves one refund");
db.close();console.log("ORDER CANCELLATION PASS ("+checks+" assertions)");
