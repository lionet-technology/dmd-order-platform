const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-bulk-ux-'));process.env.DMD_DB_PATH=path.join(tmp,'test.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs');seed();
const {db}=require('../src/lib/db.ts'),drafts=require('../src/lib/client-drafts.ts'),{createSession,createUser}=require('../src/lib/auth.ts'),{accountFinancials}=require('../src/lib/credit.ts'),{NextRequest}=require('next/server');
const api=require('../src/app/api/client-drafts/route.ts'),orders=require('../src/app/api/orders/route.ts');
const admin=db.prepare("SELECT * FROM users WHERE role='ADMIN'").get(),sales=db.prepare("SELECT * FROM users WHERE role='SALES'").get(),clients=db.prepare("SELECT * FROM users WHERE role='CLIENT' ORDER BY id").all(),client=clients[0],route=db.prepare("SELECT * FROM service_route_configs WHERE sub_service='Standard' AND supplier='DMD'").get();
const row={country:'US',carton_count:1,weight:.05,length:10,width:5,height:3,recipient_name:'Ann',address1:'100 Main St',city:'Houston',state:'TX',zip:'77002',phone:'2025550100',item:'Shirt',material:'Cotton'};
let checks=0;function check(v,m){checks++;assert.ok(v,m)}
const cookies=new Map();function cookie(user){if(!cookies.has(user.id))cookies.set(user.id,'dmd_session='+createSession(user.id).token);return cookies.get(user.id)}
function req(method,body,user,url='http://local/api/client-drafts'){return new NextRequest(url,{method,headers:{cookie:cookie(user),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}
async function post(body,user=client){const r=await api.POST(req('POST',{client_id:client.id,...body},user));return {status:r.status,data:await r.json()}}
function save(name,extra={},actor=client){return drafts.saveDrafts(actor,client.id,route.id,[{...row,order_id:name,...extra}])[0]}
async function main(){
 const missingId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,active,client_self_purchase,pricing_engine) VALUES ('ePacket','NoPrice','DMD',1,1,'EPACKET_US')").run().lastInsertRowid);
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','NoPrice',1,0)").run(client.id);
 const missing=drafts.saveDrafts(admin,client.id,missingId,[{...row,order_id:'NO-PRICE'}])[0];check(missing.error_group==='SYSTEM','missing pricing classified system');
 const noPrice=drafts.submitDrafts(client,[missing.draft_id]);check(noPrice.failures[0].error_group==='SYSTEM','missing pricing submission system group');
 const systemFilter=await api.GET(req('GET',null,client,'http://local/api/client-drafts?errorGroup=SYSTEM&pageSize=1000'));const systemData=await systemFilter.json();check(systemData.items.some(d=>d.draft_id===missing.draft_id),'system advanced filter includes pricing failure');
 const preview=await post({action:'preview',route_id:route.id,rows:[{...row,order_id:'SAFE-PREVIEW',supplier:'PRIVATE',net:123,base_cost:50}]});check(preview.status===200&&!/"(supplier|net|base_cost)"/.test(JSON.stringify(preview.data)),'preview whitelists client input fields');
 const before=db.prepare('SELECT count(*) n FROM orders').get().n;
 const batch=drafts.saveDrafts(client,client.id,route.id,Array.from({length:100},(_,i)=>({...row,order_id:'BATCH-'+i,...(i>=92?{address1:''}:{})})));
 let result=drafts.submitDrafts(client,batch.map(d=>d.draft_id));check(result.orders.length===92&&result.failures.length===8,'100-order partial result 92/8');
 check(db.prepare('SELECT count(*) n FROM orders').get().n===before+92,'no rollback successful siblings');check(result.orders.every(o=>o.system_order_code&&o.draft_id),'success includes DMD ID and source Draft');
 check(result.failures.every(f=>db.prepare('SELECT failure_reason FROM client_order_drafts WHERE id=?').get(f.draft_id).failure_reason),'all failures persisted immediately');
 const reserveCount=db.prepare("SELECT count(*) n FROM purchase_reserves WHERE status='RESERVED'").get().n;
 result=drafts.submitDrafts(client,batch.slice(0,92).map(d=>d.draft_id));check(result.orders.length===92,'purchase replay idempotent');check(db.prepare("SELECT count(*) n FROM purchase_reserves WHERE status='RESERVED'").get().n===reserveCount,'replay has one reserve per order');
 const keyed=save('KEYED',{request_key:'stable-row'}),keyedAgain=save('KEYED',{request_key:'stable-row'});check(keyed.draft_id===keyedAgain.draft_id,'save retry keyed row does not duplicate Draft');
 const bought=drafts.submitDrafts(client,[keyed.draft_id]).orders[0];const replay=save('KEYED',{request_key:'stable-row'});check(replay.readonly&&replay.submitted_order_id===bought.id,'save replay restores submitted read-only row');
 const snapshot=db.prepare('SELECT * FROM orders WHERE id=?').get(bought.id);
 const immutable=save('ATTEMPTED-EDIT',{draft_id:keyed.draft_id,weight:4});check(immutable.readonly&&db.prepare('SELECT pricing_snapshot_json FROM orders WHERE id=?').get(bought.id).pricing_snapshot_json===snapshot.pricing_snapshot_json,'submitted row cannot mutate pricing/input');
 const outsider=createUser({username:'outside.sales',display_name:'Outside',password:'Demo12345!',role:'SALES'});
 assert.throws(()=>drafts.saveDrafts(outsider,client.id,route.id,[row]));checks++;
 assert.throws(()=>drafts.saveDrafts(clients[1],clients[1].id,route.id,[{...row,draft_id:keyed.draft_id}]));checks++;
 const ownOther=drafts.saveDrafts(clients[1],clients[1].id,route.id,[{...row,order_id:'BATCH-0'}])[0];check(drafts.submitDrafts(clients[1],[ownOther.draft_id]).orders.length===1,'Client+Client Order ID scope permits same ID across clients');
 const duplicate=save('BATCH-0');let list=drafts.listDrafts(client);const dupView=list.find(d=>d.draft_id===duplicate.draft_id);check(dupView.draft_state==='needs_fix'&&dupView.error_group==='DATA','placed duplicate in data filter');check(dupView.reasons.join(' ').includes('Tracking')&&dupView.reasons.join(' ').includes('DMD ID'),'duplicate reasons include identifiers');
 const staff=save('STAFF-CONFIRM',{},sales);check(drafts.submitDrafts(sales,[staff.draft_id]).orders.length===1,'assigned Sales can confirm Client Draft');
 check(db.prepare("SELECT actor_id FROM client_draft_audit WHERE draft_id=? AND action='SUBMIT'").get(staff.draft_id).actor_id===sales.id,'staff submission audited');
 const sys=save('SYS-TXN'),sibling=save('SYS-SIBLING');
 db.exec("CREATE TRIGGER bulk_failure BEFORE UPDATE OF pricing_snapshot_json ON orders WHEN NEW.order_id='SYS-TXN' AND NEW.pricing_snapshot_json IS NOT NULL BEGIN SELECT RAISE(ABORT,'test transaction failure');END;");
 result=drafts.submitDrafts(client,[sys.draft_id,sibling.draft_id]);check(result.orders.length===1&&result.failures.length===1,'backend failure does not roll back sibling');check(result.failures[0].error_group==='SYSTEM','transaction failure system group');
 check(!db.prepare("SELECT id FROM orders WHERE order_id='SYS-TXN'").get(),'failed order creation rolled back independently');
 check(drafts.listDrafts(client).find(d=>d.draft_id===sys.draft_id).error_group==='SYSTEM','persisted system filter');
 db.exec('DROP TRIGGER bulk_failure');check(drafts.submitDrafts(client,[sys.draft_id]).orders.length===1,'explicit retry succeeds after system recovery');
 const financial=accountFinancials(client.id),price=Math.round(save('PRICE-QUOTE').pricing.total_charge*100);
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount) VALUES (?,'ADJUSTMENT_DEBIT','DEBIT',?)").run(client.id,(financial.available_to_buy_cents-price-1)/100);
 const low=drafts.saveDrafts(client,client.id,route.id,[{...row,order_id:'LOW-1'},{...row,order_id:'LOW-2'}]);
 result=drafts.submitDrafts(client,low.map(d=>d.draft_id));check(result.orders.length===1&&result.failures.length===1,'sequential reserve enforces latest available balance');check(result.failures[0].error.includes('thiếu')&&result.failures[0].error_group==='DATA','specific shortage is a data error');
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount) VALUES (?,'PAYMENT','CREDIT',100)").run(client.id);check(!db.prepare('SELECT submitted_order_id FROM client_order_drafts WHERE id=?').get(low[1].draft_id).submitted_order_id,'balance change never automatically retries');
 check(drafts.submitDrafts(client,[low[1].draft_id]).orders.length===1,'selected failed only retry');
 const allBad=drafts.saveDrafts(client,client.id,route.id,[{order_id:'BAD-1'},{order_id:'BAD-2'}]);result=drafts.submitDrafts(client,allBad.map(d=>d.draft_id));check(result.orders.length===0&&result.failures.length===2,'100% failure retained');
 let response=await api.GET(req('GET',null,client,'http://local/api/client-drafts?draftState=incomplete&pageSize=1000'));let data=await response.json();check(data.items.every(d=>d.draft_state==='incomplete'),'status filter');
 response=await api.GET(req('GET',null,client,'http://local/api/client-drafts?errorGroup=DATA&pageSize=1000'));data=await response.json();check(data.items.length>0&&data.items.every(d=>d.error_group==='DATA'),'data group filter');
 const serialized=JSON.stringify(data);check(!/"(net|base|markup|supplier|base_cost|pricing_snapshot_json|commission_basis)"/.test(serialized),'Client payload hides finance internals');
 const searched=await api.GET(req('GET',null,client,'http://local/api/client-drafts?q=BAD-1'));check((await searched.json()).total===1,'Client Order ID search');
 const staffNoClient=await post({action:'delete',all:true,client_id:0},sales);check(staffNoClient.status===400,'staff cannot delete without selected Client');
 const wrongPurchase=await post({action:'purchase',ids:[ownOther.draft_id]});check(wrongPurchase.status===400,'purchase endpoint scopes exact Client');
 const wrongSave=await post({action:'save',route_id:route.id,rows:[{...row,draft_id:keyed.draft_id}],client_id:clients[1].id},clients[1]);check(wrongSave.status===400,'submitted foreign Draft response cannot leak');
 const toDelete=save('DELETE-ME');const deleted=await post({action:'delete',ids:[toDelete.draft_id]},sales);check(deleted.data.deleted===1,'staff selected deletion');check(db.prepare("SELECT actor_id FROM client_draft_audit WHERE draft_id=? AND action='DELETE'").get(toDelete.draft_id).actor_id===sales.id,'staff deletion audit');
 const mainOrders=await orders.GET(req('GET',null,client,'http://local/api/orders'));data=await mainOrders.json();check(data.items.every(o=>o.workflow_status!=='SALES_DRAFT'),'All Orders excludes Draft');
 const form=new FormData();form.set('route_id',String(route.id));form.set('file',new File(['order_id,weight,length,width,height,carton_count,recipient_name,address1,city,state,zip,country,phone,item,material\nCSV-UX,0.05,10,5,3,1,Ann,100 Main St,Houston,TX,77002,US,2025550100,Shirt,Cotton'],'input.csv'));
 response=await api.POST(new NextRequest('http://local/api/client-drafts',{method:'POST',headers:{cookie:cookie(client)},body:form}));data=await response.json();check(response.status===200&&data.rows[0].pricing.eligible,'CSV preview route/price');
 const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Orders');const input={...row,order_id:'XLSX-UX'};sheet.addRow(Object.keys(input));sheet.addRow(Object.values(input));const upload=new FormData();upload.set('route_id',String(route.id));upload.set('file',new File([Buffer.from(await book.xlsx.writeBuffer())],'input.xlsx'));
 response=await api.POST(new NextRequest('http://local/api/client-drafts',{method:'POST',headers:{cookie:cookie(client)},body:upload}));data=await response.json();check(response.status===200&&data.rows[0].pricing.eligible,'XLSX preview');
 check(db.prepare('PRAGMA foreign_key_check').all().length===0,'FK integrity');console.log('DRAFT BULK UX PASS ('+checks+' assertions)');
}
main().finally(()=>{db.close();fs.rmSync(tmp,{recursive:true,force:true})}).catch(e=>{console.error(e);process.exitCode=1});
