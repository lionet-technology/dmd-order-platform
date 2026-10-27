// Real localhost HTTP + browser interactions, exclusively on an owned temporary DB.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-bulk-uat-')),root=path.resolve(__dirname,'..');
process.env.DMD_DB_PATH=path.join(dir,'fixture.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs');seed();
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts');
const users={};for(const role of ['ADMIN','SALES','CLIENT'])users[role]=db.prepare('SELECT * FROM users WHERE role=? ORDER BY id LIMIT 1').get(role);
for(const role of ['WAREHOUSE','BOD','FINANCE'])users[role]=auth.createUser({username:'bulk.'+role,display_name:role,password:'Synthetic123!',role});
db.prepare("INSERT OR IGNORE INTO service_route_configs(service,sub_service,supplier,client_self_purchase,max_cartons_per_order) VALUES ('UPS','','DMD',1,3)").run();
db.prepare("INSERT INTO client_service_settings(client_user_id,service,is_enabled,default_supplier) VALUES (?,'UPS',1,'DMD')").run(users.CLIENT.id);
const cookies=Object.fromEntries(Object.entries(users).map(([role,u])=>[role,'dmd_session='+auth.createSession(u.id).token]));
const evidence=path.join(root,'docs/Feature/evidence/egress-20261027');fs.mkdirSync(evidence,{recursive:true});
let checks=0,browser,child;const pageErrors=[];const check=(v,m)=>{assert.ok(v,m);checks++;console.log('PASS '+m)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
const port=await new Promise(resolve=>{const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})}),base='http://127.0.0.1:'+port;
const log=fs.openSync(path.join(dir,'server.log'),'a');
child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:['ignore',log,log]});
let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{await fetch(base+'/api/auth/status');ready=true;break}catch{}await pause(250)}check(ready,'fixture HTTP ready');
const {chromium}=require(process.env.DMD_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function pageFor(role,width){const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});await context.addCookies([{name:'dmd_session',value:cookies[role].split('=')[1],url:base}]);const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>pageErrors.push(role+': '+e.message));await page.goto(base,{waitUntil:'networkidle'});return {page,context}}
async function fit(page,label){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' page fits');check(await page.locator('.modalPanel').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})),label+' modal fits');}
for(const width of [1440,390]){
 const {page,context}=await pageFor('CLIENT',width);
 check(await page.getByRole('button',{name:'Dịch vụ',exact:true}).count()===0,'Client setup hidden '+width);
 await page.getByRole('button',{name:/Tạo \/ Import/}).click();
 const panel=page.locator('.clientPurchase');
 const standard=await panel.locator('select option').evaluateAll(es=>es.find(e=>e.textContent.includes('Standard'))?.value);await panel.locator('select').first().selectOption(standard);
 const fields=['order_id','weight','length','width','height','carton_count','recipient_name','address1','address2','city','state','zip','country','phone','recipient_email','item','material','declared_value'];
 const codes=['BROWSER-'+width+'-A','BROWSER-'+width+'-B'];
 const tsv=codes.map(order_id=>{const r={order_id,weight:.5,length:10,width:5,height:3,carton_count:1,recipient_name:'Browser Recipient',address1:'42 Broadway',city:'New York',state:'NY',zip:'10001',country:'US',phone:'2025550100',item:'Shirt',material:'Cotton',declared_value:10};return fields.map(k=>r[k]??'').join('\t')}).join('\n');
 // Dispatch a genuine ClipboardEvent carrying TSV through the component's onPaste.
 if(await panel.locator('tbody tr').count()!==2)await panel.locator('textarea').evaluate((el,text)=>{const data=new DataTransfer();data.setData('text',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}))},tsv);
 check(await panel.locator('tbody tr').count()===2,'bulk TSV creates two table rows '+width);
 await panel.getByRole('button',{name:'Lưu Draft (2)',exact:true}).click();await panel.getByText('Chọn Draft đặt mua',{exact:true}).waitFor();
 const rows=db.prepare('SELECT id,order_id FROM orders WHERE order_id IN (?,?) ORDER BY order_id').all(...codes);check(rows.length===2,'UI saved both Drafts '+width);
 db.prepare('UPDATE orders SET weight=11 WHERE id=?').run(rows[1].id);
 await panel.getByRole('button',{name:'Đặt mua dịch vụ (2)',exact:true}).click();await panel.getByRole('alert').waitFor();
 check((await panel.getByRole('status').innerText()).includes('Đã mua 1 đơn; 1 đơn chưa mua'),'partial purchase failure visible '+width);
 check(await panel.locator('.clientPurchaseSelections input:checked').count()===0,'failed purchase requires explicit reselection '+width);
 await panel.getByLabel('Cân nặng (kg) · dòng 1',{exact:true}).fill('0.5');
 await panel.getByRole('button',{name:'Lưu Draft (1)',exact:true}).click();await panel.getByRole('button',{name:'Đặt mua dịch vụ (1)',exact:true}).waitFor();
 await panel.getByRole('button',{name:'Đặt mua dịch vụ (1)',exact:true}).click();await panel.getByRole('status').filter({hasText:'Đã mua 1 đơn; 0 đơn chưa mua'}).waitFor();
 check(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id IN (?,?)').get(...rows.map(r=>r.id)).n===2,'exactly one reserve per successful/retried Order '+width);
 await fit(page,'Client bulk '+width);await page.screenshot({path:path.join(evidence,'client-bulk-'+width+'.png'),fullPage:true});await context.close();
 const {upsertOrder}=require('../src/lib/finance.ts'),{purchaseService}=require('../src/lib/route-pricing.ts');
 for(const suffix of ['A','B']){const o=upsertOrder({client_user_id:users.CLIENT.id,customer:users.CLIENT.display_name,order_id:'MULTI-'+width+'-'+suffix,service:'UPS',supplier:'DMD',country:'US',carton_count:2,weight:2,length:20,width:10,height:5,item:'Shirt',material:'Cotton',declared_value:10,recipient_name:'Multi Recipient',address1:'42 Broadway',city:'New York',state:'NY',zip:'10001',phone:'2025550100'});require('../src/lib/order-shipments.ts').saveOrderShipmentStructure(o.id,{lot_count:1,cartons:[1,2].map(n=>({carton_number:n,lot_number:1,weight:1,length:10,width:10,height:5,items:[{description:'Shirt',material:'Cotton',quantity:1,unit_manufacturing_value:5}]}))});purchaseService(o.id,{id:users.CLIENT.id,role:'CLIENT'})}
 const admin=await pageFor('ADMIN',width),p=admin.page;p.on('response',async r=>{if(r.url().includes('/api/orders/tracking-queue')&&r.request().method()==='POST')console.log('SAVE RESPONSE '+r.status()+' '+await r.text())});await p.getByRole('button',{name:'Orders',exact:true}).click();await p.getByRole('button',{name:'▦ Mua đơn hàng loạt',exact:true}).click();
 const sheet=p.locator('.bulkSheet');await sheet.locator('tbody tr').first().waitFor();
 await sheet.locator('.bulkFilterField').filter({hasText:'Dịch vụ'}).locator('select').selectOption('UPS');await sheet.locator('.bulkFilterField').filter({hasText:'Sub-Service'}).locator('select').selectOption('');await pause(400);
 check(await sheet.locator('tbody tr').count()===4,'two multi-Carton Orders form four queue rows '+width);check(await sheet.locator('tbody tr.orderGroupStart').count()===2&&await sheet.locator('td[rowspan="2"]').count()>=2,'Order fields span both Cartons '+width);
 const colors=await sheet.locator('tbody tr td:first-child').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).backgroundColor))]);check(colors.length===2,'alternating Order colors '+width);
 await sheet.getByText(/Chọn tất cả .* Order sau filter/).click();
 const downloadEvent=p.waitForEvent('download');await sheet.getByRole('link',{name:'Tải file Tracking',exact:true}).click();const download=await downloadEvent,file=path.join(dir,'tracking-'+width+'.xlsx');await download.saveAs(file);
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.readFile(file);const ws=wb.worksheets[0],headers=ws.getRow(1).values;console.log('TRACKING HEADERS '+JSON.stringify(headers));
 check(ws.rowCount>=3,'actual Tracking workbook contains filtered rows '+width);
 const n=await sheet.locator('tbody tr').count();
 for(let row=2;row<=ws.rowCount;row++){ws.getRow(row).getCell(headers.indexOf('Giá bán thủ công (USD/Order)')).value='35';ws.getRow(row).getCell(headers.indexOf('Tracking')).value='BULK-'+width+'-'+(row-2);ws.getRow(row).getCell(headers.indexOf('URL Label')).value=base+'/templates/demo-usps-label.svg'}
 await wb.xlsx.writeFile(file);await sheet.locator('input[type=file]').setInputFiles(file);await sheet.locator('.bulkSheetFooter').filter({hasText:'Đã nạp file vào sheet'}).waitFor();
 check(await sheet.locator('tbody tr').first().locator('td').last().locator('input').inputValue()===base+'/templates/demo-usps-label.svg','actual workbook upload populates Tracking/Label '+width);
 const pasted=Array.from({length:n},(_,i)=>'BULK-'+width+'-'+i+'\t'+base+'/templates/demo-usps-label.svg').join('\n');
 await sheet.locator('.bulkPasteBar textarea').fill(pasted);await sheet.getByRole('button',{name:'Áp dụng vào sheet',exact:true}).click();
 check(await sheet.locator('tbody tr').first().locator('td').last().locator('input').inputValue()===base+'/templates/demo-usps-label.svg','bulk Tracking/Label paste applied '+width);
 await fit(p,'Admin Tracking '+width);await p.screenshot({path:path.join(evidence,'admin-tracking-'+width+'.png'),fullPage:true});
 db.exec("CREATE TRIGGER uat_failure BEFORE INSERT ON order_trackings WHEN NEW.tracking='BULK-"+width+"-3' BEGIN SELECT RAISE(ABORT,'synthetic UAT retry'); END");
 await sheet.getByRole('button',{name:'Lưu Tracking/Label',exact:true}).click();await sheet.locator('.bulkSheetFooter').filter({hasText:'synthetic UAT retry'}).waitFor();
 check(db.prepare('SELECT COUNT(*) n FROM order_trackings WHERE tracking LIKE ?').get('BULK-'+width+'-%').n===0,'failed bulk save rolls back all Tracking '+width);
 check(await sheet.locator('tbody tr').first().locator('td').last().locator('input').inputValue()===base+'/templates/demo-usps-label.svg','failed bulk save preserves typed data '+width);
 db.exec('DROP TRIGGER uat_failure');
 await sheet.getByRole('button',{name:'Lưu Tracking/Label',exact:true}).click();await sheet.locator('.bulkSheetFooter').filter({hasText:/Đã lưu/}).waitFor();
 const charges=db.prepare("SELECT e.amount FROM ledger_entries e JOIN orders o ON e.reference_id=CAST(o.id AS TEXT) WHERE e.entry_type='ORDER_CHARGE' AND e.reference_type='ORDER' AND o.order_id LIKE ?").all('MULTI-'+width+'-%');check(charges.length===2&&charges.every(c=>c.amount===35),'multi-Carton purchase charges 35 once per Order '+width);
 check(db.prepare('SELECT COUNT(*) n FROM order_trackings WHERE tracking LIKE ?').get('BULK-'+width+'-%').n===n,'UI save persists every filtered Tracking '+width);
 await p.locator('.modalHeader button').click();await p.getByRole('button',{name:'Dịch vụ',exact:true}).click();await p.locator('.routeTable tbody tr').filter({hasText:'ePacket'}).first().waitFor();await fit(p,'Admin setup '+width);await p.screenshot({path:path.join(evidence,'admin-setup-'+width+'.png'),fullPage:true});await admin.context.close();
 for(const role of ['SALES','WAREHOUSE','FINANCE','BOD']){const q=await pageFor(role,width);check(await q.page.getByRole('button',{name:'Dịch vụ',exact:true}).count()===0,role+' setup hidden '+width);await fit(q.page,role+' '+width);await q.context.close()}
}
check(pageErrors.length===0,'no browser runtime errors: '+pageErrors.join('; '));
check(db.pragma('integrity_check',{simple:true})==='ok','fixture integrity');check(db.pragma('foreign_key_check').length===0,'fixture foreign keys');console.log('BULK HTTP/BROWSER PASS ('+checks+' assertions)');
}finally{if(browser)await browser.close();if(child){child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r))}db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
