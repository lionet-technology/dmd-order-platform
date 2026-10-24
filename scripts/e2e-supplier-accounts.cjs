const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"dmd-supplier-ui-")),"test.db");
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

const {db}=require('../src/lib/db.ts');
const {createUser}=require('../src/lib/auth.ts');

const {createSession}=require('../src/lib/auth.ts');
const {supplierAccountAction}=require('../src/lib/supplier-account.ts');
const {spawn}=require('node:child_process');
const net=require('node:net');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DMD_BROWSER_NODE_MODULES||root]}));
const finance=createUser({username:'synthetic.finance',display_name:'Synthetic Finance',password:'TestPass123!',role:'FINANCE'});
const admin=createUser({username:'synthetic.admin',display_name:'Synthetic Admin',password:'TestPass123!',role:'ADMIN'});
const sales=createUser({username:'synthetic.sales',display_name:'Synthetic Sales',password:'TestPass123!',role:'SALES'});
const _client=createUser({username:'synthetic.client',display_name:'Synthetic Client',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
const supplier=db.prepare("SELECT value FROM enum_values WHERE enum_type='SUPPLIER' AND active=1 LIMIT 1").get().value;
supplierAccountAction(finance,{supplier,action:'opening',amount:100,direction:'NEGATIVE',request_key:'ui-opening',reason:'Synthetic opening',reference:'synthetic-opening'});
const claimId=Number(db.prepare("INSERT INTO supplier_claims(supplier,amount_cents,reason,evidence,actor_id) VALUES (?,30000,'Synthetic partial claim','Supplier correspondence',?)").run(supplier,finance.id).lastInsertRowid);
const financeToken=createSession(finance.id).token,adminToken=createSession(admin.id).token;
db.close();
let browser,server;let checks=0;function assert(v,m){checks++;if(!v)throw Error(m)}
async function main(){
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base='http://127.0.0.1:'+port,log=fs.openSync(path.join(path.dirname(dbPath),'server.log'),'a');
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,DMD_DB_PATH:dbPath},stdio:['ignore',log,log]});
 for(let i=0;i<120;i++){try{const r=await fetch(base);if(r.ok)break;}catch{}if(server.exitCode!==null)throw Error('Synthetic server failed');await new Promise(r=>setTimeout(r,250));}
 console.log('Synthetic server ready; launching Chrome');
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
 console.log('Chrome ready');
 const evidence=path.join(root,'docs/Feature/evidence/supplier-receivables-20261024');fs.mkdirSync(evidence,{recursive:true});
 const errors=[];
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'dmd_session',value:financeToken,url:base}]);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('heading',{name:'Supplier · Tổng quan'}).waitFor();
 await page.screenshot({path:path.join(evidence,'supplier-desktop.png'),fullPage:true});
 await page.getByRole('button').filter({hasText:supplier}).first().click();
 await page.getByRole('button',{name:'Balance / Add-on',exact:true}).click();
 await page.getByLabel('Thao tác').selectOption('addon');
 await page.getByLabel('Số tiền USD',{exact:true}).fill('10');
 await page.getByLabel('Chiều').selectOption('BUY');
 await page.getByLabel('Mã chứng từ / tham chiếu',{exact:true}).fill('ui-buy');
 await page.getByLabel('Lý do',{exact:true}).fill('Synthetic purchase');
 await page.getByRole('button',{name:'Lưu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Đã lưu'}).waitFor();
 let report=await (await page.request.get(base+'/api/supplier-accounts')).json();
 assert(report.suppliers.find(s=>s.supplier===supplier).balance_cents===-11000,'UI buy signed');
 await page.getByLabel('Chiều').selectOption('SELL');
 await page.getByLabel('Số tiền USD',{exact:true}).fill('25');
 await page.getByLabel('Mã chứng từ / tham chiếu',{exact:true}).fill('ui-sell');
 await page.getByRole('button',{name:'Lưu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Đã lưu'}).waitFor();
 report=await (await page.request.get(base+'/api/supplier-accounts')).json();
 assert(report.suppliers.find(s=>s.supplier===supplier).balance_cents===-8500,'UI sell signed');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(evidence,'supplier-mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Supplier mobile no page overflow');
 await page.getByRole('button',{name:'Claims / Refunds',exact:true}).click();
 await page.getByText('Đánh dấu Tracking trước, gom nhiều Tracking vào claim.',{exact:false}).waitFor();
 await page.getByLabel('Thao tác').selectOption('claim_status');
 await page.locator('select[name=claim_id]').selectOption(String(claimId));
 await page.locator('select[name=status]').selectOption('APPROVED');
 await page.getByLabel('Final Approved Amount',{exact:false}).fill('200');
 await page.getByLabel('Evidence / chứng từ',{exact:true}).fill('Supplier final approval');
 await page.getByLabel('Mã chứng từ / tham chiếu',{exact:true}).fill('ui-approval');
 await page.getByLabel('Lý do',{exact:true}).fill('Partial approval 200 of 300');
 await page.getByRole('button',{name:'Lưu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Đã lưu'}).waitFor();
 await page.getByLabel('Thao tác').selectOption('claim_settle');
 async function settle(kind,amount,reference){
 await page.locator('select[name=claim_id]').selectOption(String(claimId));
 await page.locator('select[name=settlement]').selectOption(kind);
 await page.getByLabel('Số tiền USD',{exact:true}).fill(amount);
 await page.getByLabel('Evidence / chứng từ',{exact:true}).fill('Synthetic agreement / bank proof');
 await page.getByLabel('Mã chứng từ / tham chiếu',{exact:true}).fill(reference);
 await page.getByLabel('Lý do',{exact:true}).fill('Synthetic settlement');
 await page.getByRole('button',{name:'Lưu',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Đã lưu'}).waitFor();
 }
 await settle('OFFSET','100','ui-offset');
 await settle('REFUND_RECEIVED','50','ui-bank');
 report=await (await page.request.get(base+'/api/supplier-accounts')).json();
 const claim=report.claims.find(c=>c.id===claimId);
 assert(claim.outstanding_cents===5000&&claim.offset_cents===10000&&claim.received_cents===5000,'UI partial receivable equation');
 assert(claim.status==='PARTIALLY_SETTLED','UI synchronized partial status');
 assert(report.suppliers.find(s=>s.supplier===supplier).balance_cents===1500,'UI only offset moves Balance');
 await page.getByText('Còn phải thu $50.00',{exact:false}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Claim mobile no overflow');
 await page.screenshot({path:path.join(evidence,'supplier-claims-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:path.join(evidence,'supplier-claims-desktop.png'),fullPage:true});
 await settle('REFUND_RECEIVED','50','ui-bank-final');
 report=await (await page.request.get(base+'/api/supplier-accounts')).json();
 assert(report.claims.find(c=>c.id===claimId).status==='CLOSED','UI last settlement closes');
 await page.screenshot({path:path.join(evidence,'supplier-claims-closed-desktop.png'),fullPage:true});
 console.log('Supplier UI passed');
 await context.close();
 const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await adminContext.addCookies([{name:'dmd_session',value:adminToken,url:base}]);
 const cp=await adminContext.newPage();cp.on('pageerror',e=>errors.push(e.message));await cp.goto(base);
 console.log('Admin session status', (await (await cp.request.get(base+'/api/auth/status')).json()).user?.role);
 await cp.screenshot({path:path.join(evidence,'client-before-navigation.png'),fullPage:true});
 await cp.getByRole('button',{name:'Balance Ledger',exact:true}).first().click();
 await cp.getByRole('button',{name:'Xem dòng tiền · Synthetic Client',exact:true}).click();
 await cp.getByRole('heading',{name:'Synthetic Client',exact:true}).waitFor();
 await cp.getByRole('button',{name:'Statement',exact:true}).click();
 await cp.getByRole('heading',{name:/Statement/}).waitFor();
 assert(await cp.locator('select[aria-label="Client tài chính"]').count()===0,'Statement stays scoped to Client');
 await cp.getByRole('button',{name:'Balance / Ledger',exact:true}).click();
 await cp.screenshot({path:path.join(evidence,'client-desktop.png'),fullPage:true});
 await cp.setViewportSize({width:390,height:844});
 await cp.screenshot({path:path.join(evidence,'client-mobile.png'),fullPage:true});
 assert(await cp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Client mobile no page overflow');
 await cp.getByRole('button',{name:'← Tổng quan Client',exact:true}).click();
 await cp.getByRole('heading',{name:'Synthetic Client',exact:true}).waitFor({state:'hidden'});
 assert(errors.length===0,'No browser errors: '+errors.join('; '));
 console.log('SUPPLIER / CLIENT UI PASS ('+checks+' assertions) · '+evidence);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill();});
