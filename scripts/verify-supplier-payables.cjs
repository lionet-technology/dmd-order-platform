const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-supplier-payables-"+process.pid+".db");
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
const {supplierPayables:report,supplierPayableAction:act,payablesSchema}=require('../src/lib/supplier-payables.ts');
const {localDay}=require('../src/lib/credit.ts');
const {updateEnumValue}=require('../src/lib/enums.ts');
let checks=0;function assert(v,m){checks++;if(!v)throw Error(m)}function rejects(f,m){let failed=false;try{f()}catch{failed=true}assert(failed,m)}
const user=role=>createUser({username:'payable.'+role.toLowerCase(),display_name:role,password:'TestPass123!',role});
const admin=user('ADMIN'),sales=user('SALES'),client=createUser({username:'payable.client',display_name:'Client',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id}),warehouse=user('WAREHOUSE');
const finance=user('FINANCE'),bod=user('BOD');
const today=localDay(),supplier=db.prepare("SELECT value FROM enum_values WHERE enum_type='SUPPLIER' AND active=1 LIMIT 1").get().value;
let serial=0;const command=b=>act(admin,{request_key:'test-'+(++serial),reason:'Fixture accounting evidence',...b});
async function main(){try{
const ledgerBefore=db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n;
const costBefore=db.prepare('SELECT COUNT(*) n FROM supplier_costs').get().n;
for(const u of [sales,client,warehouse]){rejects(()=>report(u),u.role+' read denied');rejects(()=>act(u,{action:'invoice'}),u.role+' write denied');}
rejects(()=>act(admin,{action:'invoice'}),'Request key required');
const input={action:'invoice',supplier,currency:'USD',amount:'100.00',invoice_number:'INV-001',invoice_date:today,due_date:today,document_reference:'Supplier invoice source',request_key:'invoice-1'};
const invoice=command(input);assert(command(input).id===invoice.id,'Invoice exact replay');
rejects(()=>command({...input,amount:101}),'Replay payload mismatch');
rejects(()=>command({...input,invoice_number:'inv-001',request_key:'duplicate'}),'Invoice duplicate ref case insensitive');
rejects(()=>command({...input,invoice_number:'INVALID',amount:'1.001',request_key:'precision'}),'No fractional cent truncation');
rejects(()=>command({...input,invoice_number:'INVALID',currency:'VND',request_key:'fx'}),'FX not guessed');
rejects(()=>command({...input,invoice_number:'INVALID',invoice_date:'2026-02-30',request_key:'date'}),'Invalid calendar date');
assert(report(admin).suppliers[0].outstanding_cents===10000,'Initial outstanding invoice');
const payment={action:'payment',supplier,currency:'USD',amount:40,paid_date:today,payment_reference:'BANK-001',allocations:[{invoice_id:invoice.id,amount:40}],request_key:'payment-1'};
const paid=command(payment);assert(command(payment).id===paid.id,'Payment exact replay');
assert(report(admin).invoices[0].paid_cents===4000&&report(admin).invoices[0].outstanding_cents===6000,'Partial payment totals');
rejects(()=>command({...payment,request_key:'overpay',payment_reference:'BANK-002',amount:61,allocations:[{invoice_id:invoice.id,amount:61}]}),'Overpay rejected');
rejects(()=>command({...payment,request_key:'sum',payment_reference:'BANK-002',amount:20,allocations:[{invoice_id:invoice.id,amount:10}]}),'Allocation mismatch rejected');
rejects(()=>command({...payment,request_key:'double',payment_reference:'BANK-002',allocations:[{invoice_id:invoice.id,amount:20},{invoice_id:invoice.id,amount:20}]}),'Duplicate allocation rejected');
rejects(()=>command({action:'void_invoice',invoice_id:invoice.id}),'Cannot void partly paid invoice');
assert(db.prepare('SELECT COUNT(*) n FROM supplier_payments').get().n===1,'Failed payments leave no partial rows');
const otherSupplier='PAYABLE-OTHER';db.prepare("INSERT INTO enum_values(enum_type,value,parent_value) VALUES ('SUPPLIER',?,'')").run(otherSupplier);
rejects(()=>command({...payment,supplier:otherSupplier,payment_reference:'FOREIGN',request_key:'foreign'}),'Cross supplier allocation rejected');
const inv2=command({...input,invoice_number:'INV-002',amount:50,request_key:'invoice-2'});
const batch=command({action:'payment',supplier,currency:'USD',amount:110,paid_date:today,payment_reference:'BANK-002',allocations:[{invoice_id:invoice.id,amount:60},{invoice_id:inv2.id,amount:50}]});
assert(report(admin).suppliers.find(s=>s.supplier===supplier).outstanding_cents===0,'Multi invoice allocation closes outstanding');
const reverse=command({action:'reverse_payment',payment_id:batch.id,request_key:'reverse'});assert(command({action:'reverse_payment',payment_id:batch.id,request_key:'reverse'}).id===reverse.id,'Reversal retry');
assert(report(admin).suppliers.find(s=>s.supplier===supplier).outstanding_cents===11000,'Reversal restores payable once');
command({action:'void_invoice',invoice_id:inv2.id});assert(report(admin).suppliers.find(s=>s.supplier===supplier).outstanding_cents===6000,'Void unpaid invoice retains immutable history');
for(const table of ['supplier_invoices','supplier_payments','supplier_payment_allocations','supplier_payable_events'])rejects(()=>db.prepare('DELETE FROM '+table).run(),'Immutable '+table);
const enumRow=db.prepare("SELECT id FROM enum_values WHERE enum_type='SUPPLIER' AND value=?").get(supplier);
rejects(()=>updateEnumValue(enumRow.id,{value:supplier+'-RENAMED'},admin.id),'Supplier rename cannot orphan financial history');
updateEnumValue(enumRow.id,{active:0},admin.id);
command({...payment,request_key:'inactive-settle',amount:60,payment_reference:'BANK-003',allocations:[{invoice_id:invoice.id,amount:60}]});assert(report(admin).invoices.find(i=>i.id===invoice.id).outstanding_cents===0,'Can settle inactive historical Supplier');
payablesSchema();assert(report(admin).invoices.length===2,'Additive schema rerun keeps records');
assert(db.prepare('SELECT COUNT(*) n FROM ledger_entries').get().n===ledgerBefore&&db.prepare('SELECT COUNT(*) n FROM supplier_costs').get().n===costBefore,'Payables never duplicate costs or Client balance');
assert(report(admin).events.length>=7,'Audit events recorded');
const {createSession}=require('../src/lib/auth.ts'),{NextRequest}=require('next/server'),api=require('../src/app/api/supplier-payables/route.ts');
for(const roleUser of [undefined,sales,client,warehouse,admin,finance,bod]){
 const headers=roleUser?{cookie:'dmd_session='+createSession(roleUser.id).token}:{};
 const expected=['BOD','FINANCE'].includes(roleUser?.role)?200:roleUser?403:401;
 assert((await api.GET(new NextRequest('http://local/api/supplier-payables',{headers}))).status===expected,'API read role '+(roleUser?.role||'anonymous'));
 if(!['BOD','FINANCE'].includes(roleUser?.role))assert((await api.POST(new NextRequest('http://local/api/supplier-payables',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'}))).status===expected,'API write denied '+(roleUser?.role||'anonymous'));
}
const token=createSession(finance.id).token;
const response=await api.POST(new NextRequest('http://local/api/supplier-payables',{method:'POST',headers:{cookie:'dmd_session='+token,'content-type':'application/json'},body:JSON.stringify({...input,supplier:otherSupplier,invoice_number:'API-INV',request_key:'api-invoice',reason:'API actor check',created_by:sales.id})}));
assert(response.status===200,'Finance API writes');const result=await response.json();assert(db.prepare('SELECT created_by FROM supplier_invoices WHERE id=?').get(result.id).created_by===finance.id,'API actor cannot be spoofed');
const count=db.prepare('SELECT COUNT(*) n FROM supplier_invoices').get().n;
db.exec("CREATE TRIGGER test_payable_audit_failure BEFORE INSERT ON supplier_payable_events BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
rejects(()=>command({...input,supplier:otherSupplier,invoice_number:'AUDIT-FAIL',request_key:'audit-fail'}),'Audit failure rejects transaction');
assert(db.prepare('SELECT COUNT(*) n FROM supplier_invoices').get().n===count,'Audit failure rolls back invoice');db.exec('DROP TRIGGER test_payable_audit_failure');
console.log('SUPPLIER PAYABLES PASS ('+checks+' assertions)');
}finally{db.close();for(const suffix of ['','-shm','-wal'])fs.rmSync(dbPath+suffix,{force:true});}

}
main().catch(e=>{console.error(e);process.exitCode=1});
