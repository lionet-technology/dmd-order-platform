// Owned localhost server + new synthetic DB; never inherit the operator DB.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-sales-monthly-http-')),root=path.resolve(__dirname,'..'),file=path.join(dir,'synthetic.db'),port=34509,base='http://127.0.0.1:'+port;
process.env.DMD_DB_PATH=file;process.env.NODE_ENV='test';
const resolver=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolver.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const realNow=new Date(),month=new Date(Date.UTC(realNow.getUTCFullYear(),realNow.getUTCMonth()-1,1)).toISOString().slice(0,7),stamp=month+'-01T03:00:00.000Z';
const {db}=require('../src/lib/db.ts');db.function('strftime',{varargs:true},(format,value)=>{if(value==='now'&&format==='%Y-%m-%dT%H:%M:%fZ')return stamp;throw Error('fixture clock')});
const auth=require('../src/lib/auth.ts');require('../src/lib/bod-commercial.ts');
const create=(name,role,owner)=>auth.createUser({username:'monthly.'+name,display_name:'Monthly '+name,password:'Synthetic123!',role,sales_user_id:owner,is_root_admin:role==='ADMIN'});
const admin=create('admin','ADMIN'),a=create('a','SALES'),b=create('b','SALES'),client=create('client','CLIENT',a.id);create('finance','FINANCE');create('bod','BOD');
db.prepare('UPDATE users SET credit_limit_cents=100000,credit_term_days=90 WHERE id=?').run(client.id);
db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,active,client_self_purchase) VALUES ('UPS','Monthly','DMD',1,1)").run();
function order(code,purchased,priced=true){
 const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,customer,service,sub_service,supplier,workflow_status,carton_count,sales_price,base_cost,estimated_gp) VALUES (?,?,?,?,'UPS','Monthly','DMD','SALES_DRAFT',1,25,20,3)").run(code,client.id,a.id,client.display_name).lastInsertRowid);
 db.prepare('INSERT INTO order_cartons(order_id,carton_number) VALUES (?,1)').run(id);
 if(purchased)db.prepare('UPDATE orders SET service_purchased_at=?,pricing_snapshot_json=?,total_due=? WHERE id=?').run(stamp,priced?'{}':null,priced?25:0,id);
 return id;
}
const old=order('MONTHLY-HISTORY',true),pending=order('MONTHLY-UNPRICED',true,false),draft=order('MONTHLY-DRAFT',false);
const claim=require('../src/lib/cases.ts').caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[old],summary:'Open claim must not block monthly close'});
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id,created_at) VALUES (?,'ORDER_CHARGE','DEBIT',25,'ORDER',?,?)").run(client.id,String(old),stamp);
const payment=Number(db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,created_at) VALUES (?,'PAYMENT','CREDIT',10,?)").run(client.id,stamp).lastInsertRowid);
db.close();
let child,log,browser,n=0,ui=0;const check=(v,m)=>{n++;assert.ok(v,m)};
async function call(url,role,body,method){
 const r=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{...(cookies[role]?{cookie:cookies[role]}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
const cookies={};
(async()=>{try{
 await new Promise((resolve,reject)=>{const s=require('node:net').createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve))});
 log=fs.openSync(path.join(dir,'server.log'),'w');
 child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production',DMD_DB_PATH:file},stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{await fetch(base+'/api/auth/me');ready=true;break}catch{}await new Promise(r=>setTimeout(r,200))}check(ready,'Server ready');
 for(const role of ['admin','a','b','client','finance','bod']){const r=await call('/api/auth/login',null,{username:'monthly.'+role,password:'Synthetic123!'});check(r.status===200,'Login '+role);cookies[role]=r.cookie;}
 check((await call('/api/users/'+client.id,'a',{sales_user_id:b.id},'PATCH')).status===403,'Sales cannot transfer owner');
 check((await call('/api/users/'+client.id,'admin',{sales_user_id:b.id,expected_sales_user_id:a.id},'PATCH')).status===200,'Admin owner transfer');
 check((await call('/api/users/'+client.id,'admin',{sales_user_id:a.id,expected_sales_user_id:a.id},'PATCH')).status===409,'Stale transfer rejected');
 const history=await call('/api/users/'+client.id,'admin');check(history.data.items.length===1&&history.data.items[0].actor_id===admin.id,'One owner audit with actor');
 check((await call('/api/users/'+client.id,'b')).status===403,'Owner audit Admin only');
 check((await call('/api/purchase-jobs','a',{action:'purchase',order_id:draft})).status===400,'Old Sales loses purchase access');
 check((await call('/api/purchase-jobs','b',{action:'purchase',order_id:draft})).status===200,'New Sales can purchase');
 const report=await call('/api/bod-finance-report?month='+month+'&months=12','bod');
 check(report.status===200&&report.data.trend.length===12,'Monthly trend API');
 check(report.data.by_sales[0].key===String(a.id),'Historical report stays with original Sales');
 const reviews=await call('/api/commission-review?month='+month,'admin');
 check(reviews.status===200&&reviews.data.performance.some(x=>x.category==='PENDING_CLAIM'&&x.order_ids.includes(old)),'Monthly report separates pending Claim');
 check((await call('/api/commission-review','a')).status===403,'Sales cannot read payroll inputs');
 check((await call('/api/commission-review','client',{order_id:old})).status===403,'Client cannot approve commission');
 check((await call('/api/commission-review','admin',{order_id:old})).status===410,'Per Order commission approval retired');
 for(const role of ['admin','a','b','client'])check((await call('/api/bod-finance-report?month='+month,role)).status===403,'GP Net privacy '+role);
 for(const role of ['a','b','client','bod'])check((await call('/api/statements-v2',role,{action:'monthly_close',through_month:month})).status===403,'Monthly close restricted '+role);
 let result=await call('/api/statements-v2','finance',{action:'monthly_close',through_month:month});
 check(result.status===200&&result.data.items[0].status==='REVIEW'&&result.data.items[0].reason.includes('Payment'),'Payment gate Review');
 check((await call('/api/payment-reconciliation','finance',{action:'reconcile',status:'CONFIRMED',request_key:'monthly-confirm',reason:'Matched fixture',rows:[{ledger_id:payment,expected_event_id:0}]})).status===200,'Reconcile Payment');
 result=await call('/api/statements-v2','finance',{action:'monthly_close',through_month:month});
 check(result.data.items[0].status==='REVIEW'&&result.data.items[0].reason.includes('giá'),'Price gate Review');
 const d=new(require('better-sqlite3'))(file);d.prepare("UPDATE orders SET pricing_snapshot_json='{}',total_due=25 WHERE id=?").run(pending);check(d.prepare('SELECT sales_user_id FROM orders WHERE id=?').get(draft).sales_user_id===b.id,'Purchase snapshots new Sales');d.close();
 const closes=await Promise.all(Array.from({length:5},()=>call('/api/statements-v2','finance',{action:'monthly_close',through_month:month})));
 check(closes.every(r=>r.status===200),'Concurrent monthly HTTP retries');
 const issued=await call('/api/statements-v2?client_id='+client.id,'client');
 check(issued.data.items.length===1&&issued.data.items[0].disputed&&issued.data.items[0].claim_ids.includes(claim.id),'One immutable close while Claim remains open');
 check((await call('/api/statements-v2?monthly_review=1','admin')).data.items.length===0,'Review cleared');
 const issuedBefore=JSON.stringify(issued.data.items[0]);
 check((await call('/api/statements-v2','finance',{action:'monthly_close',through_month:month})).data.items.length===0,'Retry no duplicate');
 check(JSON.stringify((await call('/api/statements-v2?client_id='+client.id,'client')).data.items[0])===issuedBefore,'Snapshot stable across retries');
 check((await call('/api/statements-v2?client_id='+client.id,'a')).status===400,'Former Sales loses current Client reads');
 check((await call('/api/statements-v2?client_id='+client.id,'b')).status===200,'New Sales current Client reads');
 if(process.env.DMD_BROWSER_CHECK==='1'){
 const {chromium}=require(process.env.DMD_PLAYWRIGHT_MODULE||'playwright');
 console.log('HTTP assertions passed; starting browser');
 browser=await chromium.launch({timeout:30000,args:['--disable-gpu'],headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const evidence=path.join(root,'docs/Feature/evidence/sales-monthly-20261027');fs.mkdirSync(evidence,{recursive:true});
 for(const width of [1440,390])for(const role of ['admin','bod','finance']){
 const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:'dmd_session',value:cookies[role].split('=')[1],url:base}]);
 console.log('Browser '+role+' '+width);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'domcontentloaded',timeout:15000});console.log('Loaded '+role);
 if(role==='admin'){
 await page.getByRole('heading',{name:'Hoa hồng — Báo cáo Sales theo tháng',exact:true}).waitFor();
 await page.locator('input[type=month]').fill(month);
 await page.getByRole('heading',{name:'Performance — tháng mua',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Duyệt bổ sung',exact:true}).count(),0);ui++;
 assert.ok(await page.getByText('Claim chờ quyết định',{exact:false}).count());ui++;
 assert.equal(await page.getByRole('columnheader',{name:'Original GP Base',exact:true}).count(),2);ui++;
 }else if(role==='bod'){
 await page.getByRole('button',{name:'BOD Finance',exact:true}).click();
 await page.locator('input[type=month]').fill(month);await page.getByLabel('Xu hướng').selectOption('12');
 await page.getByRole('button',{name:'Xem kết quả kinh doanh',exact:true}).click();await page.getByRole('heading',{name:'Xu hướng 12 tháng',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Theo Sales',exact:true}).count(),1);ui++;
 }else{
 await page.getByRole('button',{name:'Statement',exact:true}).press('Enter',{timeout:45000});console.log('Opened Statement');
 await page.getByText('Đóng Statement tháng · Admin Review',{exact:true}).press('Enter',{timeout:45000});console.log('Opened Review');
 await page.getByRole('button',{name:'Chạy đóng tháng',exact:true}).waitFor();ui++;
 assert.ok(await page.getByText('Không có ngoại lệ đã ghi nhận.',{exact:true}).count());ui++;
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No page horizontal overflow '+role+' '+width);ui++;
 assert.deepEqual(errors,[],'No browser errors');ui++;
 await page.screenshot({path:path.join(evidence,role+'-'+width+'.png'),fullPage:true});await context.close();
 }
 await browser.close();browser=null;
 }
 console.log('SALES MONTHLY HTTP PASS ('+n+' assertions), BROWSER '+ui+' assertions; evidence '+dir);
}catch(e){console.error(e);throw e;}finally{
 if(browser)await browser.close();if(child){child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r))}if(log)fs.closeSync(log);
 // Keep isolated evidence/logs for reproducibility; no real DB was opened.
}})().catch(e=>{console.error(e);process.exitCode=1});
