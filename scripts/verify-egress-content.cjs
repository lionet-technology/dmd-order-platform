// All data and files belong to this fixture. Never read the operator database.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-egress-'));
process.env.DMD_DB_PATH=path.join(dir,'fixture.db');process.env.NODE_ENV='test';
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),{NextRequest}=require('next/server');
const roles=['ADMIN','SALES','CLIENT','WAREHOUSE','FINANCE','BOD'],users={};
for(const role of roles)users[role]=auth.createUser({username:'egress.'+role,display_name:role,role,password:'Synthetic123!',sales_user_id:users.SALES?.id,is_root_admin:role==='ADMIN'});
const other=auth.createUser({username:'egress.other',display_name:'Other',role:'SALES',password:'Synthetic123!'});
const cookies=new Map([...Object.values(users),other].map(u=>[u.id,'dmd_session='+auth.createSession(u.id).token]));
const supplier='CONFIDENTIAL-VENDOR-993817',cost=93817.43;
let checks=0,httpBase,server;const check=(v,m)=>{assert.ok(v,m);checks++};
function request(url,u,method='GET',body){return new NextRequest('http://localhost'+url,{method,headers:{cookie:cookies.get(u.id),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})}
async function call(route,url,u,method='GET',body,id){if(httpBase)return fetch(httpBase+url,{method,headers:{cookie:cookies.get(u.id),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return require('../src/app/api/'+route+'/route.ts')[method](request(url,u,method,body),{params:Promise.resolve({id:String(id??1)})})}
function scan(text,label){check(!text.includes(supplier)&&!text.includes(String(cost)),label+' excludes confidential values')}
(async()=>{try{
db.prepare("INSERT INTO enum_values(enum_type,value) VALUES ('SUPPLIER',?)").run(supplier);
db.prepare("INSERT INTO client_service_settings(client_user_id,service,default_supplier) VALUES (?,'UPS',?)").run(users.CLIENT.id,supplier);
const order=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,sales_user_id,customer,service,supplier,workflow_status,base_cost,est_net_cost,true_net_cost,internal_note,discount_note,discount_source) VALUES ('CONTENT-ORDER',?,?,?,'UPS',?,'PURCHASED',?,?,?,?,?,?)").run(users.CLIENT.id,users.SALES.id,'Fixture Client',supplier,cost,cost,cost,'Call recipient tomorrow.\n\nSupplier '+supplier+'; GP Net '+cost,'Base markup '+cost,supplier).lastInsertRowid);
const {caseAction,caseEvent}=require('../src/lib/cases.ts');
const c=caseAction(users.ADMIN,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[order],summary:'Recipient needs help. Supplier '+supplier+'; true cost '+cost,next_action:'Call recipient. Net cost '+cost});
caseEvent(c.id,users.ADMIN,'COMMENT',{message:'Delivery confirmed. '+supplier+'; GP Net '+cost,nested:{payload:JSON.stringify({memo:'Estimated cost '+cost+' from '+supplier})}},'PUBLIC');
if(process.env.DMD_EGRESS_HTTP==='1'){
 const port=await new Promise(resolve=>{const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});httpBase='http://127.0.0.1:'+port;
 const log=fs.openSync(path.join(dir,'server.log'),'a');server=require('node:child_process').spawn(process.execPath,[path.resolve(__dirname,'../node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'production'},stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{await fetch(httpBase+'/api/auth/status');ready=true;break}catch{}await new Promise(r=>setTimeout(r,250))}check(ready,'HTTP ready');
}
for(const u of [users.SALES,users.CLIENT]){
 for(const [route,url] of [['cases','/api/cases'],['orders','/api/orders'],['orders/[id]','/api/orders/'+order],['control-tower','/api/control-tower'],['enums','/api/enums'],['client-services','/api/client-services?clientUserId='+users.CLIENT.id],['users','/api/users'],['financials','/api/financials?client_id='+users.CLIENT.id],['refunds','/api/refunds?client_id='+users.CLIENT.id],['ledger','/api/ledger']]){
  const r=await call(route,url,u,'GET',undefined,order);check(r.status===200,u.role+' '+url+' read');scan(await r.text(),u.role+' '+url);
 }
}
const casesAdmin=await call('cases','/api/cases',users.ADMIN);check((await casesAdmin.text()).includes(supplier),'Admin retains Case text');
const salesCases=await call('cases','/api/cases',users.SALES);check((await salesCases.text()).includes('Recipient needs help'),'legitimate Case content retained');
const salesOrder=await call('orders/[id]','/api/orders/'+order,users.SALES,'GET',undefined,order);check((await salesOrder.text()).includes('Call recipient tomorrow'),'legitimate internal note retained');
const {withFinancialPrivacy}=require('../src/lib/financial-privacy.ts');
for(const u of [users.SALES,users.CLIENT]){
 const wrapped=withFinancialPrivacy(async()=>Response.json({error:'Delivery confirmed. Net price '+cost+'; '+supplier,details:[supplier,'Recipient called at 14:30; charge 25 USD'],nested_json:JSON.stringify({items:[supplier],deep:{estimated_cost:cost,gp_net:cost,net_price:cost,unit_cost:cost,base_rate:cost,markup:cost,source_code:supplier}}),label_url:'data:text/plain;base64,'+Buffer.from(supplier).toString('base64'),attachment_url:'https://files.test/'+supplier+'.pdf',download_url:'/safe/parcel.pdf'},{status:400}));
 const r=await wrapped(request('/api/cases',u));check(r.status===400,'error status preserved '+u.role);const txt=await r.text();scan(txt,'nested/error/attachment '+u.role);check(txt.includes('Delivery confirmed.')&&txt.includes('Recipient called at 14:30; charge 25 USD'),'safe text and customer charge retained '+u.role);const data=JSON.parse(txt);check(data.label_url===null&&data.attachment_url===null&&data.download_url==='/safe/parcel.pdf','unsafe/private links withheld, safe link retained '+u.role);
}
for(const u of [users.SALES,users.CLIENT,users.WAREHOUSE,users.FINANCE,users.BOD])for(const [route,url,method] of [
 ['purchase-templates','/api/purchase-templates','GET'],['purchase-template-versions/[id]/download','/api/purchase-template-versions/1/download','GET'],['purchase-template-versions/[id]/preview','/api/purchase-template-versions/1/preview','POST'],['purchase-export','/api/purchase-export','POST'],['purchase-export/generic','/api/purchase-export/generic','POST'],['manifest-export','/api/manifest-export','POST'],['orders/tracking-queue','/api/orders/tracking-queue?format=xlsx','GET'],['route-pricing','/api/route-pricing?route_id=1&download=1','GET'],['service-routes','/api/service-routes','GET']]){
 if(u.role==='WAREHOUSE'&&route==='manifest-export')continue;
 const r=await call(route,url,u,method,method==='POST'?{order_ids:[order]}:undefined);check(r.status===403,'denied '+u.role+' '+url);scan(await r.text(),'denial '+u.role+' '+url);
}
for(const u of [users.SALES,users.CLIENT,users.ADMIN,users.WAREHOUSE])for(const route of ['costs','reconciliation','supplier-payables']){
 const r=await call(route,'/api/'+route,u);check(r.status===403,'private Finance denial '+u.role+route);scan(await r.text(),'private denial');
}
const outside=await call('orders/[id]','/api/orders/'+order,other,'GET',undefined,order);check(outside.status===403,'unassigned Order denied');
const outsideCases=await call('cases','/api/cases',other);check(!(await outsideCases.text()).includes('Recipient needs help'),'unassigned Case excluded');
// Genuine binary: inspect decompressed XML and ExcelJS cell content, not compressed bytes.
const ExcelJS=require('exceljs'),JSZip=require('jszip');
db.prepare('UPDATE orders SET carton_count=1,weight=1,length=10,width=5,height=3 WHERE id=?').run(order);
const {ensureOrderShipmentStructure}=require('../src/lib/order-shipments.ts');ensureOrderShipmentStructure(order);
db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('UPS','',?)").run(supplier);
db.prepare("UPDATE orders SET service_purchased_at=CURRENT_TIMESTAMP WHERE id=?").run(order);
const binary=await call('purchase-export/generic','/api/purchase-export/generic',users.ADMIN,'POST',{order_ids:[order]});check(binary.status===200,'Admin Generic workbook succeeds: '+(binary.status===200?'':await binary.text()));
const buffer=Buffer.from(await binary.arrayBuffer()),zip=await JSZip.loadAsync(buffer),xml=(await Promise.all(Object.values(zip.files).filter(f=>!f.dir&&/\.xml$/.test(f.name)).map(f=>f.async('string')))).join('\n');
check(xml.includes(supplier),'Admin workbook retains Supplier');check(!xml.includes(String(cost)),'Admin workbook excludes Net/Base sentinel');
const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);check(workbook.worksheets[0].rowCount>=2,'workbook parsed with data rows');
for(const name of fs.readdirSync(path.join(__dirname,'../public/templates')).filter(n=>/\.xlsx$/.test(n))){const bytes=httpBase?Buffer.from(await (await fetch(httpBase+'/templates/'+name)).arrayBuffer()):fs.readFileSync(path.join(__dirname,'../public/templates',name));const z=await JSZip.loadAsync(bytes);for(const f of Object.values(z.files).filter(f=>!f.dir&&/\.xml$/.test(f.name)))scan(await f.async('string'),'public template '+name);}
console.log('EGRESS CONTENT PASS ('+checks+' assertions)');
}finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r))}db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
