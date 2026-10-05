const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-purchase-engine-"+process.pid+".db");
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

const {db}=require(path.join(root,"src/lib/db.ts"));
const {createUser}=require(path.join(root,"src/lib/auth.ts"));
const credit=require(path.join(root,"src/lib/credit.ts"));
let checks=0;const assert=(v,m)=>{checks++;if(!v)throw Error(m)};const rejects=(f,m)=>{let ok=false;try{f()}catch{ok=true}assert(ok,m)};
const admin=createUser({username:"fin.admin",display_name:"Admin",password:"TestPass123!",role:"ADMIN"});
const sales=createUser({username:"fin.sales",display_name:"Sales",password:"TestPass123!",role:"SALES"});
const client=createUser({username:"fin.client",display_name:"Client",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id});
const today=credit.localDay();
const entry=(type,direction,amount,date=today)=>Number(db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,occurred_at) VALUES (?,?,?,?,?)").run(client.id,type,direction,amount,date).lastInsertRowid);
entry("ORDER_CHARGE","DEBIT",100,credit.shiftDay(today,-30));
let f=credit.accountFinancials(client.id);assert(f.purchase_blocked,"Oldest unpaid period blocks");assert(f.statements[0].outstanding_cents===10000,"Statement amount");
credit.financialAction(admin,client.id,{action:"configure",credit_limit:200,credit_term_days:14});
rejects(()=>credit.assertPurchasing(client.id,1),"Credit limit does not bypass overdue");
credit.financialAction(admin,client.id,{action:"debt",statement_id:f.statements[0].id,amount:100,deadline:credit.shiftDay(today,2),exclude_room:true,reason:"Deferred"});
f=credit.accountFinancials(client.id);assert(!f.purchase_blocked&&f.available_to_buy_cents===20000,"Debt excluded from room and deadline independent");
const payment=entry("PAYMENT","CREDIT",60);f=credit.accountFinancials(client.id);assert(f.debts[0].outstanding_cents===4000,"FIFO debt first");
credit.financialAction(admin,client.id,{action:"reject_payment",ledger_id:payment,reason:"Not received"});f=credit.accountFinancials(client.id);assert(f.debts[0].outstanding_cents===10000&&f.balance_cents===-10000,"Reject reverses balance and allocation");
credit.financialAction(admin,client.id,{action:"reject_payment",ledger_id:payment,reason:"Retry"});assert(credit.accountFinancials(client.id).balance_cents===-10000,"Reject idempotent");
rejects(()=>credit.financialAction(sales,client.id,{action:"debt",statement_id:f.statements[0].id,amount:1,deadline:today}),"Sales cannot restructure debt");
credit.financialAction(sales,client.id,{action:"additional_fee",quantity:2,unit_price:5,note:"Packing"});f=credit.accountFinancials(client.id);assert(f.balance_cents===-11000,"Sales fee debits");
rejects(()=>credit.financialAction(client,client.id,{action:"additional_fee",unit_price:1}),"Client read only");
credit.financialAction(admin,client.id,{action:"configure",credit_limit:200,credit_term_days:14,purchase_locked:true,reason:"Review"});rejects(()=>credit.assertPurchasing(client.id,1),"Manual purchase lock");
credit.financialAction(admin,client.id,{action:"configure",credit_limit:200,credit_term_days:14});
const id=Number(db.prepare("INSERT INTO orders(client_user_id,order_id,total_due) VALUES (?, 'RESERVE', 20)").run(client.id).lastInsertRowid);
db.transaction(()=>credit.reservePurchase(id,client.id,20,admin.id)).immediate();f=credit.accountFinancials(client.id);assert(f.reserved_cents===2000&&f.balance_cents===-11000,"Reserve is not charge");
db.transaction(()=>credit.completeReserve(id,admin.id)).immediate();f=credit.accountFinancials(client.id);assert(f.reserved_cents===0&&f.balance_cents===-13000,"Success converts reserve to charge");
credit.completeReserve(id,admin.id);assert(credit.accountFinancials(client.id).balance_cents===-13000,"Completion idempotent");
const p2=entry("PAYMENT","CREDIT",150);f=credit.accountFinancials(client.id);assert(f.debts[0].outstanding_cents===0&&f.statements.every(s=>s.outstanding_cents===0),"FIFO settles old debts and fees, leaves prepaid");
rejects(()=>credit.financialAction(admin,client.id,{action:"allocate",ledger_id:p2,allocations:[{debt_id:f.debts[0].id,amount:151}]}),"Override cannot exceed payment");
assert(credit.accountFinancials(client.id).balance_cents===2000,"Invalid override rolled back");
const job=Number(db.prepare("INSERT INTO orders(client_user_id,order_id) VALUES (?, 'FAIL-RETRY')").run(client.id).lastInsertRowid);
credit.reservePurchase(job,client.id,10,admin.id);assert(credit.accountFinancials(client.id).reserved_cents===1000,"Job reserves");
credit.purchaseJobAction(admin,{action:'fail',order_id:job,reason:'Supplier unavailable'});assert(credit.accountFinancials(client.id).reserved_cents===0,"Failed job releases reserve without credit");
credit.purchaseJobAction(admin,{action:'retry',order_id:job});assert(credit.accountFinancials(client.id).reserved_cents===1000,"Retry reserves again");rejects(()=>credit.purchaseJobAction(sales,{action:'fail',order_id:job,reason:'x'}),"Sales cannot bypass job control");
rejects(()=>credit.reservePurchase(Number(db.prepare("INSERT INTO orders(client_user_id,order_id) VALUES (?, 'OVER-RESERVE')").run(client.id).lastInsertRowid),client.id,300,admin.id),"Reservations cannot exceed credit room");
console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
