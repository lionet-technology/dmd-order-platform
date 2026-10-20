const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-client-carton-api-'));process.env.DMD_DB_PATH=path.join(dir,'fixture.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs'),{db}=require('../src/lib/db.ts'),{createSession}=require('../src/lib/auth.ts'),{NextRequest}=require('next/server');
const clientAPI=require('../src/app/api/client-orders/route.ts'),routesAPI=require('../src/app/api/service-routes/route.ts');
const {parseClientFile}=require('../src/lib/client-order-import.ts'),{groupClientCartonRows}=require('../src/lib/client-carton-groups.ts');
let assertions=0;const test=(value,msg)=>{assertions++;assert.ok(value,msg)};
function request(body,user,url='http://localhost/api/client-orders'){return new NextRequest(url,{method:'POST',headers:{cookie:'dmd_session='+createSession(user.id).token,'content-type':'application/json'},body:JSON.stringify(body)})}
const base={weight:0.1,length:20,width:15,height:10,item:'Shirt',material:'Cotton',recipient_name:'Client Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',country:'US',phone:'123456'};
async function post(api,actor,route,rows,action='preview'){const response=await api.POST(request({action,route_id:route,rows},actor));return {status:response.status,data:await response.json()};}
async function main(){try{
 seed();
 const admin=db.prepare("SELECT * FROM users WHERE role='ADMIN' LIMIT 1").get(),clients=db.prepare("SELECT * FROM users WHERE username LIKE 'epacket.client.%' ORDER BY username").all(),route=db.prepare("SELECT * FROM service_route_configs WHERE service='ePacket' AND sub_service='Standard'").get();
 const ledgerBefore=db.prepare("SELECT count(*) n FROM ledger_entries WHERE client_user_id=? AND entry_type='ORDER_CHARGE'").get(clients[0].id).n;
 const xlsx=require('exceljs'),book=new xlsx.Workbook(),ws=book.addWorksheet('Orders');
 ws.addRow(['Client Order ID','Carton Quantity','Weight','Length','Width','Height','Item','Material','Recipient Name','Address1','City','State','ZIP','Country','Phone']);
 for(const row of [['FILE-A',1,.1,20,15,10,'Shirt','Cotton','Client Test','100 Main','New York','NY','10001','US','123456'],['FILE-B',1,.2,20,15,10,'Bag','Canvas','Client Test','100 Main','New York','NY','10001','US','123456']])ws.addRow(row);
 const parsed=await parseClientFile(Buffer.from(await book.xlsx.writeBuffer()),'fixture.xlsx');
 test(parsed.length===2&&parsed[0].row_number===2&&parsed[1].row_number===3,'XLSX row provenance preserved');
 const grouped=groupClientCartonRows(parsed);
 test(grouped.length===2&&grouped.every(g=>g.group_errors.length===0),'XLSX read, sequential grouping, two Order');
 let response=await post(clientAPI,clients[0],route.id,grouped);test(response.status===200&&response.data.rows.length===2,'Two preview rows');
 test(response.data.rows.every(r=>r.pricing?.eligible),'Two ePacket orders priced');
 response=await post(clientAPI,clients[0],route.id,response.data.rows.map(r=>r.input),'save');
 test(response.status===201&&response.data.orders.length===2,'Two Drafts created');
 const orderIds=response.data.orders.map(o=>o.id);
 test(db.prepare('SELECT count(*) n FROM orders WHERE id IN (?,?)').get(...orderIds).n===2,'Exactly two Orders');
 test(db.prepare('SELECT count(*) n FROM order_cartons WHERE order_id IN (?,?)').get(...orderIds).n===2,'Exactly two Cartons');
 test(db.prepare('SELECT count(*) n FROM ledger_entries WHERE client_user_id=? AND entry_type=\'ORDER_CHARGE\'').get(clients[0].id).n===ledgerBefore,'Draft preview/save no new financial charge');
 response=await post(clientAPI,clients[0],route.id,grouped,'save');test(response.status===422&&response.data.rows.some(r=>r.errors.some(e=>e.includes('đã tồn tại'))),'Duplicate same Client rejected');
 response=await post(clientAPI,clients[1],route.id,grouped,'save');test(response.status===201&&response.data.orders.length===2,'Same Client Order ID valid across different Client accounts');
 const three=[{...base,order_id:'MULTI-EPACKET',carton_count:2},{...base,order_id:'MULTI-EPACKET',carton_count:'',weight:0.2}];
 response=await post(clientAPI,clients[0],route.id,groupClientCartonRows(three));
 test(response.data.rows[0].errors.some(e=>e.includes('tối đa 1 Carton')),'ePacket multi blocked');
 test(!JSON.stringify(response.data).includes('"supplier"'),'Preview hides Supplier internal data');
 response=await post(clientAPI,clients[0],route.id,[{...base,order_id:'MALICIOUS',carton_count:1,supplier:'NOT-PUBLIC',client_user_id:123}]);
 test(!JSON.stringify(response.data).includes('NOT-PUBLIC')&&!JSON.stringify(response.data).includes('"client_user_id"'),'Untrusted client fields never reflected');
 const invalid=await routesAPI.POST(request({id:route.id,service:'ePacket',sub_service:'Standard',supplier:'DMD',max_cartons_per_order:3},admin,'http://localhost/api/service-routes'));
 test(invalid.status===400,'Admin cannot configure ePacket multi-carton');
 const ups=db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,client_self_purchase) VALUES ('UPS','Express','KILOSHIP',1)").run().lastInsertRowid;
 const configured=await routesAPI.POST(request({id:ups,service:'UPS',sub_service:'Express',supplier:'KILOSHIP',max_cartons_per_order:8},admin,'http://localhost/api/service-routes'));
 test(configured.status===200&&(await configured.json()).max_cartons_per_order===8,'UPS route max set without secondary flag');
 test(db.prepare('SELECT max_cartons_per_order n FROM service_route_configs WHERE id=?').get(route.id).n===1,'ePacket limit unchanged');
 test(db.prepare('SELECT max_cartons_per_order n FROM service_route_configs WHERE id=?').get(ups).n===8,'UPS limit persisted');
 console.log('CLIENT CARTON API PASS ('+assertions+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
