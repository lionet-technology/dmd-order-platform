/** Creates its own synthetic target, backs it up, serves HTTP, then restores to a NEW file. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {spawn,execFile}=require('node:child_process'),{once}=require('node:events'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-http-cutover-'));
const target=path.join(dir,'synthetic.db'),backup=path.join(dir,'before.db'),restore=path.join(dir,'restored.db');
process.env.DMD_DB_PATH=target;process.env.NODE_ENV='test';
const resolve=Module._resolveFilename,ts=require('typescript');
Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),Database=require('better-sqlite3');
const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const count=100,entries=100,report={synthetic_only:true,target,backup,restore,day,clients:count,entries_per_client:entries,phases:[]};
let server,log,sampler,peakRssKb=0,sampling=false;
function digest(d){
 const tables=d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 return crypto.createHash('sha256').update(JSON.stringify(tables.map(({name})=>[name,d.prepare('SELECT * FROM "'+name+'"').all().map(r=>JSON.stringify(r)).sort()]))).digest('hex');
}
function integrity(d){assert.equal(d.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(d.pragma('foreign_key_check'),[])}
async function stop(){clearInterval(sampler);if(server){const child=server;server=null;child.kill('SIGTERM');await once(child,'exit');}if(log){fs.closeSync(log);log=null}}
async function start(file){
 log=fs.openSync(path.join(dir,'server-'+report.phases.length+'.log'),'a');
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3148'],{cwd:root,env:{...process.env,NODE_ENV:'production',DMD_DB_PATH:file},stdio:['ignore',log,log]});
 sampler=setInterval(()=>{if(sampling||!server)return;sampling=true;execFile('ps',['-o','rss=','-p',String(server.pid)],(error,out)=>{if(!error)peakRssKb=Math.max(peakRssKb,Number(out.trim())||0);sampling=false})},100);
 for(let i=0;i<120;i++){assert.equal(server.exitCode,null,'server startup');try{if((await fetch('http://127.0.0.1:3148/api/auth/me',{signal:AbortSignal.timeout(1000)})).status<500)return}catch{}await new Promise(r=>setTimeout(r,250))}throw Error('server readiness timeout');
}
async function call(url,cookie,body){const r=await fetch('http://127.0.0.1:3148'+url,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}}
async function login(role){const r=await call('/api/auth/login',null,{username:'load.'+role,password:'SyntheticPass123!'});assert.equal(r.status,200);return r.cookie}
(async()=>{try{
 const sales=auth.createUser({username:'load.sales',display_name:'Synthetic Sales',role:'SALES',password:'SyntheticPass123!'});
 for(const role of ['ADMIN','FINANCE','BOD'])auth.createUser({username:'load.'+role.toLowerCase(),display_name:'Synthetic '+role,role,password:'SyntheticPass123!',is_root_admin:role==='ADMIN'});
 const ids=[],insert=db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,occurred_at) VALUES (?,'ORDER_CHARGE','DEBIT',1,?)");
 db.transaction(()=>{for(let i=0;i<count;i++){const c=auth.createUser({username:i?'load.client.'+i:'load.client',display_name:'Synthetic '+i,role:'CLIENT',sales_user_id:sales.id,password:'SyntheticPass123!'});ids.push(c.id);for(let j=0;j<entries;j++)insert.run(c.id,day)}}).immediate();
 assert.equal(path.dirname(fs.realpathSync(target)),fs.realpathSync(dir));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE username NOT LIKE 'load.%'").get().n,0);
 integrity(db);report.before_digest=digest(db);await db.backup(backup);const b=new Database(backup,{readonly:true});integrity(b);assert.equal(digest(b),report.before_digest);b.close();
 await start(target);const cookies={};for(const role of ['admin','sales','finance','bod','client'])cookies[role]=await login(role);
 for(const role of Object.keys(cookies)){const r=await call('/api/statements-v2?client_id='+ids[0],cookies[role]);assert.equal(r.status,200,'five-role history '+role)}
 // Actual HTTP concurrency; timings include response transfer and JSON decoding.
 const url=id=>'/api/statements-v2?'+new URLSearchParams({client_id:id,start:day,end:day});
 for(const concurrency of [1,8,24]){
  const times=[],errors=[],began=performance.now();let cursor=0;
  await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<200){const i=cursor++,t=performance.now();try{const r=await call(url(ids[i%ids.length]),cookies.finance);assert.equal(r.status,200);assert.equal(r.data.closing.balance_cents,-10000);assert.equal(r.data.movements.length,100)}catch(e){errors.push(String(e))}times.push(performance.now()-t)}}));
  times.sort((a,b)=>a-b);report.phases.push({concurrency,requests:times.length,errors:errors.length,error_examples:errors.slice(0,3),p50_ms:+times[Math.floor(times.length*.5)].toFixed(2),p95_ms:+times[Math.floor(times.length*.95)].toFixed(2),max_ms:+times.at(-1).toFixed(2),wall_ms:Math.round(performance.now()-began)});
  assert.equal(errors.length,0,JSON.stringify(report.phases.at(-1)));
 }
 // Exercise actual HTTP financial writes before the post-write backup.
 const clientId=ids[0];
 const orderId=Number(db.prepare("INSERT INTO orders(client_user_id,sales_user_id,order_id,system_order_code,workflow_status,service) VALUES (?,?,'LOAD-CLAIM','LOAD-CLAIM','PURCHASED','UPS')").run(clientId,sales.id).lastInsertRowid);
 assert.equal((await call('/api/financials',cookies.admin,{client_id:clientId,action:'debt',amount:50,deadline:'2099-12-31',reason:'Synthetic cutover',request_key:'cutover-debt'})).status,200);
 assert.equal((await call('/api/ledger',cookies.sales,{client_user_id:clientId,entry_type:'PAYMENT',amount:60,request_key:'cutover-payment'})).status,201);
 const claim=await call('/api/cases',cookies.client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[orderId],summary:'Synthetic cutover Claim'});assert.equal(claim.status,200);
 assert.equal((await call('/api/claims',cookies.admin,{action:'finalize',case_id:claim.data.id,category:'LOST',refund_amount:10,compensation_amount:2,reason:'Synthetic obligation',request_key:'cutover-claim'})).status,200);
 for(const [action,amount] of [['to_balance',300],['to_bank',1100]])assert.equal((await call('/api/refunds',cookies.finance,{action,client_id:clientId,amount_cents:amount,reason:'Synthetic cutover',reference:action,request_key:action,from_account:'Synthetic DMD',to_account:'Synthetic Client',paid_date:day,proof:'Synthetic only'})).status,200);
 const preview=await call(url(clientId),cookies.finance);assert.equal(preview.status,200);assert.deepEqual(preview.data.closing,{balance_cents:-3700,debt_cents:0,refund_cents:-200});assert.equal(preview.data.bank_outflow_cents,1100);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM credit_debts WHERE client_id=?').get(clientId).n,1);
 report.financial_http={closing:preview.data.closing,bank_outflow_cents:1100,debt_accounts:1};
 const body={client_id:ids[0],start:day,end:day};
 const snapshots=await Promise.all(Array.from({length:12},()=>call('/api/statements-v2',cookies.finance,body)));
 assert(snapshots.every(r=>r.status===200));assert.equal(new Set(snapshots.map(r=>JSON.stringify(r.data))).size,1);
 const financialBefore=(await call('/api/financials?client_id='+ids[0],cookies.admin)).data;
 const issued=await call('/api/statements-v2?client_id='+ids[0],cookies.finance);
 assert.equal(issued.status,200);assert.equal(issued.data.items.length,1);
 const snapshot=issued.data.items[0];report.concurrent_finalizations=12;
 await stop();integrity(db);report.after_digest=digest(db);await db.backup(path.join(dir,'after.db'));
 // Restore the verified post-write backup into a fresh file, never over an existing DB.
 fs.copyFileSync(path.join(dir,'after.db'),restore,fs.constants.COPYFILE_EXCL);
 const restored=new Database(restore);integrity(restored);assert.equal(digest(restored),report.after_digest);restored.close();
 await start(restore);const restoredAdmin=await login('admin'),restoredFinance=await login('finance');
 const history=await call('/api/statements-v2?client_id='+ids[0],restoredFinance);assert.equal(history.status,200);assert.equal(history.data.items.length,1);assert.deepEqual(history.data.items[0],snapshot);
 const financialAfter=(await call('/api/financials?client_id='+ids[0],restoredAdmin)).data;
 for(const field of ['net_balance_cents','reserved_cents','available_to_buy_cents'])assert.deepEqual(financialAfter[field],financialBefore[field],field+' restored');
 assert.equal(financialAfter.net_balance_cents,-3700);
 report.restore={file:restore,integrity:'ok',foreign_key_violations:0,all_table_digest_equal:true,statement_identical:true,financial_balance_cents:financialAfter.net_balance_cents};
 report.server_peak_sampled_rss_mb=+(peakRssKb/1024).toFixed(2);report.runner_rss_mb=+(process.memoryUsage().rss/1048576).toFixed(2);
 console.log(JSON.stringify(report,null,2));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
 }finally{await stop();db.close();console.error('Synthetic evidence retained at '+dir)}})().catch(e=>{console.error(e);process.exitCode=1});
