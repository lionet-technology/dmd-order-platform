// Exercise the real HTTP handlers and reconciliation against a disposable SQLite database.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-supplier-review-'));
process.env.DMD_DB_PATH=path.join(dir,'test.db');
process.env.NODE_ENV='test';
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...args)};
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);

const {NextRequest}=require('next/server'),Excel=require('exceljs');
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts');
const costs=require('../src/app/api/costs/route.ts'),adjustments=require('../src/app/api/costs/adjustments/route.ts');
const importApi=require('../src/app/api/import/route.ts'),recon=require('../src/app/api/reconciliation/route.ts');
const {addOrderTracking,matchSupplierCostsForOrder}=require('../src/lib/order-operations.ts');
const {supplierAccountAction}=require('../src/lib/supplier-account.ts');
const actors=Object.fromEntries(['ADMIN','FINANCE','BOD','SALES','WAREHOUSE'].map(role=>[
  role,auth.createUser({username:'cost.'+role.toLowerCase(),display_name:role,role,password:'Synthetic123!'}),
]));
actors.CLIENT=auth.createUser({username:'cost.client',display_name:'CLIENT',role:'CLIENT',password:'Synthetic123!',sales_user_id:actors.SALES.id});
const tokens=Object.fromEntries(Object.entries(actors).map(([role,user])=>[role,auth.createSession(user.id).token]));
const call=async(api,method,role,url,body)=>{
  const headers=role?{cookie:'dmd_session='+tokens[role]}:{};
  if(body&&!(body instanceof FormData))headers['content-type']='application/json';
  const response=await api[method](new NextRequest('http://local'+url,{method,headers,
    body:body instanceof FormData?body:body?JSON.stringify(body):undefined}));
  return {status:response.status,data:await response.json()};
};
const check=async(promise,status)=>{
  const response=await promise;
  assert.equal(response.status,status,JSON.stringify(response.data));
  return response.data;
};
const workbook=async(headers,rows)=>{
  const book=new Excel.Workbook(),sheet=book.addWorksheet('Report');
  sheet.addRow(headers);
  sheet.addRows(rows);
  return book.xlsx.writeBuffer();
};
const upload=(buffer,fields)=>{
  const form=new FormData();
  for(const [key,value] of Object.entries(fields))form.set(key,value);
  form.set('file',new Blob([buffer]),'fixture.xlsx');
  return form;
};

(async()=>{
  try{
    const url='/api/costs',adjustUrl=url+'/adjustments';
    for(const role of [undefined,'SALES','WAREHOUSE','CLIENT','BOD']){
      const status=role?403:401;
      await check(call(costs,'PATCH',role,url,{}),status);
      for(const method of ['GET','POST','PATCH'])await check(call(adjustments,method,role,adjustUrl,method==='GET'?undefined:{}),status);
    }
    await check(call(recon,'GET','ADMIN','/api/reconciliation'),403);
    const order=(ref)=>Number(db.prepare(`INSERT INTO orders(order_id,service,workflow_status,sales_price,total_due,est_net_cost,pricing_snapshot_json)
      VALUES (?,'UPS','PURCHASED',100,100,50,'{}')`).run(ref).lastInsertRowid);
    const orderId=order('COST-REVIEW');
    addOrderTracking({orderId,tracking:'1Z-CASE',isPrimary:true});
    const snapshot=()=>db.prepare('SELECT true_net_cost,actual_gp,finalized_gp,reconciliation_status FROM orders WHERE id=?').get(orderId);
    const versions=()=>db.prepare('SELECT COUNT(*) n FROM lot_reconciliation_versions v JOIN order_lots l ON l.id=v.lot_id WHERE l.order_id=?').get(orderId).n;
    const ledger=()=>db.prepare('SELECT * FROM ledger_entries ORDER BY id').all();
    const cost=(total,extra={})=>({tracking:'1z case',supplier:'KILOSHIP',total_net_cost:total,...extra});
    const post=(total,extra)=>check(call(costs,'POST','FINANCE',url,cost(total,extra)),201);
    await check(call(costs,'POST','FINANCE',url,cost(20)),400);
    const first=await post(20,{source_key:'base'});
    const initial={true_net_cost:20,actual_gp:80,finalized_gp:80,reconciliation_status:'PASS'};
    assert.deepEqual(snapshot(),initial);
    const ledgerBefore=ledger(),versionBefore=versions();
    supplierAccountAction(actors.FINANCE,{action:'confirm_cost',cost_id:first.id,supplier:'KILOSHIP',request_key:'posted-base',reason:'Base invoice'});
    const supplierLedger=()=>db.prepare('SELECT * FROM supplier_account_entries ORDER BY id').all();
    const supplierBefore=supplierLedger();

    const headers=['Supplier','Dịch vụ','Sub-Service','Tracking','Total Net Cost'];
    const bytes=await workbook(headers,[['KILOSHIP','UPS','','1Z-CASE',30],['KILOSHIP','UPS','','1Z CASE',40],['KILOSHIP','UPS','','1Z CASE',40]]);
    const importCosts=()=>check(call(importApi,'POST','ADMIN','/api/import',upload(bytes,{kind:'costs'})),200);
    assert.equal((await importCosts()).imported,3);
    assert.equal((await importCosts()).imported,0);
    matchSupplierCostsForOrder(orderId);
    assert.deepEqual(snapshot(),initial);
    assert.equal(versions(),versionBefore);
    const pending=async()=> (await check(call(costs,'GET','ADMIN',url+'?import_status=PENDING'),200)).items;
    const items=await pending();
    assert.equal(items.length,3);
    assert.equal((await check(call(costs,'GET','FINANCE',url),200)).total,1);
    for(const row of items){
      assert.equal(row.previous_total,20);
      assert.equal(row.previous_ids,String(first.id));
      assert.equal(row.matched,0);
    }
    const review=(role,row,decision,status=200)=>check(call(costs,'PATCH',role,url,{id:row.id,decision,previous_ids:row.previous_ids}),status);
    const keep=items[0],replace=items[2];
    await review('ADMIN',keep,'KEEP_OLD');
    await review('FINANCE',keep,'KEEP_OLD');
    await review('FINANCE',keep,'ACCEPT_NEW',400);
    await review('ADMIN',replace,'ADD',400);
    assert.deepEqual(snapshot(),initial);
    await review('FINANCE',replace,'ACCEPT_NEW');
    const newBase=replace.total_net_cost;
    assert.equal(snapshot().true_net_cost,newBase);
    assert.equal(snapshot().actual_gp,100-newBase);
    const versionAfter=versions();
    await review('FINANCE',replace,'ACCEPT_NEW');
    await review('ADMIN',items[1],'ACCEPT_NEW',400);
    assert.equal(versions(),versionAfter);
    assert.equal((await check(call(costs,'GET','FINANCE',url+'?import_status=REPLACED'),200)).items[0].id,first.id);
    assert.throws(()=>supplierAccountAction(actors.FINANCE,{action:'confirm_cost',cost_id:replace.id,supplier:'KILOSHIP',request_key:'posted-replacement',reason:'Replacement invoice'}),/đã ghi sổ/);
    assert.deepEqual(supplierLedger(),supplierBefore);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_events WHERE event_type='SUPPLIER_COST_DUPLICATE_RESOLVED'").get().n,2);

    const item={tracking:'1z-case',amount:5,reason:'Remote  area'};
    const submit=(key,items,status=201)=>check(call(adjustments,'POST','FINANCE',adjustUrl,{request_key:key,items}),status);
    const resolveAdjustment=(id,decision,status=200)=>check(call(adjustments,'PATCH','ADMIN',adjustUrl,{id,decision}),status);
    await submit('',[item],400);
    await submit('rollback',[item,{...item,tracking:'UNKNOWN'}],400);
    assert.equal(snapshot().true_net_cost,newBase);
    const [recorded,replay]=await Promise.all([submit('same-command',[item]),submit('same-command',[item])]);
    assert.deepEqual(recorded,replay);
    assert.equal(snapshot().true_net_cost,newBase+5);
    assert.equal(snapshot().actual_gp,95-newBase);
    assert.equal(snapshot().finalized_gp,null);
    await submit('same-command',[{...item,amount:6}],400);
    const file=await workbook(['Tracking','Cost bổ sung','Lý do'],[['1Z CASE',5,'Remote area'],['1Z-CASE',3.25,'Address correction'],['1Z-CASE',5,'Remote area']]);
    const importAdjustments=()=>check(call(adjustments,'POST','ADMIN',adjustUrl,upload(file,{request_key:'excel-adjustments'})),201);
    const batch=await importAdjustments();
    assert.deepEqual(batch.results.map(row=>row.status),['PENDING','RECORDED','PENDING']);
    assert.deepEqual(await importAdjustments(),batch);
    assert.equal(snapshot().true_net_cost,newBase+8.25);
    const [confirmed,confirmedRetry]=await Promise.all([
      resolveAdjustment(batch.results[0].id,'RECORD_AGAIN'),resolveAdjustment(batch.results[0].id,'RECORD_AGAIN'),
    ]);
    assert.deepEqual(confirmed,confirmedRetry);
    await resolveAdjustment(batch.results[0].id,'SKIP',400);
    await resolveAdjustment(batch.results[2].id,'SKIP');
    assert.equal(snapshot().true_net_cost,newBase+13.25);
    assert.equal(snapshot().actual_gp,86.75-newBase);
    const history=(await check(call(adjustments,'GET','FINANCE',adjustUrl+'?history=1'),200)).items;
    assert.deepEqual(history.map(row=>row.status).sort(),['CONFIRMED','RECORDED','RECORDED','RECORDED','SKIPPED']);
    assert.equal(history.find(row=>row.status==='CONFIRMED').resolved_by,'ADMIN');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_events WHERE event_type='SUPPLIER_COST_ADJUSTMENT' AND visibility='ADMIN'").get().n,3);
    assert.deepEqual(ledger(),ledgerBefore);
    assert.deepEqual(supplierLedger(),supplierBefore);

    const queued=(tracking,total,request_key)=>check(call(costs,'POST','ADMIN',url,{tracking,total_net_cost:total,request_key}),201);
    const unmatched=await queued('LATE-TRACK',7,'late-base');
    const duplicate=await queued('LATE TRACK',9,'late-duplicate');
    assert.deepEqual(await queued('LATE TRACK',9,'late-duplicate'),duplicate);
    const late=order('LATE-ORDER');
    addOrderTracking({orderId:late,tracking:'LATE-TRACK',isPrimary:true});
    assert.equal(db.prepare('SELECT true_net_cost FROM orders WHERE id=?').get(late).true_net_cost,7);
    await review('ADMIN',{id:duplicate.id,previous_ids:String(unmatched.id)},'ACCEPT_NEW');
    assert.equal(db.prepare('SELECT true_net_cost FROM orders WHERE id=?').get(late).true_net_cost,9);
    console.log('SUPPLIER COST REVIEW PASS (RBAC, workbook, history, retry, GP, Ledger, late matching)');
  }finally{
    db.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
