// Disposable fixture: exercise actual handlers and serialized nested projections.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-supplier-privacy-'));
process.env.DMD_DB_PATH=path.join(dir,'fixture.db');process.env.NODE_ENV='test';
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),{NextRequest}=require('next/server');
const users={};for(const role of ['ADMIN','SALES','CLIENT','FINANCE','BOD'])users[role]=auth.createUser({username:'privacy.'+role,display_name:role,password:'Synthetic123!',role,sales_user_id:users.SALES?.id});
const other=auth.createUser({username:'privacy.other',display_name:'Other',password:'Synthetic123!',role:'SALES'});
const cookies=new Map(Object.values(users).concat(other).map(u=>[u.id,'dmd_session='+auth.createSession(u.id).token]));
const req=(url,u)=>new NextRequest('http://localhost'+url,{headers:{cookie:cookies.get(u.id)}});
const sentinel='PRIVATE-SUPPLIER-82731';let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++};
(async()=>{try{
db.prepare("INSERT INTO enum_values(enum_type,value) VALUES ('SUPPLIER',?)").run(sentinel);
db.prepare("INSERT INTO client_service_settings(client_user_id,service,default_supplier) VALUES (?,'UPS',?)").run(users.CLIENT.id,sentinel);
const order=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,customer,service,supplier,workflow_status,base_cost,est_net_cost,true_net_cost) VALUES ('PRIVACY-ORDER',?,?,?,'UPS',?,'PURCHASED',82731.91,82731.91,82731.91)").run(users.CLIENT.id,users.SALES.id,'Privacy Client',sentinel).lastInsertRowid);
for(const u of [users.SALES,users.CLIENT])for(const url of ['/api/enums','/api/client-services?clientUserId='+users.CLIENT.id,'/api/client-services?view=setup&clientUserId='+users.CLIENT.id]){
const api=require('../src/app/api/'+url.split('?')[0].split('/').pop()+'/route.ts'),r=await api.GET(req(url,u));check(r.status===200,'read succeeds '+u.role+url);const body=await r.text();check(!body.includes(sentinel)&&!body.includes('default_supplier')&&!body.includes('"SUPPLIER"'),'no Supplier disclosure '+u.role+url);
}
const pricing=require('../src/lib/route-pricing.ts'),tiers=require('../src/lib/epacket-pricing.ts').STANDARD.map(t=>({...t,base_rate:10}));
const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Standard','DMD')").run().lastInsertRowid),version=pricing.createPriceVersion(route,tiers,users.ADMIN.id);pricing.activatePricing(route,{price_version_id:version.id,retail_markup:10},users.ADMIN.id);
const draft=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,service,sub_service,supplier,country,carton_count,weight,length,width,height,workflow_status,sales_price) VALUES ('UNAUTHORIZED-DRAFT',?,?,'ePacket','Standard','DMD','US',1,0.05,10,5,3,'SALES_DRAFT',999)").run(users.CLIENT.id,users.SALES.id).lastInsertRowid);
check(!!pricing.orderQuote(db.prepare('SELECT * FROM orders WHERE id=?').get(draft)),'draft has active quote');
const before=JSON.stringify(db.prepare('SELECT * FROM orders WHERE id=?').get(draft));
const denied=await require('../src/app/api/orders/[id]/route.ts').GET(req('/api/orders/'+draft,other),{params:Promise.resolve({id:String(draft)})});check(denied.status===403,'unassigned detail denied');check(JSON.stringify(db.prepare('SELECT * FROM orders WHERE id=?').get(draft))===before,'denied GET cannot reprice another Client draft');
const api=require('../src/app/api/client-services/route.ts');check((await api.GET(req('/api/client-services?clientUserId='+users.CLIENT.id,other))).status===403,'unassigned Sales denied');
const admin=await api.GET(req('/api/client-services?clientUserId='+users.CLIENT.id,users.ADMIN));check((await admin.text()).includes(sentinel),'Admin routing preserved');
const {operationalProjection}=require('../src/lib/financial-privacy.ts');
const nested=operationalProjection({supplier:sentinel,default_supplier:sentinel,nested_json:JSON.stringify({supplier_account:sentinel,base_cost:123,tracking:'SAFE'}),rows:[{enum_type:'SUPPLIER',value:sentinel},{enum_type:'SERVICE',value:'UPS'}]},true);
check(!JSON.stringify(nested).includes(sentinel),'nested strings and enums fail closed');check(JSON.stringify(nested).includes('SAFE'),'operational fields retained');
if(process.env.DMD_PRIVACY_HTTP==='1'){
 const {spawn}=require('node:child_process'),root=path.resolve(__dirname,'..'),log=fs.openSync(path.join(dir,'server.log'),'a');
 const port=await new Promise(resolve=>{const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:['ignore',log,log]});let browser;
 try{
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{await fetch(base+'/api/auth/status');ready=true;break}catch{}await new Promise(r=>setTimeout(r,250))}check(ready,'HTTP ready');
 for(const u of [users.SALES,users.CLIENT])for(const url of ['/api/enums','/api/client-services?clientUserId='+users.CLIENT.id,'/api/client-services?view=setup&clientUserId='+users.CLIENT.id,'/api/orders','/api/orders/'+order,'/api/financials?client_id='+users.CLIENT.id,'/api/refunds?client_id='+users.CLIENT.id]){const r=await fetch(base+url,{headers:{cookie:cookies.get(u.id)}});check(r.status===200,'HTTP scoped read '+u.role+url);const text=await r.text();check(!text.includes(sentinel)&&!text.includes('82731.91'),'HTTP no sentinel '+u.role+url)}
 for(const u of [users.SALES,users.CLIENT])for(const url of ['/api/costs','/api/reconciliation','/api/supplier-accounts','/api/supplier-payables','/api/internal-expenses','/api/purchase-export','/api/manifest-export'])for(const method of ['GET','POST']){const r=await fetch(base+url,{method,headers:{cookie:cookies.get(u.id)}});check([403,405].includes(r.status),'HTTP private endpoint '+u.role+' '+method+url)}
 const {chromium}=require(process.env.DMD_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const evidence=path.join(root,'docs/Feature/evidence/privacy-20261027');fs.mkdirSync(evidence,{recursive:true});
 for(const role of ['ADMIN','SALES','CLIENT','FINANCE','BOD']){
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'privacy.'+role,password:'Synthetic123!'})});check(login.status===200,'HTTP login '+role);const token=(login.headers.get('set-cookie')||'').split(';')[0].split('=')[1];
 const context=await browser.newContext();await context.addCookies([{name:'dmd_session',value:token,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto(base,{waitUntil:'networkidle'});check(!(await page.locator('body').innerText()).includes('Đăng nhập hệ thống'),'authenticated page '+role);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow '+role+width);check(errors.length===0,'no page errors '+role+width);await page.screenshot({path:path.join(evidence,role+'-'+width+'.png'),fullPage:true});}
 await context.close();}
 }finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.closeSync(log)}
}
console.log('SUPPLIER PRIVACY PASS ('+checks+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
