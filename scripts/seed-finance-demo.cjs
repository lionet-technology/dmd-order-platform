// TEST/DEMO ONLY. Explicit --reset-demo is required. Never run against production.
const path=require('node:path');
if(!process.argv.includes('--reset-demo'))throw Error('TEST/DEMO ONLY: pass --reset-demo to rebuild transactional data.');
if(process.env.NODE_ENV==='production')throw Error('Demo reset forbidden in production.');
const {seed}=require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts');
const credit=require('../src/lib/credit.ts'),cases=require('../src/lib/cases.ts'),inbound=require('../src/lib/inbound.ts'),claims=require('../src/lib/claims.ts');
const {purchaseService}=require('../src/lib/route-pricing.ts');
require('../src/lib/order-cancellation.ts');
const tables=['money_command_receipts','supplier_recovery_receipts','supplier_recoveries','claim_decisions','operation_case_events','operation_case_orders','operation_cases','weight_adjustments','inbound_measurements','inbound_parcels','cancellation_requests','credit_statement_notes','credit_manual_allocations','credit_allocations','credit_items','credit_debts','credit_statements','rejected_payments','purchase_reserves','financial_audit','manifest_carton_items','manifest_carton_events','manifest_cartons','warehouse_order_holds','order_events','supplier_costs','carton_items','order_trackings','order_cartons','order_items','order_lots','ledger_entries','orders','service_costs','import_batches'];
const backup=path.join(path.dirname(process.env.DMD_DB_PATH), 'demo-backup-'+Date.now()+'.db');
db.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");
try{
const result=db.transaction(()=>{
 for(const t of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'immutable_%'").all())db.exec('DROP TRIGGER '+t.name);
 for(const t of tables){if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t))continue;db.prepare('DELETE FROM "'+t+'"').run();db.prepare('DELETE FROM sqlite_sequence WHERE name=?').run(t);}
 db.prepare("UPDATE users SET purchase_locked=0,purchase_lock_reason=NULL WHERE username IN ('epacket.client.a','epacket.client.b','epacket.client.c') AND role='CLIENT'").run();
 const summary=seed(false,true);
 const admin=db.prepare("SELECT * FROM users WHERE role='ADMIN' AND active=1 ORDER BY is_root_admin DESC,id LIMIT 1").get();
 const sales=db.prepare("SELECT * FROM users WHERE username='epacket.sales'").get();
 let warehouse=db.prepare("SELECT * FROM users WHERE username='demo.warehouse'").get();
 if(!warehouse)warehouse=createUser({username:'demo.warehouse',display_name:'Demo Warehouse',role:'WAREHOUSE',password:'Demo12345!',created_by_user_id:admin.id});
 const clients=summary.clients.map(c=>db.prepare('SELECT * FROM users WHERE id=?').get(c.id));
 const today=credit.localDay(),day=n=>credit.shiftDay(today,n),orders=c=>db.prepare('SELECT * FROM orders WHERE client_user_id=? ORDER BY id').all(c.id);
 for(const [i,c] of clients.entries())credit.financialAction(admin,c.id,{action:'configure',credit_limit:[0,1500,500][i],credit_term_days:14,purchase_locked:false});
 // Deposits are retained only for prepaid. Credit clients exhibit actual receivables.
 for(const c of clients.slice(1)){db.prepare('DELETE FROM credit_allocations WHERE ledger_id IN (SELECT id FROM ledger_entries WHERE client_user_id=?)').run(c.id);db.prepare("DELETE FROM ledger_entries WHERE client_user_id=? AND entry_type='PAYMENT'").run(c.id);}
 for(const [i,c] of clients.entries()){
 const os=orders(c);let n=0;
 for(const o of os.filter(o=>o.workflow_status==='PURCHASED')){
 const date=day(n++<2?-70:-7);
 db.prepare("UPDATE ledger_entries SET occurred_at=? WHERE client_user_id=? AND reference_type='ORDER' AND reference_id=?").run(date,c.id,String(o.id));
 db.prepare('UPDATE orders SET created_at=?,purchase_completed_at=? WHERE id=?').run(date,date+'T08:00:00Z',o.id);
 }
 const entries=db.prepare("SELECT id FROM ledger_entries WHERE client_user_id=? AND direction='DEBIT' ORDER BY id").all(c.id);for(const [j,e] of entries.entries())db.prepare('UPDATE ledger_entries SET occurred_at=? WHERE id=?').run(day(j<2?-70:-7),e.id);db.prepare('DELETE FROM credit_allocations WHERE statement_id IN (SELECT id FROM credit_statements WHERE client_id=?)').run(c.id);db.prepare('DELETE FROM credit_items WHERE client_id=?').run(c.id);db.prepare('DELETE FROM credit_statements WHERE client_id=?').run(c.id);credit.syncStatements(c.id);
 if(i===1){const first=credit.receivables(c.id).statements[0];
 const pay=Number(db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,note,created_by_user_id) VALUES (?,?,'PAYMENT','CREDIT',?,?, 'Demo bank payment / FIFO',?)").run(c.id,today,(first.amount_cents+100)/100,c.display_name,admin.id).lastInsertRowid);
 credit.allocateFIFO(c.id);
 const statements=credit.receivables(c.id).statements;
 // Explicit Admin override, audited through production action.
 credit.financialAction(admin,c.id,{action:'allocate',ledger_id:pay,reason:'Demo explicit payment allocation',allocations:[{statement_id:statements[0].id,amount:first.amount_cents/100},{statement_id:statements[1].id,amount:1}]});
 }
 if(i===2){const first=credit.receivables(c.id).statements[0];credit.financialAction(admin,c.id,{action:'debt',statement_id:first.id,amount:Math.min(5,first.outstanding_cents/100),deadline:day(-2),reason:'Demo overdue debt installment'});credit.financialAction(admin,c.id,{action:'configure',credit_limit:500,credit_term_days:14,purchase_locked:true,reason:'Demo manual lock: review overdue account'});}
 }
 const prepaid=clients[0],os=orders(prepaid),drafts=os.filter(o=>o.workflow_status==='SALES_DRAFT'&&!String(o.order_id).includes('INVALID'));
 for(const [i,o] of drafts.slice(0,2).entries()){
 // Return oversized draft to an eligible weight before reserving.
 db.prepare('UPDATE orders SET weight=.2,length=10,width=5,height=3 WHERE id=?').run(o.id);
 db.prepare('UPDATE order_cartons SET weight=.2,length=10,width=5,height=3,chargeable_weight=.2 WHERE order_id=?').run(o.id);
 purchaseService(o.id,prepaid);
 if(i===1){credit.purchaseJobAction(admin,{action:'fail',order_id:o.id,reason:'Demo supplier timeout'});db.prepare("UPDATE purchase_reserves SET updated_at=? WHERE order_id=?").run(new Date(Date.now()-5*3600000).toISOString(),o.id);}
 }
 credit.financialAction(sales,prepaid.id,{action:'additional_fee',unit_price:2.5,quantity:2,note:'Demo repacking materials'});
 const purchased=os.filter(o=>o.workflow_status==='PURCHASED');
 const hold=cases.caseAction(sales,{action:'create',kind:'HOLD',visibility:'INTERNAL',order_ids:[purchased[0].id],summary:'Demo warehouse hold: damaged packaging',assigned_to:warehouse.id,due_date:day(-1),next_action:'Repack and seek Admin release'});
 const claim=cases.caseAction(prepaid,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[purchased[1].id],summary:'Demo client claim: delivery delay',assigned_to:sales.id});
 db.prepare('UPDATE operation_cases SET created_at=? WHERE id=?').run(new Date(Date.now()-46*3600000).toISOString(),claim.id);
 const resolved=cases.caseAction(prepaid,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[purchased[2].id,purchased[3].id],summary:'Demo damaged products / resolved multi-order claim'});
 claims.claimAction(admin,{action:'finalize',case_id:resolved.id,refund_amount:1,compensation_amount:2,reason:'Demo approved damage claim'});
 const recovery=claims.claimAction(admin,{action:'create_recovery',case_id:resolved.id,supplier:'DMD',expected_amount:2,note:'Demo supplier recovery: remaining loss visible'});
 claims.claimAction(admin,{action:'receive_recovery',case_id:resolved.id,recovery_id:recovery.id,amount:1,reference:'DEMO-SUPPLIER-RECEIPT'});
 const overdueClaim=cases.caseAction(clients[2],{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[orders(clients[2])[0].id],summary:'Demo overdue first response claim',hold_requested:true});db.prepare('UPDATE operation_cases SET created_at=? WHERE id=?').run(new Date(Date.now()-49*3600000).toISOString(),overdueClaim.id);
 const followup=cases.caseAction(prepaid,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[purchased[5].id],summary:'Demo responded claim: supplier follow-up due'});
 cases.caseAction(sales,{action:'comment',case_id:followup.id,message:'We are checking with the carrier.',visibility:'PUBLIC'});
 cases.caseAction(sales,{action:'update',case_id:followup.id,next_action:'Follow up with carrier and update Client',next_action_due_at:day(-1),assigned_to:sales.id});
 credit.financialAction(sales,clients[1].id,{action:'additional_fee',occurred_at:day(-70),quantity:1,unit_price:3,note:'Demo late packing fee: current-period adjustment to issued statement'});
 const creditClient=clients[1];
 const creditEntry=Number(db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'MANUAL_CREDIT','CREDIT',2,?,'DEMO_CREDIT','SPLIT','Demo manual credit with explicit destination',?)").run(creditClient.id,today,creditClient.display_name,admin.id).lastInsertRowid);
 const target=credit.accountFinancials(creditClient.id).statements.find(s=>s.outstanding_cents>=100);
 if(!target)throw Error('Demo partial credit requires receivable fixture');
 credit.financialAction(admin,creditClient.id,{action:'apply_credit',ledger_id:creditEntry,allocations:[{statement_id:target.id,amount:1}],reason:'Demo credit split: $1 AR, $1 Wallet',request_key:'demo-credit-split'});
 const unknown=inbound.inboundAction(warehouse,{action:'scan',scan_key:'DEMO-UNKNOWN-BOX',note:'No readable client reference'});
 db.prepare('UPDATE inbound_parcels SET received_at=? WHERE id=?').run(new Date(Date.now()-25*3600000).toISOString(),unknown.id);
 for(const [i,o] of purchased.slice(3,5).entries()){
 const parcel=inbound.inboundAction(warehouse,{action:'scan',scan_key:o.order_id});
 const carton=db.prepare('SELECT * FROM order_cartons WHERE order_id=?').get(o.id);
 inbound.inboundAction(warehouse,{action:'measure',parcel_id:parcel.id,carton_id:carton.id,weight:Number(o.weight)+.5,length:10,width:5,height:3});
 const a=db.prepare('SELECT * FROM weight_adjustments WHERE order_id=?').get(o.id);
 if(!a)throw Error('Missing demo measurement adjustment');
 if(i)inbound.inboundAction(sales,{action:'approve_adjustment',parcel_id:parcel.id,adjustment_id:a.id});
 }
 inbound.inboundAction(warehouse,{action:'scan',scan_key:purchased[5].order_id});
 db.prepare("UPDATE order_trackings SET shipment_status=CASE WHEN order_id%3=0 THEN 'DELIVERED' WHEN order_id%3=1 THEN 'IN_TRANSIT' ELSE 'ALERT' END,etd_at=?,delivered_at=CASE WHEN order_id%3=0 THEN ? ELSE NULL END").run(day(-7),day(-1));
 db.prepare("UPDATE ledger_entries SET occurred_at=? WHERE entry_type='PAYMENT'").run(today);
 for(const c of clients)credit.accountFinancials(c.id);
 credit.statementSchema();
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Demo foreign key check failed');
 return {...summary,backup,hold:hold.id,claim:claim.id,resolved_claim:resolved.id,warehouse:warehouse.username};
}).immediate();
console.log(JSON.stringify(result,null,2));
}finally{db.close()}
