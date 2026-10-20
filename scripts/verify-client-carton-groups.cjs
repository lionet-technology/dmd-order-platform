const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-carton-groups-'));
process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const root=path.resolve(__dirname,'..'),original=Module._resolveFilename;
Module._resolveFilename=function(r,p,m,o){if(r.startsWith('@/'))r=path.join(root,'src',r.slice(2));return original.call(this,r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {groupClientCartonRows:group}=require('../src/lib/client-carton-groups.ts');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{upsertOrder}=require('../src/lib/finance.ts');
const {saveOrderShipmentStructure,getOrderShipmentStructure}=require('../src/lib/order-shipments.ts');
let assertions=0;function eq(actual,expected){assertions++;assert.deepEqual(actual,expected)}
const carton=(id,qty,weight=2,extra={})=>({order_id:id,carton_count:qty,weight,length:20,width:10,height:10,item:'Shirt',material:'Cotton',...extra});
try{
 let rows=group([carton('A',3),carton('A','',4),carton('A','',5),carton('B',1)]);
 eq(rows.length,2);eq(rows[0].carton_rows.length,3);eq(rows[0].group_errors,[]);eq(rows[1].group_errors,[]);
 eq(rows[0].carton_rows.map(r=>r.weight),[2,4,5]);
 rows=group([carton('A',2),carton('B',1),carton('A',1)]);
 eq(rows[2].group_errors.some(e=>e.includes('xuất hiện ở nhóm trước')),true);
 rows=group([carton('A',3),carton('A','')]);eq(rows[0].group_errors.some(e=>e.includes('nhưng có 2 dòng')),true);
 rows=group([carton('A',1),carton('A','')]);eq(rows[0].group_errors.some(e=>e.includes('nhưng có 2 dòng')),true);
 rows=group([carton('A',2),carton('A',2)]);eq(rows[0].group_errors.some(e=>e.includes('chỉ nhập ở dòng đầu')),true);
 rows=group([carton('A',2),carton('A','',2,{address1:'Wrong destination'})]);eq(rows[0].group_errors.length,0); // An optional Order field on a later row does not overwrite the first row.
 rows=group([carton('A',2,2,{address1:'Main'}),carton('A','',2,{address1:'Other'})]);eq(rows[0].group_errors.some(e=>e.includes('mâu thuẫn')),true);
 rows=group([carton('A','')]);eq(rows[0].group_errors.some(e=>e.includes('Carton Quantity bắt buộc')),true);
 rows=group([carton('',1)]);eq(rows[0].group_errors.some(e=>e.includes('thiếu Client Order ID')),true);
 rows=group([carton('A',1,0)]);eq(rows[0].group_errors.some(e=>e.includes('cân nặng')),true);
 const sales=createUser({username:'carton.sales',role:'SALES',display_name:'Sale',password:'TestPass123!'});
 const client=createUser({username:'carton.client',role:'CLIENT',display_name:'Client',password:'TestPass123!',sales_user_id:sales.id});
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled) VALUES (?,'UPS','Express',1)").run(client.id);
 db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,max_cartons_per_order) VALUES ('UPS','Express','KILOSHIP',3)").run();
 // Multi-carton structure saved atomically as one Order, default one Lot; no financial postings here.
 const saved=upsertOrder({client_user_id:client.id,customer:'Client',sales_user_id:sales.id,service:'UPS',sub_service:'Express',supplier:'KILOSHIP',order_id:'CARTON-FIXTURE',carton_count:3,weight:2,length:20,width:10,height:10,recipient_name:'John',address1:'123',city:'New York',state:'NY',zip:'10001',country:'US',phone:'1234',item:'Shirt',material:'Cotton'});
 saveOrderShipmentStructure(saved.id,{lot_count:1,cartons:[2,4,5].map((weight,i)=>({carton_number:i+1,lot_number:1,weight,length:20,width:10,height:10,items:[{description:'SKU-'+i,sku:'T'+i,quantity:1}]}))});
 const structure=getOrderShipmentStructure(saved.id);
 eq(structure.lots.length,1);eq(structure.cartons.map(c=>c.weight),[2,4,5]);eq(structure.allocations.length,3);
 eq(db.prepare('SELECT count(*) n FROM orders WHERE id=?').get(saved.id).n,1);
 eq(db.prepare('SELECT count(*) n FROM ledger_entries WHERE client_user_id=?').get(client.id).n,0);
 assertions++;assert.throws(()=>saveOrderShipmentStructure(saved.id,{lot_count:1,cartons:[{carton_number:1,lot_number:1,weight:2,length:20,width:10,height:10,items:[{description:'' ,quantity:1}]}]}));
 eq(getOrderShipmentStructure(saved.id).cartons.length,3);
 console.log('CLIENT CARTON GROUPING PASS ('+assertions+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
