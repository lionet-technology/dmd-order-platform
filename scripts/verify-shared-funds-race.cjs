// Real HTTP handlers over one owned synthetic DB: legacy and bulk consent parity.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-shared-funds-'));
process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),credit=require('../src/lib/credit.ts'),finance=require('../src/lib/finance.ts'),pricing=require('../src/lib/route-pricing.ts'),{RefundService}=require('../src/lib/refunds.ts'),{caseAction}=require('../src/lib/cases.ts'),{Worker}=require('node:worker_threads');
let checks=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)};
const signal=()=>new SharedArrayBuffer(4),wait=b=>{const a=new Int32Array(b);if(!Atomics.load(a,0))Atomics.wait(a,0,0,45000);return Atomics.load(a,0)},release=b=>{const a=new Int32Array(b);Atomics.store(a,0,1);Atomics.notify(a,0)};
try{
 require('./seed-epacket.cjs').seed();const admin=db.prepare("SELECT * FROM users WHERE role='ADMIN'").get(),base=db.prepare("SELECT * FROM users WHERE role='CLIENT' ORDER BY id").get();const refund=new RefundService(db);
 for(let round=0;round<7;round++){
  const client={...base,id:Number(db.prepare("INSERT INTO users(username,display_name,password_hash,role,sales_user_id) VALUES (?,?,'fixture','CLIENT',?)").run('race-'+round,'Race '+round,base.sales_user_id).lastInsertRowid)};
  db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled) VALUES (?,'ePacket','Standard',1)").run(client.id);
  finance.addLedgerEntry({client_user_id:client.id,entry_type:'ADDITIONAL_FEE',amount:10,request_key:'debt-source-'+round});
  const deadline=new Date(Date.now()+86400000*20).toISOString().slice(0,10);
  credit.financialAction(admin,client.id,{action:'debt',amount:10,deadline,daily_rate_pct:0,reason:'Synthetic debt',request_key:'debt-'+round});
  const o=finance.upsertOrder({client_user_id:client.id,order_id:'FUNDS-'+round,service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:.1,length:10,width:5,height:3,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',phone:'123456'});
  // Force an independent known $10 quote through approved price activation.
  const route=pricing.routeFor(o),version=pricing.createPriceVersion(route.id,[{weight:10,net:5,base_rate:10}],admin.id);pricing.activatePricing(route.id,{price_version_id:version.id,retail_markup:0},admin.id);
  const caseId=caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[o.id],summary:'Synthetic refund correction'}).id;
  refund.decide(admin,{case_id:caseId,refund_cents:1000,compensation_cents:0,category:'LOST',reason:'Approved',request_key:'approve-'+round});
  const fin=db.prepare("SELECT * FROM users WHERE role='FINANCE'").get()||auth.createUser({username:'race.finance',display_name:'Finance',password:'Synthetic123!',role:'FINANCE'});
  refund.execute(fin,{action:'to_balance',client_id:client.id,amount_cents:1000,reference:'initial-'+round,reason:'Executed',request_key:'pay-'+round});
  refund.decide(admin,{case_id:caseId,refund_cents:0,compensation_cents:0,category:'LOST',reason:'Corrected to zero',request_key:'correct-'+round});
  eq([credit.accountFinancials(client.id,{readOnly:true}).net_balance_cents,refund.balance(client.id)],[1000,-1000],'Start: $10 wallet, $10 debt and -$10 refund');
  const shared={file:process.env.DMD_DB_PATH,order:o.id,client,admin,quote:pricing.safePricing(pricing.refreshDraft(o.id),'CLIENT').quote_key,recover:{action:'recover',client_id:client.id,amount_cents:1000,reason:'Explicit recovery',request_key:'recover-'+round},payment:{client_user_id:client.id,entry_type:'PAYMENT',amount:10,request_key:'repay-'+round}};
  const jobs=['purchase','recover','payment'].map(mode=>{const ready=signal(),gate=signal(),out=signal();new Worker(path.join(__dirname,'shared-funds-worker.cjs'),{workerData:{...shared,mode,ready,gate,out}});return {ready,gate,out}});
  for(const j of jobs)eq(wait(j.ready),1,'Independent writer ready');
  if(round<3){const first=round;release(jobs[first].gate);eq(wait(jobs[first].out),1,'Controlled first writer succeeds');for(let i=0;i<3;i++)if(i!==first)release(jobs[i].gate);}
  else for(const j of jobs)release(j.gate);
  const outcomes=jobs.map(j=>wait(j.out));eq(outcomes[2],1,'Payment and allocation retry succeeds');eq(outcomes.slice(0,2).sort(),[1,2],'Exactly one of Purchase and recovery can consume the $10');
  const f=credit.accountFinancials(client.id,{readOnly:true}),wonPurchase=outcomes[0]===1;
  eq([f.net_balance_cents,f.reserved_cents,f.available_to_buy_cents,refund.balance(client.id)],[wonPurchase?1000:0,wonPurchase?1000:0,0,wonPurchase?-1000:0],'Independent funds oracle; no shared-dollar double spend');
  eq(db.prepare('SELECT SUM(amount_cents) n FROM credit_allocations WHERE debt_id IN (SELECT id FROM credit_debts WHERE client_id=?)').get(client.id).n,1000,'Only $10 allocated to Debt, never allocated twice');
  if(wonPurchase){require('../src/lib/order-operations.ts').addOrderTracking({orderId:o.id,tracking:'RACE-'+round,labelUrl:'https://labels.test/synthetic.pdf',actorId:admin.id});eq(credit.accountFinancials(client.id,{readOnly:true}).net_balance_cents,0,'Accepted Reserve can charge without negative wallet');}
 }
 eq(db.pragma('integrity_check',{simple:true}),'ok','Integrity');eq(db.pragma('foreign_key_check'),[],'Foreign keys');console.log('SHARED FUNDS RACE PASS ('+checks+' assertions; 21 independent SQLite writers; deterministic + simultaneous schedules)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
