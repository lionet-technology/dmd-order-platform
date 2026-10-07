const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-domain-best-practices-"+process.pid+".db");
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

const taxonomy=require(path.join(root,'src/lib/transaction-taxonomy.ts'));
const guards=require(path.join(root,'src/lib/order-transition-guards.ts'));
const {addLedgerEntry}=require(path.join(root,'src/lib/finance.ts'));
const {moneyCommand}=require(path.join(root,'src/lib/money-command.ts'));
const {recentFinancialActivity}=require(path.join(root,'src/lib/financial-activity.ts'));
for(const t of ['PAYMENT','OFFSET','SERVICE_SETTLEMENT'])assert(taxonomy.isAutoAllocatable(t),'Settlement FIFO '+t);
for(const t of ['REFUND','COMPENSATION','MANUAL_CREDIT','ADJUSTMENT_CREDIT']){assert(taxonomy.classifyTransaction(t)==='CREDIT','Credit '+t);assert(!taxonomy.isAutoAllocatable(t)&&!taxonomy.affectsReceivable(t),'Credit requires allocation '+t);assert(taxonomy.affectsPurchasingBalance(t),'Credit wallet '+t);}
assert(taxonomy.classifyTransaction('PAYMENT_REVERSAL')==='REVERSAL','Reversal classification');
assert(taxonomy.canPostBeyondCreditLimit('WEIGHT_ADJUSTMENT')&&!taxonomy.canPostBeyondCreditLimit('ORDER_CHARGE'),'Mandatory debit distinction');
rejects(()=>taxonomy.classifyTransaction('FUTURE_TYPE'),'Unknown transaction fails closed');
for(const status of ['CANCELLED','DELIVERED','CLOSED','FUTURE_STATUS'])for(const op of ['canReceiveInbound','canMatchInbound','canMeasure','canCancelOrder','canPurchase','canWarehouseOutbound'])assert(!guards[op]({workflow_status:status}).allowed,op+' denies '+status);

for(const op of ['canReceiveInbound','canMatchInbound','canMeasure'])assert(guards[op]({workflow_status:'PURCHASED'}).allowed,op+' purchased');
assert(!guards.canCancelOrder({workflow_status:'PURCHASED',fulfillment_started_at:today}).allowed,'Carrier boundary');
const payment={client_user_id:client.id,created_by_user_id:sales.id,entry_type:'PAYMENT',amount:30,occurred_at:today,request_key:'pay-1'};
const first=addLedgerEntry(payment),second=addLedgerEntry({...payment});assert(first.id===second.id,'Payment retries original ledger');
assert(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE entry_type='PAYMENT'").get().n===1,'One payment');
rejects(()=>addLedgerEntry({...payment,amount:31}),'Key payload mismatch');
let calls=0;rejects(()=>moneyCommand('rollback','key',{a:1},()=>{calls++;entry('MANUAL_CREDIT','CREDIT',9);throw Error('failed')}),'Failed command rollback');
assert(!db.prepare("SELECT id FROM ledger_entries WHERE amount=9").get(),'Money rolled back');
assert(moneyCommand('rollback','key',{a:1},()=>{calls++;return {id:1}}).id===1&&calls===2,'Failed key reusable');
entry('ORDER_CHARGE','DEBIT',50);let f=credit.accountFinancials(client.id);const statement=f.statements.find(s=>s.period_start<=today&&s.period_end>=today);
const refund=entry('REFUND','CREDIT',20);f=credit.accountFinancials(client.id);assert(f.receivable_cents===2000,'Refund alone does not reduce AR');
const apply={action:'apply_credit',ledger_id:refund,allocations:[{statement_id:statement.id,amount:10}],reason:'explicit',request_key:'apply-1'};
const applied=credit.financialAction(admin,client.id,apply),retry=credit.financialAction(admin,client.id,{...apply});assert(JSON.stringify(applied)===JSON.stringify(retry),'Apply retries exact original result');
assert(db.prepare('SELECT COUNT(*) n FROM credit_allocations WHERE ledger_id=?').get(refund).n===1,'No duplicate allocations');
assert(db.prepare("SELECT COUNT(*) n FROM financial_audit WHERE event='apply_credit'").get().n===1,'No duplicate audit');
const originalDay=credit.shiftDay(today,-30),_oldCharge=entry('ORDER_CHARGE','DEBIT',1,originalDay);credit.accountFinancials(client.id);
const late=entry('ADDITIONAL_FEE','DEBIT',2,originalDay);credit.accountFinancials(client.id);
const lateItem=db.prepare('SELECT i.*,s.period_start,s.lifecycle FROM credit_items i JOIN credit_statements s ON s.id=i.statement_id WHERE ledger_id=?').get(late);
assert(lateItem.item_type==='PRIOR_PERIOD_ADJUSTMENT'&&lateItem.period_start===statement.period_start,'Backdated posted in current open period');
assert(db.prepare('SELECT occurred_at FROM ledger_entries WHERE id=?').get(late).occurred_at===originalDay,'Economic date retained');
assert(lateItem.original_occurred_at===originalDay&&lateItem.original_statement_id,'Original reference retained');
const beforeCost=credit.accountFinancials(client.id);const supplierCost=entry('SERVICE_COST','DEBIT',123);const afterCost=credit.accountFinancials(client.id);assert(beforeCost.balance_cents===afterCost.balance_cents&&beforeCost.receivable_cents===afterCost.receivable_cents,'Supplier cost never debits client wallet or AR');assert(!afterCost.items.some(i=>i.ledger_id===supplierCost),'Supplier cost excluded from Statement usage');assert(!taxonomy.affectsPurchasingBalance('SERVICE_COST')&&!taxonomy.affectsReceivable('SERVICE_COST'),'Supplier taxonomy separate from client money');const activity=recentFinancialActivity(client.id);
assert(activity.every(a=>!('actor' in a)&&!('note' in a)&&a.type!=='SERVICE_COST'),'Public activity safe projection');
const creditActivity=activity.find(a=>a.ledger_id===refund);assert(creditActivity.status==='Partially Applied'&&creditActivity.destination.includes('Wallet')&&creditActivity.destination.includes('Statement #'),'Credit destination and remainder');
assert(activity.some(a=>a.type==='APPLY_CREDIT'&&a.amount_cents===-1000),'Application executed activity');
assert(recentFinancialActivity(client.id,true).every(a=>'actor' in a),'Staff actor projection');
const reapply={...apply,allocations:[{statement_id:statement.id,amount:15}],request_key:'apply-2'};credit.financialAction(admin,client.id,reapply);assert(recentFinancialActivity(client.id).some(a=>a.type==='APPLY_CREDIT'&&a.amount_cents===-500),'Reallocation records actual delta, not full instruction');assert(taxonomy.classifyTransaction('DEPOSIT')==='CREDIT'&&!taxonomy.canApplyToReceivable('DEPOSIT'),'Legacy deposit compatibility');assert(!taxonomy.canPostBeyondCreditLimit('order_charge'),'Lowercase mandatory rule');console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ['','-wal','-shm'])fs.rmSync(dbPath+suffix,{force:true});
