const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-manual-limit-'));process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs');seed();
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),{NextRequest}=require('next/server');
const client=db.prepare("SELECT * FROM users WHERE username='epacket.client.a'").get(),admin=db.prepare("SELECT * FROM users WHERE role='ADMIN' LIMIT 1").get(),sales=db.prepare("SELECT * FROM users WHERE role='SALES' LIMIT 1").get(),route=db.prepare("SELECT * FROM service_route_configs WHERE service='ePacket' AND sub_service='Standard'").get();
const api=require('../src/app/api/client-orders/route.ts'),batch=require('../src/app/api/orders/manual-batch/route.ts');
const tokens=new Map();const req=(actor,body)=>{if(actor&&!tokens.has(actor.id))tokens.set(actor.id,auth.createSession(actor.id).token);return new NextRequest('http://local/api/client-orders',{method:'POST',headers:{...(actor?{cookie:'dmd_session='+tokens.get(actor.id)}:{}),...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});};
const row=i=>({order_id:'LIMIT-'+i,carton_count:1,weight:.1,length:10,width:5,height:3,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',country:'US',phone:'123456'});
let n=0;const eq=(a,b,m)=>{n++;assert.deepEqual(a,b,m)},count=()=>db.prepare('SELECT COUNT(*) n FROM orders').get().n;
(async()=>{try{
 const rows=Array.from({length:21},(_,i)=>row(i)),before=count();
 for(const action of ['preview','save']){const r=await api.POST(req(client,{action,route_id:route.id,rows,source:'import'}));eq(r.status,400,'JSON 21 rejected even forged import source '+action);}
 eq(count(),before,'No writes on oversized Client batch');
 let r=await api.POST(req(client,{action:'save',route_id:route.id,rows:rows.slice(0,20)}));eq(r.status,201,'Exactly 20 Client Orders');eq((await r.json()).orders.length,20,'No clipping');
 const large=rows.map((r,i)=>({...r,order_id:'FILE-LIMIT-'+i})),fields=Object.keys(large[0]),csv=fields.join(',')+'\n'+large.map(r=>fields.map(k=>r[k]).join(',')).join('\n');
 for(const action of ['preview','save']){const form=new FormData();form.set('file',new File([csv],'orders.csv'));form.set('route_id',String(route.id));form.set('action',action);r=await api.POST(req(client,form));const d=await r.json();eq(r.status,action==='save'?201:200,'CSV 21 '+action+' succeeds '+JSON.stringify(d.error));eq((d.orders||d.rows).length,21,'All CSV rows retained');}
 const book=new(require('exceljs').Workbook)(),sheet=book.addWorksheet('Orders');sheet.addRow(fields);for(const [i,r] of large.entries())sheet.addRow(fields.map(k=>k==='order_id'?'XLSX-LIMIT-'+i:r[k]));const bytes=await book.xlsx.writeBuffer();
 const form=new FormData();form.set('file',new File([bytes],'orders.xlsx'));form.set('route_id',String(route.id));form.set('action','save');r=await api.POST(req(client,form));eq(r.status,201,'XLSX 21 save');eq((await r.json()).orders.length,21,'All XLSX rows retained');
 const beforeBatch=count();r=await batch.POST(req(admin,{rows}));eq(r.status,400,'Admin oversized batch rejected before writes');eq(count(),beforeBatch,'No partial writes for size rejection');
 for(const actor of [null,client])eq((await batch.POST(req(actor,{rows:[row(0)]}))).status,actor?403:401,'Manual batch authorization');
 const adminRows=Array.from({length:20},(_,i)=>({...row(i),order_id:'ADMIN-LIMIT-'+i,client_user_id:client.id,service:'ePacket',sub_service:'Standard',supplier:'DMD'}));
 r=await batch.POST(req(admin,{rows:adminRows}));const d=await r.json();eq(r.status,200,'Admin 20 result');eq(d.results.filter(r=>r.ok).length,20,'Admin saves all 20 through existing validation');
 const partial=await batch.POST(req(sales,{rows:[{...row(0),order_id:'SALES-LIMIT',client_user_id:client.id,service:'ePacket',sub_service:'Standard'},{...row(1),client_user_id:999999}]}));eq((await partial.json()).results.map(r=>r.ok),[true,false],'Sales keeps per-row authorization/partial success');
 eq(db.pragma('integrity_check',{simple:true}),'ok','DB integrity');
 console.log('MANUAL ORDER LIMIT PASS ('+n+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
