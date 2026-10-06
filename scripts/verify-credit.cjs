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
const {createUser,createSession}=require(path.join(root,"src/lib/auth.ts"));
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
rejects(()=>credit.financialAction(admin,client.id,{action:"allocate",ledger_id:p2,reason:"Override audit",allocations:[{debt_id:f.debts[0].id,amount:151}]}),"Override cannot exceed payment");
assert(credit.accountFinancials(client.id).balance_cents===2000,"Invalid override rolled back");
const job=Number(db.prepare("INSERT INTO orders(client_user_id,order_id) VALUES (?, 'FAIL-RETRY')").run(client.id).lastInsertRowid);
credit.reservePurchase(job,client.id,10,admin.id);assert(credit.accountFinancials(client.id).reserved_cents===1000,"Job reserves");
credit.purchaseJobAction(admin,{action:'fail',order_id:job,reason:'Supplier unavailable'});assert(credit.accountFinancials(client.id).reserved_cents===0,"Failed job releases reserve without credit");
credit.purchaseJobAction(admin,{action:'retry',order_id:job});assert(credit.accountFinancials(client.id).reserved_cents===1000,"Retry reserves again");rejects(()=>credit.purchaseJobAction(sales,{action:'fail',order_id:job,reason:'x'}),"Sales cannot bypass job control");
rejects(()=>credit.reservePurchase(Number(db.prepare("INSERT INTO orders(client_user_id,order_id) VALUES (?, 'OVER-RESERVE')").run(client.id).lastInsertRowid),client.id,300,admin.id),"Reservations cannot exceed credit room");

// Consolidation invariants use their own Client so preceding scenarios stay independent.
const c2=createUser({username:'fin.consolidation',display_name:'Rules',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
const led=(type,direction,amount,day=today)=>Number(db.prepare('INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,occurred_at,note) VALUES (?,?,?,?,?,?)').run(c2.id,type,direction,amount,day,'Test audited late charge').lastInsertRowid);
const oldDay=credit.shiftDay(today,-28),oldCharge=led('ORDER_CHARGE','DEBIT',100,oldDay);
let g=credit.accountFinancials(c2.id),issued=g.statements[0];
assert(issued.lifecycle==='ISSUED'&&issued.issued_at===credit.shiftDay(issued.period_end,1)+'T00:00:00+07:00','Lazy issuance at Vietnam Monday boundary');
rejects(()=>db.prepare('UPDATE credit_statements SET deadline=? WHERE id=?').run(today,issued.id),'Issued header immutable');
rejects(()=>db.prepare('UPDATE ledger_entries SET amount=90 WHERE id=?').run(oldCharge),'Issued source immutable');
rejects(()=>db.prepare('DELETE FROM credit_items WHERE ledger_id=?').run(oldCharge),'Issued item cannot be removed');
const late=led('ADDITIONAL_FEE','DEBIT',10,oldDay);g=credit.accountFinancials(c2.id);
const item=g.items.find(i=>i.ledger_id===late),current=g.statements.find(s=>s.id===item.statement_id);
assert(item.item_type==='PRIOR_PERIOD_ADJUSTMENT'&&item.original_statement_id===issued.id&&item.original_occurred_at===oldDay,'Late charge has original reference/date');
assert(current.lifecycle==='OPEN'&&current.deadline>today&&current.period_start<=today&&current.period_end>=today,'Late charge uses current period deadline');
assert(g.statements.find(s=>s.id===issued.id).amount_cents===10000,'Issued content unchanged');
const refund=led('REFUND','CREDIT',40);led('COMPENSATION','CREDIT',10);led('MANUAL_CREDIT','CREDIT',5);g=credit.accountFinancials(c2.id);
assert(g.receivable_cents===11000&&g.purchasing_balance_cents===5500,'Refund credits wallet without reducing AR');
rejects(()=>credit.financialAction(sales,c2.id,{action:'apply_credit',ledger_id:refund,allocations:[{statement_id:issued.id,amount:20}],reason:'Not allowed'}),'Sales cannot apply credit');
const netBefore=g.balance_cents;credit.financialAction(admin,c2.id,{action:'apply_credit',ledger_id:refund,allocations:[{statement_id:issued.id,amount:20}],reason:'Approved refund application'});g=credit.accountFinancials(c2.id);
assert(g.receivable_cents===9000&&g.purchasing_balance_cents===3500&&g.balance_cents===netBefore,'Manual credit moves wallet to AR without new money');
rejects(()=>credit.financialAction(admin,c2.id,{action:'apply_credit',ledger_id:refund,allocations:[{statement_id:issued.id,amount:41}],reason:'Too much'}),'Apply credit cannot exceed source');
assert(credit.accountFinancials(c2.id).receivable_cents===9000,'Failed credit application rolls back');
const paymentManual=led('PAYMENT','CREDIT',1);credit.financialAction(admin,c2.id,{action:'allocate',ledger_id:paymentManual,allocations:[],reason:'Keep in wallet'});credit.accountFinancials(c2.id);assert(!db.prepare('SELECT id FROM credit_allocations WHERE ledger_id=?').get(paymentManual),'Explicit keep-balance persists across FIFO refresh');
credit.financialAction(admin,c2.id,{action:'debt',statement_id:issued.id,amount:30,deadline:credit.shiftDay(today,7),reason:'Split oldest debt'});
led('OFFSET','CREDIT',5);g=credit.accountFinancials(c2.id);assert(g.debts[0].outstanding_cents===2500,'OFFSET settles oldest source debt first');
led('SERVICE_SETTLEMENT','CREDIT',5);g=credit.accountFinancials(c2.id);assert(g.debts[0].outstanding_cents===2000,'SERVICE_SETTLEMENT defaults FIFO');
const orphanLate=led('ADDITIONAL_FEE','DEBIT',2,credit.shiftDay(today,-60));g=credit.accountFinancials(c2.id);assert(g.items.find(i=>i.ledger_id===orphanLate).item_type==='PRIOR_PERIOD_ADJUSTMENT','Backdated charge for absent old period references current period after issuance');
const issuedItem=db.prepare('SELECT * FROM credit_items WHERE ledger_id=?').get(oldCharge);credit.syncStatements(c2.id,credit.shiftDay(current.period_end,1));assert(db.prepare('SELECT lifecycle FROM credit_statements WHERE id=?').get(current.id).lifecycle==='ISSUED','Open period issues after Sunday');assert(JSON.stringify(db.prepare('SELECT * FROM credit_items WHERE ledger_id=?').get(oldCharge))===JSON.stringify(issuedItem),'Refresh never changes earlier item');
rejects(()=>db.prepare('UPDATE ledger_entries SET amount=1 WHERE id=?').run(refund),'Issued credit memo source immutable');
rejects(()=>db.prepare('DELETE FROM ledger_entries WHERE id=?').run(refund),'Issued credit memo cannot be deleted');
// Mandatory final actual can exceed reserve/credit and prevents future purchasing.
const c3=createUser({username:'fin.delta',display_name:'Delta',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
credit.financialAction(admin,c3.id,{action:'configure',credit_limit:10,credit_term_days:14});
const delta=Number(db.prepare("INSERT INTO orders(client_user_id,order_id,total_due) VALUES (?, 'DELTA',5)").run(c3.id).lastInsertRowid);credit.reservePurchase(delta,c3.id,5,admin.id);db.prepare('UPDATE orders SET total_due=20 WHERE id=?').run(delta);credit.completeReserve(delta,admin.id);credit.completeReserve(delta,admin.id);const h=credit.accountFinancials(c3.id);assert(h.balance_cents===-2000&&h.reserved_cents===0&&h.purchase_blocked,'Final actual posts once then blocks despite insufficient room');assert(JSON.parse(db.prepare("SELECT data_json FROM financial_audit WHERE client_id=? AND event='PURCHASE_CHARGED'").get(c3.id).data_json).delta_cents===1500,'Reserve delta audit');
rejects(()=>credit.reservePurchase(delta,c3.id,1,admin.id),'Charged reserve cannot be reused');


const c4=createUser({username:'fin.existingdelta',display_name:'Existing delta',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});credit.financialAction(admin,c4.id,{action:'configure',credit_limit:10,credit_term_days:14});const delta2=Number(db.prepare("INSERT INTO orders(client_user_id,order_id,total_due) VALUES (?, 'DELTA-EXISTING',5)").run(c4.id).lastInsertRowid);credit.reservePurchase(delta2,c4.id,5,admin.id);db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',5,'ORDER',?)").run(c4.id,String(delta2));db.prepare('UPDATE orders SET total_due=20 WHERE id=?').run(delta2);credit.completeReserve(delta2,admin.id);credit.completeReserve(delta2,admin.id);assert(credit.accountFinancials(c4.id).balance_cents===-2000&&credit.shippingChargeCents([delta2])===2000,'Existing charge plus mandatory final delta posts only difference and remains refundable');assert(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE entry_type='PURCHASE_DELTA' AND reference_id=?").get(String(delta2)).n===1,'Mandatory delta idempotent');

const ended=Number(db.prepare('INSERT INTO credit_statements(client_id,period_start,period_end,deadline) VALUES (?,?,?,?)').run(c3.id,credit.shiftDay(today,-100),credit.shiftDay(today,-94),today).lastInsertRowid);createSession(admin.id);assert(db.prepare('SELECT lifecycle FROM credit_statements WHERE id=?').get(ended).lifecycle==='ISSUED','Login activity issues ended periods globally');
console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});
