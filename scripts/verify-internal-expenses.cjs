const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-internal-expenses-')),root=path.resolve(__dirname,'..');
process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const resolver=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){if(r.startsWith('@/'))r=path.join(root,'src',r.slice(2));return resolver.call(this,r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),{InternalExpenses}=require('../src/lib/internal-expenses.ts'),{NextRequest}=require('next/server'),{Worker}=require('node:worker_threads');
const users={};for(const role of ['BOD','FINANCE','ADMIN','SALES','CLIENT','WAREHOUSE'])users[role]=auth.createUser({username:'expense.'+role,display_name:role,password:'TestPass123!',role,sales_user_id:users.SALES?.id});
const finance=users.FINANCE,bod=users.BOD,service=new InternalExpenses(db),day=new Date(Date.now()+7*3600000).toISOString().slice(0,10),month=day.slice(0,7);
let checks=0,serial=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)},reject=(f,m)=>{checks++;assert.throws(f,undefined,m)},act=(b,a=finance)=>service.command(a,{...(b.action==='pay'?{expected_version:service.list(a).find(x=>x.id===b.expense_id)?.version}:{}),request_key:'expense-'+(++serial),reason:'Synthetic evidence',...b});
const plan={action:'create',title:'IT stage plan',category:'IT_PROJECT',note:'Milestones',payee:'Supplier',document:'Contract',currency:'VND',total_vnd:1000,commission_vnd:0,installments:[{key:'s1',due_date:day,amount_vnd:600},{key:'s2',due_date:day,amount_vnd:400}]};
async function main(){try{
 for(const role of ['ADMIN','SALES','CLIENT','WAREHOUSE']){reject(()=>service.list(users[role]),'Domain list denied '+role);reject(()=>act(plan,users[role]),'Domain write denied '+role);reject(()=>service.report(users[role],month),'Domain report denied '+role);}
 for(const patch of [{currency:'USD'},{total_vnd:999},{installments:[]},{installments:[{key:'a',due_date:day,amount_vnd:500},{key:'a',due_date:day,amount_vnd:500}]},{total_vnd:1.5},{commission_vnd:1},{installments:[{key:'s',due_date:'2026-02-30',amount_vnd:1000}]}])reject(()=>act({...plan,...patch}),'Invalid schedule/money rejected');
 eq(service.list(finance).length,0,'Invalid create leaves no record');
 const payload={...plan,request_key:'stable-create',reason:'Initial'},created=service.command(bod,payload),id=created.id;
 eq(service.command(bod,payload),created,'Create retry returns original receipt');reject(()=>service.command(bod,{...payload,title:'Changed'}),'Same key changed payload rejected');reject(()=>service.command(finance,payload),'Cross actor receipt conflict');
 const pay={action:'pay',expense_id:id,installment_key:'s1',amount_vnd:200,paid_date:day,reference:'bank-1'};
 act(pay);act({...pay,amount_vnd:300});let current=service.list(bod)[0];eq([current.paid_vnd,current.remaining_vnd,current.overpaid_vnd],[500,500,0],'Partial multistage totals');
 reject(()=>act({...pay,amount_vnd:101}),'No accidental stage overpay');reject(()=>act({...pay,amount_vnd:1,paid_date:'2100-01-01'}),'Future actual payment denied');
 const changed={...plan,action:'edit',expense_id:id,expected_version:1,total_vnd:1200,installments:[{key:'s1',due_date:day,amount_vnd:600},{key:'s2',due_date:day,amount_vnd:600}]};
 act(changed,bod);reject(()=>service.command(finance,{...pay,expected_version:1,reason:'Old plan',request_key:'stale-payment'}),'Stale schedule payment rejected');reject(()=>act(changed),'Optimistic stale edit rejected');eq(service.list(finance)[0].audit.length,2,'Both BOD and Finance manage with audit');
 reject(()=>act({...changed,expected_version:2,total_vnd:400,installments:[{key:'s1',due_date:day,amount_vnd:400}]}),'Cannot revise below actual paid');
 reject(()=>act({...changed,expected_version:2,installments:[{key:'s2',due_date:day,amount_vnd:1200}]}),'Cannot remove paid schedule');
 const partial=act({...pay,installment_key:'s2',amount_vnd:600,request_key:'exact-pay'});eq([partial.paid_vnd,partial.remaining_vnd],[1100,100],'Other installment payment');
 const retry={...pay,expected_version:2,installment_key:'s2',amount_vnd:600,request_key:'exact-pay',reason:'Synthetic evidence'};eq(service.command(finance,retry),partial,'Payment retry does not duplicate');
 reject(()=>act({...pay,amount_vnd:200,allow_overpay:true,exception_reason:''}),'Exceptional overpay needs reason');
 const exceptional=act({...pay,amount_vnd:200,allow_overpay:true,exception_reason:'Approved exceptional cost'});eq([exceptional.paid_vnd,exceptional.remaining_vnd,exceptional.overpaid_vnd],[1300,0,100],'Explicit excess tracked separately');
 const payment=exceptional.payments[0],reversed=act({action:'reverse',expense_id:id,payment_id:payment.id},bod);eq([reversed.paid_vnd,reversed.remaining_vnd],[1100,100],'Full reversal compensates exactly once');reject(()=>act({action:'reverse',expense_id:id,payment_id:payment.id}),'No double reversal');reject(()=>act({action:'reverse',expense_id:id,payment_id:reversed.payments[0].id}),'No reverse of reversal');
 eq(service.report(bod,month).cash_month_vnd,1100,'Monthly cash is net actual events, never commitment');eq(service.report(bod,month).due_month_vnd,1200,'Monthly due uses latest plan');reject(()=>service.report(bod,'2026-13'),'Bad month rejected');
 const payroll=act({...plan,title:'Sales salary',category:'PAYROLL_BONUS',commission_vnd:250},bod);eq(payroll.total_vnd,1000,'Commission included, not added');reject(()=>act({...plan,category:'PAYROLL_BONUS',commission_vnd:1001}),'Commission bounded by total');
 const before=db.prepare('SELECT COUNT(*) n FROM internal_expense_payments').get().n;
 db.exec("CREATE TRIGGER injected_expense_receipt_failure BEFORE INSERT ON internal_expense_receipts BEGIN SELECT RAISE(ABORT,'injected'); END;");reject(()=>act({...pay,amount_vnd:50}),'Receipt failure rolls back payment');db.exec('DROP TRIGGER injected_expense_receipt_failure');eq(db.prepare('SELECT COUNT(*) n FROM internal_expense_payments').get().n,before,'Atomic receipt with payment');
 for(const table of ['internal_expenses','internal_expense_versions','internal_expense_payments','internal_expense_receipts']){reject(()=>db.exec('DELETE FROM '+table),'Immutable '+table);}
 const api=require('../src/app/api/internal-expenses/route.ts'),tokens=new Map();const req=(u,b,url='/api/internal-expenses')=>{if(u&&!tokens.has(u.id))tokens.set(u.id,auth.createSession(u.id).token);return new NextRequest('http://local'+url,{method:b?'POST':'GET',headers:{...(u?{cookie:'dmd_session='+tokens.get(u.id)}:{}),...(b?{'Content-Type':'application/json'}:{})},body:b?JSON.stringify(b):undefined})};
 for(const u of [undefined,...Object.values(users)]){const allowed=u&&['BOD','FINANCE'].includes(u.role);eq((await api.GET(req(u))).status,!u?401:allowed?200:403,'HTTP read '+u?.role);eq((await api.POST(req(u,{...plan,reason:'HTTP create',request_key:'http-'+u?.role}))).status,!u?401:allowed?200:403,'HTTP create '+u?.role);}
 const response=await api.GET(req(bod));eq(response.headers.get('cache-control'),'private, no-store','Private response');eq((await api.GET(req(finance,null,'/api/internal-expenses?month=garbage'))).status,400,'HTTP month validation');
 // Independent SQLite writers: one remaining allowance can only be consumed once.
 const target=act({...plan,total_vnd:100,installments:[{key:'s1',due_date:day,amount_vnd:100}]});
 const worker=(payload,mode)=>{const buffer=new SharedArrayBuffer(4);new Worker(path.join(__dirname,'expense-race-worker.cjs'),{workerData:{file:process.env.DMD_DB_PATH,actor:finance,payload,signal:buffer,mode}});return new Int32Array(buffer)};
 const racePay={...pay,expected_version:1,expense_id:target.id,amount_vnd:70,reason:'Race'};
 const signals=[worker({...racePay,request_key:'race-a'}),worker({...racePay,request_key:'race-b'})];
 const outcomes=signals.map(s=>{if(!Atomics.load(s,0))Atomics.wait(s,0,0,30000);return Atomics.load(s,0)});eq(outcomes.sort(),[1,2],'Concurrent distinct requests serialize overpay check');
 const same={...racePay,amount_vnd:20,request_key:'same-race'};const retrySignals=Array.from({length:4},()=>worker(same));for(const s of retrySignals){if(!Atomics.load(s,0))Atomics.wait(s,0,0,30000);eq(Atomics.load(s,0),1,'Concurrent exact retry succeeds');}
 eq(service.list(bod).find(x=>x.id===target.id).paid_vnd,90,'Concurrent retry posts once');
 eq(db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n,0,'No Client ledger money from internal expense');eq(db.prepare('PRAGMA foreign_key_check').all(),[],'FK integrity');eq(db.pragma('integrity_check',{simple:true}),'ok','SQLite integrity');
 console.log('INTERNAL EXPENSES DOMAIN/API PASS ('+checks+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}}main().catch(e=>{console.error(e);process.exitCode=1});
