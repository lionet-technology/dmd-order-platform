// One owned synthetic database; independent integer-cent oracle across actual domain/API commands.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-linked-')),root=path.resolve(__dirname,'..');
process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const resolver=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolver.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const RealDate=Date;let now='2026-10-01T03:00:00.000Z';
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return new RealDate(now).getTime()}};
const {db}=require('../src/lib/db.ts');
const clockDb=new(require('better-sqlite3'))(':memory:');
db.function('strftime',{varargs:true},(format,value,...modifiers)=>{if(value==='now'&&format==='%Y-%m-%dT%H:%M:%fZ')return now;return clockDb.prepare('SELECT strftime('+[format,value,...modifiers].map(()=>'?').join(',')+') value').get(format,value,...modifiers).value;});
const auth=require('../src/lib/auth.ts'),credit=require('../src/lib/credit.ts'),pricing=require('../src/lib/route-pricing.ts'),finance=require('../src/lib/finance.ts'),operations=require('../src/lib/order-operations.ts'),recon=require('../src/lib/reconciliation.ts'),{RefundService}=require('../src/lib/refunds.ts'),{caseAction}=require('../src/lib/cases.ts'),statements=require('../src/lib/statements-v2.ts'),{bodFinanceReport}=require('../src/lib/bod-finance-report.ts'),{commissionMonthlyReport}=require('../src/lib/commission-report.ts'),{InternalExpenses}=require('../src/lib/internal-expenses.ts');
const {NextRequest}=require('next/server'),clientAPI=require('../src/app/api/client-orders/route.ts');
const create=(role,sales)=>auth.createUser({username:'linked.'+role,display_name:role,role,password:'Synthetic123!',sales_user_id:sales});
const admin=create('ADMIN'),sales=create('SALES'),client=create('CLIENT',sales.id),bod=create('BOD'),fin=create('FINANCE');
const refunds=new RefundService(db),expenses=new InternalExpenses(db);
let checks=0,serial=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)},reject=(f,m)=>{checks++;assert.throws(f,undefined,m)};
const token=auth.createSession(client.id).token;db.prepare("UPDATE sessions SET expires_at='2100-01-01'").run();
const call=async body=>{const r=await clientAPI.POST(new NextRequest('http://local/api/client-orders',{method:'POST',headers:{cookie:'dmd_session='+token,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()}};
const row={order_id:'LINKED-001',carton_count:1,weight:.1,length:10,width:5,height:3,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',country:'US',phone:'123456'};
const wallet=()=>credit.accountFinancials(client.id,{readOnly:true}).net_balance_cents;
let expectedWallet=10000,expectedRefund=0;
const invariant=label=>{eq(wallet(),expectedWallet,label+' independent wallet');eq(refunds.balance(client.id),expectedRefund,label+' independent refund');const f=credit.accountFinancials(client.id,{readOnly:true});eq(f.reserved_cents,0,label+' reserve consumed once')};
(async()=>{try{
 db.prepare("INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value) VALUES ('SUB_SERVICE','Standard','ePacket')").run();
 db.prepare("INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value) VALUES ('SUPPLIER','DMD','')").run();
 const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,client_self_purchase) VALUES ('ePacket','Standard','DMD',1)").run().lastInsertRowid);
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,0)").run(client.id);
 const version=pricing.createPriceVersion(route,[{weight:10,net:5,base_rate:10}],admin.id);
 pricing.activatePricing(route,{price_version_id:version.id,retail_markup:20},admin.id);
 finance.addLedgerEntry({client_user_id:client.id,entry_type:'PAYMENT',amount:100,occurred_at:'2026-10-01',request_key:'linked-opening'});
 let result=await call({action:'save',route_id:route,rows:[row]});eq(result.status,201,'Client real Draft save '+JSON.stringify(result.data));const id=result.data.orders[0].id;
 eq(wallet(),10000,'Draft does not spend');const oldKey=result.data.orders[0].pricing.quote_key;
 now='2026-10-01T03:01:00.000Z';pricing.activatePricing(route,{price_version_id:version.id,retail_markup:30},admin.id);
 result=await call({action:'purchase',order_ids:[id],expected_quotes:{[id]:oldKey}});eq(result.data.failed,1,'Stale displayed price rejected');eq(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=?').get(id).n,0,'Stale price reserves nothing');
 const fresh=pricing.safePricing(pricing.refreshDraft(id),'CLIENT').quote_key;
 db.prepare('UPDATE service_route_configs SET active=0 WHERE id=?').run(route);
 result=await call({action:'purchase',order_ids:[id],expected_quotes:{[id]:fresh}});eq(result.data.failed,1,'Route deactivation between preview and purchase blocks');
 db.prepare('UPDATE service_route_configs SET active=1 WHERE id=?').run(route);
 now='2026-10-01T03:02:00.000Z';pricing.activatePricing(route,{price_version_id:version.id,retail_markup:20},admin.id);
 const acceptedKey=pricing.safePricing(pricing.refreshDraft(id),'CLIENT').quote_key;
 const purchase={action:'purchase',order_ids:[id],expected_quotes:{[id]:acceptedKey}};
 db.exec("CREATE TRIGGER injected_purchase BEFORE INSERT ON order_events WHEN NEW.event_type='SERVICE_PURCHASED' BEGIN SELECT RAISE(ABORT,'interrupted purchase'); END;");
 result=await call(purchase);eq(result.data.failed,1,'Interrupted purchase rolls back');eq(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=?').get(id).n,0,'No stranded reserve after interruption');
 db.exec('DROP TRIGGER injected_purchase');result=await call(purchase);eq(result.data.succeeded,1,'Retry accepted');
 eq([wallet(),credit.accountFinancials(client.id,{readOnly:true}).reserved_cents],[10000,1200],'Reserve holds known 12 USD, no debit');
 const snap=db.prepare('SELECT pricing_snapshot_json FROM orders WHERE id=?').get(id).pricing_snapshot_json;
 now='2026-10-01T03:03:00.000Z';pricing.activatePricing(route,{price_version_id:version.id,retail_markup:90},admin.id);
 result=await call(purchase);eq(result.data.succeeded,1,'Lost response replay keeps original accepted purchase');
 eq(db.prepare('SELECT pricing_snapshot_json FROM orders WHERE id=?').get(id).pricing_snapshot_json,snap,'Accepted snapshot immutable after price activation');
 db.exec("CREATE TRIGGER injected_charge BEFORE INSERT ON ledger_entries WHEN NEW.entry_type='ORDER_CHARGE' BEGIN SELECT RAISE(ABORT,'charge failed'); END;");
 reject(()=>operations.addOrderTracking({orderId:id,tracking:'LINKED-TRACK',labelUrl:'https://labels.test/linked.pdf',actorId:admin.id}),'Charge interruption rolls back Tracking');
 eq(db.prepare('SELECT COUNT(*) n FROM order_trackings WHERE order_id=?').get(id).n,0,'No label/charge split');
 db.exec('DROP TRIGGER injected_charge');
 operations.addOrderTracking({orderId:id,tracking:'LINKED-TRACK',labelUrl:'https://labels.test/linked.pdf',actorId:admin.id});
 expectedWallet-=1200;invariant('Tracking/Label');credit.completeReserve(id,admin.id);invariant('Charge replay');
 // Fully actual ePacket components: known 20 USD cost vs independent 5 USD estimate.
 const components=actual=>['LAST_MILE','MID_MILE','WAREHOUSE','OTHER'].map((component,i)=>({component,estimated:i===0?5:0,actual:i===0?actual:0,reference:'LINKED-EVIDENCE-'+component}));
 const action=(body)=>recon.reconciliationAction(fin,{order_id:id,lot_number:1,reason:'Synthetic reviewed evidence',request_key:'recon-'+(++serial),...body});
 action({action:'cost_components',components:components(20)});
 eq(db.prepare('SELECT actual_gp,finalized_gp FROM orders WHERE id=?').get(id),{actual_gp:-8,finalized_gp:null},'Known loss visible while pending approval');
 action({action:'customer_surcharge',amount:3,public_note:'Actual handling charge'});expectedWallet-=300;invariant('Reviewed surcharge');
 eq(db.prepare('SELECT finalized_gp FROM orders WHERE id=?').get(id).finalized_gp,-5,'Commercial GP = 12 + 3 - 20');
 const approved=caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[id],summary:'Linked financial investigation'}).id;
 const decide=cents=>refunds.decide(admin,{case_id:approved,refund_cents:cents,compensation_cents:0,category:'LOST',reason:'Signed correction evidence',request_key:'decision-'+(++serial)});
 decide(1000);expectedRefund=1000;invariant('Approved obligation');
 const payout={action:'to_balance',client_id:client.id,amount_cents:600,reference:'BALANCE-EVIDENCE',reason:'Executed refund',request_key:'linked-wallet'};
 refunds.execute(fin,payout);expectedWallet+=600;expectedRefund-=600;
 refunds.execute(fin,{action:'to_bank',client_id:client.id,amount_cents:400,from_account:'DMD bank',to_account:'Client bank',paid_date:'2026-10-01',proof:'Executed evidence',reference:'BANK-EVIDENCE',reason:'Executed bank payout',request_key:'linked-bank'});expectedRefund-=400;
 invariant('Mixed payout channels');
 decide(300);expectedRefund-=700;invariant('Downward revision: no automatic wallet debit');
 eq(refunds.execute(fin,payout).refund_balance_cents,400,'Lost payout response returns original receipt after negative revision');invariant('Payout replay');
 reject(()=>refunds.execute(fin,{...payout,request_key:'overpay-negative',amount_cents:1}),'Negative pool cannot pay again');
 const recover={action:'recover',client_id:client.id,amount_cents:250,reason:'Explicit manual wallet recovery',request_key:'linked-recover'};
 refunds.execute(admin,recover);expectedWallet-=250;expectedRefund+=250;invariant('Partial manual recovery');
 refunds.execute(admin,recover);invariant('Recovery replay');
 const issued=statements.finalizeStatement(fin,client.id,'2026-10-01','2026-10-01'),frozen=JSON.stringify(issued);
 eq(issued.closing,{balance_cents:8850,debt_cents:0,refund_cents:-450},'Independent issued closing');eq(issued.bank_outflow_cents,400,'Bank cash distinct from wallet refund');
 const report=bodFinanceReport(bod,'2026-10-01','2026-10-01');
 eq(report.accounts.find(c=>c.client_id===client.id).balance_cents,expectedWallet,'BOD live wallet matches oracle');eq(report.refunds.bank_outflow_cents,400,'BOD bank outflow counts actual payout only');
 let monthly=commissionMonthlyReport(admin,'2026-10');eq(monthly.refund_adjustments.reduce((n,r)=>n+r.refund_cents,0),300,'Monthly Commission uses approved obligation, never payout plus recovery');
 // Cost arriving after close changes actual GP, not Client money or frozen Statement.
 now='2026-11-02T03:00:00.000Z';
 const bankRecovery={action:'recover_bank',client_id:client.id,amount_cents:150,reason:'Actual cash recovered after correction',reference:'BANK-RECOVERY',from_account:'Client bank',to_account:'DMD bank',paid_date:'2026-10-31',proof:'Received bank evidence',request_key:'linked-bank-recovery'};
 const beforeRecoveryCommission=commissionMonthlyReport(admin,'2026-11').refund_adjustments;
 reject(()=>refunds.execute(admin,bankRecovery),'Admin cannot record Finance bank receipt');
 reject(()=>refunds.execute(fin,{...bankRecovery,amount_cents:451,request_key:'bank-excess'}),'Bank recovery bounded by current negative pool');
 reject(()=>refunds.execute(fin,{...bankRecovery,proof:'',request_key:'bank-no-proof'}),'Bank recovery needs receipt evidence');
 const received=refunds.execute(fin,bankRecovery);expectedRefund+=150;invariant('Actual Bank recovery never touches wallet');
 eq(refunds.execute(fin,bankRecovery),received,'Bank recovery lost-response retry posts once');
 eq(commissionMonthlyReport(admin,'2026-11').refund_adjustments,beforeRecoveryCommission,'Bank recovery never changes approved Commission inputs');
 const bankReport=bodFinanceReport(bod,'2026-11-02','2026-11-02');
 eq([bankReport.refunds.bank_outflow_cents,bankReport.refunds.bank_recovery_cents,bankReport.refunds.bank_net_outflow_cents],[0,0,0],'Cash reporting uses executed date rather than recording date');
 const priorCash=bodFinanceReport(bod,'2026-10-31','2026-10-31');eq([priorCash.refunds.bank_outflow_cents,priorCash.refunds.bank_recovery_cents,priorCash.refunds.bank_net_outflow_cents],[0,150,-150],'Prior executed-day report separates actual Bank recovery');
 eq(statements.statementPreview(fin,client.id,'2026-10-02','2026-10-31').bank_recovery_cents,0,'Statement uses recording period; backdated cash does not restate prior periods');
 action({action:'cost_components',components:components(25)});
 eq(db.prepare('SELECT actual_gp,finalized_gp FROM orders WHERE id=?').get(id),{actual_gp:-10,finalized_gp:null},'Late supplier cost reopens Review and exposes negative GP');
 invariant('Late cost');eq(JSON.stringify(statements.finalizeStatement(fin,client.id,'2026-10-01','2026-10-01')),frozen,'Late supplier cost never rewrites issued Statement');
 decide(100);expectedRefund-=200;invariant('Late obligation correction');
 eq(commissionMonthlyReport(admin,'2026-11').refund_adjustments.reduce((n,r)=>n+r.refund_cents,0),-200,'Commission revision belongs to processing month');
 const next=statements.statementPreview(fin,client.id,'2026-10-02','2026-11-02');eq(next.opening,issued.closing,'Next period opening unchanged');eq(next.closing.refund_cents,-500,'Next period carries signed correction and cash recovery once');eq([next.bank_outflow_cents,next.bank_recovery_cents,next.bank_net_outflow_cents],[0,150,-150],'Next Statement separates recovery inflow from payout');
 // Fixed-seed property loop: 80 independent obligation/actual/recovery combinations.
 let seed=7419,totalApproved=100;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(let i=0;i<80;i++){
  const kind=rnd(3);
  if(kind===0){const value=rnd(1600);decide(value);expectedRefund+=value-totalApproved;totalApproved=value;}
  else if(kind===1&&expectedRefund>0){const amount=1+rnd(expectedRefund);refunds.execute(fin,{...payout,amount_cents:amount,request_key:'property-pay-'+i});expectedWallet+=amount;expectedRefund-=amount;}
  else if(expectedRefund<0){const amount=1+rnd(-expectedRefund);refunds.execute(admin,{...recover,amount_cents:amount,request_key:'property-recover-'+i});expectedWallet-=amount;expectedRefund+=amount;}
  invariant('Property step '+i);
 }
 const beforeExpenses=[wallet(),refunds.balance(client.id),JSON.stringify(statements.statementPreview(fin,client.id,'2026-10-02','2026-11-02').closing)];
 const expense=expenses.command(bod,{action:'create',request_key:'linked-payroll',reason:'Manual Sales commission',title:'Sales monthly payroll',category:'PAYROLL_BONUS',currency:'VND',note:'Commission included',total_vnd:1000000,commission_vnd:200000,installments:[{key:'part1',due_date:'2026-11-01',amount_vnd:600000},{key:'part2',due_date:'2026-11-15',amount_vnd:400000}]});
 const payExpense={action:'pay',expense_id:expense.id,expected_version:1,installment_key:'part1',amount_vnd:200000,paid_date:'2026-11-02',reference:'Payroll bank evidence',reason:'Executed installment',request_key:'linked-expense-pay'};
 expenses.command(fin,payExpense);expenses.command(fin,payExpense);
 eq(expenses.report(bod,'2026-11').cash_month_vnd,200000,'Internal partial cash paid once');eq(expenses.report(bod,'2026-11').due_month_vnd,1000000,'Due installments distinct from cash');
 eq([wallet(),refunds.balance(client.id),JSON.stringify(statements.statementPreview(fin,client.id,'2026-10-02','2026-11-02').closing)],beforeExpenses,'VND expenses do not alter Client USD/Refund/Statement');
 // Supplier aggregate source-key retry must never silently accept changed money.
 db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,client_self_purchase) VALUES ('UPS','','DMD',1)").run();
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'UPS','',1,0)").run(client.id);
 const costOrder=finance.upsertOrder({...row,order_id:'LINKED-SOURCE',client_user_id:client.id,service:'UPS',supplier:'DMD',sub_service:'',sales_price:0});
 pricing.purchaseService(costOrder.id,client);
 require('../src/lib/manual-route-price.ts').setManualOrderPrice(costOrder.id,7,admin.id);
 operations.addOrderTracking({orderId:costOrder.id,tracking:'LINKED-SOURCE-TRACK',labelUrl:'https://labels.test/source.pdf',actorId:admin.id});
 expectedWallet-=700;invariant('Second Order manual price/charge');
 const cost={order_id:costOrder.id,lot_number:1,supplier:'DMD',service:'UPS',sub_service:'',total_net_cost:7,extra_surcharge:3,import_tax:2,occurred_at:'2026-11-02',source_key:'linked-supplier-source'};
 const source=finance.addSupplierCost(cost);eq(finance.addSupplierCost({...cost,batch_id:999}).id,source.id,'Exact Supplier retry despite new import batch');
 for(const patch of [{total_net_cost:8},{import_tax:1},{extra_surcharge:1},{note:'changed evidence'}])reject(()=>finance.addSupplierCost({...cost,...patch}),'Supplier same-key changed payload rejected');
 eq(db.prepare('SELECT COUNT(*) n FROM supplier_costs WHERE source_key=?').get(cost.source_key).n,1,'No duplicate supplier cost');
 db.prepare("UPDATE enum_values SET active=0 WHERE enum_type='SUPPLIER' AND value='DMD'").run();
 eq(finance.addSupplierCost(cost).id,source.id,'Exact known source retry survives Supplier deactivation');
 reject(()=>finance.addSupplierCost({...cost,total_net_cost:8}),'Inactive Supplier still cannot reuse source key with changed money');
 reject(()=>finance.addSupplierCost({...cost,source_key:'inactive-new-source'}),'Inactive Supplier cannot introduce new cost source');
 db.prepare("UPDATE enum_values SET active=1 WHERE enum_type='SUPPLIER' AND value='DMD'").run();
 invariant('Supplier cost/tax/surcharge feed never auto debits Client');
 eq(db.prepare('SELECT actual_gp,finalized_gp FROM orders WHERE id=?').get(costOrder.id),{actual_gp:0,finalized_gp:null},'Supplier tax/surcharge metadata not double counted; missing estimate still needs review');
 const correction={order_id:costOrder.id,lot_number:1,action:'cost_adjustment',amount:3,reason:'Late supplier correction',request_key:'linked-source-adjust'};
 recon.reconciliationAction(fin,correction);recon.reconciliationAction(fin,correction);
 eq(db.prepare('SELECT actual_gp,finalized_gp FROM orders WHERE id=?').get(costOrder.id),{actual_gp:-3,finalized_gp:null},'Signed late cost adjustment reopens once');
 recon.reconciliationAction(fin,{order_id:costOrder.id,lot_number:1,action:'absorb_loss',reason:'Reviewed actual loss',review_reference:'ADMIN-EVIDENCE',review_evidence:'Approved documentary review',request_key:'linked-absorb'});
 eq(db.prepare('SELECT finalized_gp FROM orders WHERE id=?').get(costOrder.id).finalized_gp,-3,'Approved negative actual GP retained');
 invariant('Absorbing loss never charges Supplier tax or changes Client money');
 eq(JSON.stringify(statements.finalizeStatement(fin,client.id,'2026-10-01','2026-10-01')),frozen,'All later Supplier corrections preserve original Statement bytes');
 const orderAPI=require('../src/app/api/orders/[id]/route.ts');
 for(const actor of [client,sales]){
  const session=auth.createSession(actor.id).token;db.prepare("UPDATE sessions SET expires_at='2100-01-01' WHERE user_id=?").run(actor.id);
  const response=await orderAPI.GET(new NextRequest('http://local/api/orders/'+id,{headers:{cookie:'dmd_session='+session}}),{params:Promise.resolve({id:String(id)})});
  eq(response.status,200,'Linked Order role access '+actor.role);const text=await response.text();eq(/"supplier"|"actual_gp"|"finalized_gp"|"true_net_cost"|"cost_snapshot_json"/.test(text),false,'No Supplier/Net disclosure '+actor.role);
 }
 // Independent SQLite connections race route deactivation against accepted purchase.
 const {Worker}=require('node:worker_threads');
 db.exec('CREATE TABLE test_route_observations(order_id INTEGER,active_at_reserve INTEGER)');
 const signal=()=>new SharedArrayBuffer(4),wait=(buffer)=>{const a=new Int32Array(buffer);if(!Atomics.load(a,0))Atomics.wait(a,0,0,20000);return Atomics.load(a,0)},release=buffer=>{const a=new Int32Array(buffer);Atomics.store(a,0,1);Atomics.notify(a,0)};
 for(let i=0;i<3;i++){
  db.prepare('UPDATE service_route_configs SET active=1 WHERE id=?').run(route);
  const draft=finance.upsertOrder({...row,order_id:'ROUTE-RACE-'+i,client_user_id:client.id,service:'ePacket',sub_service:'Standard',supplier:'DMD'});
  const quote=pricing.safePricing(pricing.refreshDraft(draft.id),'CLIENT').quote_key;
  db.exec("CREATE TRIGGER test_route_observation AFTER INSERT ON purchase_reserves WHEN NEW.order_id="+draft.id+" BEGIN INSERT INTO test_route_observations SELECT NEW.order_id,active FROM service_route_configs WHERE id="+route+"; END;");
  const jobs=['purchase','deactivate'].map(mode=>{const ready=signal(),gate=signal(),outcome=signal();new Worker(path.join(__dirname,'route-race-worker.cjs'),{workerData:{mode,ready,gate,outcome,file:process.env.DMD_DB_PATH,order:draft.id,route,actor:{id:client.id,role:'CLIENT'},quote}});return {ready,gate,outcome}});
  for(const job of jobs)eq(wait(job.ready),1,'Both independent writers ready '+i);
  if(i===0){release(jobs[0].gate);release(jobs[1].gate);}
  else {const first=i===1?0:1;release(jobs[first].gate);eq(wait(jobs[first].outcome),1,'Controlled first writer '+i);release(jobs[1-first].gate);}
  const purchaseResult=wait(jobs[0].outcome);eq(wait(jobs[1].outcome),1,'Route writer completes '+i);eq([1,2].includes(purchaseResult),true,'Purchase has a valid serialized outcome '+i);
  if(i===1)eq(purchaseResult,1,'Purchase before deactivation is accepted');
  if(i===2)eq(purchaseResult,2,'Deactivation before purchase blocks');
  if(purchaseResult===1){eq(db.prepare('SELECT active_at_reserve FROM test_route_observations WHERE order_id=?').get(draft.id).active_at_reserve,1,'Route was active at exact Reserve insertion');credit.purchaseJobAction(admin,{action:'fail',order_id:draft.id,reason:'Synthetic job interruption, release reserve'});}
  else eq(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=?').get(draft.id).n,0,'Inactive route reserves nothing');
  db.exec('DROP TRIGGER test_route_observation');invariant('Concurrent route result '+i);
 }
 db.prepare('UPDATE service_route_configs SET active=1 WHERE id=?').run(route);
 const lateBod=bodFinanceReport(bod,'2026-11-02','2026-11-02');
 eq(lateBod.accounts.find(c=>c.client_id===client.id).balance_cents,expectedWallet,'Final BOD wallet oracle');
 eq(lateBod.accounts.find(c=>c.client_id===client.id).refund_balance_cents,expectedRefund,'Final BOD signed Refund oracle');
 eq(lateBod.order_gp.finalized_gp_cents,-300,'BOD approved GP includes loss; pending cost review excluded');
 const queueAPI=require('../src/app/api/admin-action-queue/route.ts');
 require('../src/lib/statement-monthly-close.ts').monthlyCloseReview(admin);
 db.prepare("INSERT INTO statement_monthly_close(client_id,period_start,period_end,status,reason,actor_id) VALUES (?,'2026-10-02','2026-10-31','REVIEW','Synthetic failed close',?)").run(client.id,admin.id);
 const adminToken=auth.createSession(admin.id).token;db.prepare("UPDATE sessions SET expires_at='2100-01-01' WHERE user_id=?").run(admin.id);
 const financialBefore=[wallet(),refunds.balance(client.id),db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n];
 const queueResponse=await queueAPI.GET(new NextRequest('http://local/api/admin-action-queue',{headers:{cookie:'dmd_session='+adminToken}}));
 const queue=await queueResponse.json();eq(queueResponse.status,200,'Operational queue after linked flows');
 eq(queue.statement_reviews.some(s=>s.client_id===client.id&&s.period_start==='2026-10-02'),true,'Failed statement close stays actionable');
 const failedJobs=db.prepare("SELECT order_id FROM purchase_reserves WHERE status='FAILED' AND client_id=?").all(client.id);eq(failedJobs.every(job=>queue.failed_jobs.some(o=>o.id===job.order_id)),true,'Interrupted jobs appear in operational queue');eq(queue.charge_review.length,0,'Atomic failed charges leave no Label/reserve split');
 eq(queue.backup_monitoring,'NOT_CONFIGURED','No fabricated backup health');
 eq([wallet(),refunds.balance(client.id),db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n],financialBefore,'Operational alerts never post money');
 // Restore a real online SQLite backup to a distinct file, compare every persisted row.
 const copy=path.join(dir,'restored-copy.db');await db.backup(copy);const restored=new(require('better-sqlite3'))(copy);
 eq(restored.pragma('integrity_check',{simple:true}),'ok','Restored copy integrity');
 for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all())eq(restored.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all(),db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all(),'Backup restores table '+name);
 restored.close();eq(db.prepare('PRAGMA foreign_key_check').all(),[],'FK integrity');eq(db.pragma('integrity_check',{simple:true}),'ok','DB integrity');
 console.log('LINKED WORKFLOWS PASS ('+checks+' assertions; 80 fixed-seed oracle steps; restored synthetic copy)');
}finally{db.close();clockDb.close();global.Date=RealDate;fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
