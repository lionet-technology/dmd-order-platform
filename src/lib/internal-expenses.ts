import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {AuthUser} from './auth';
type Actor=Pick<AuthUser,'id'|'role'>;
type Input=Record<string,unknown>;
export const expenseCategories=['PAYROLL_BONUS','RENT','OFFICE','IT_PROJECT','MARKETING','LEGAL','OTHER'] as const;
export type ExpensePlan={title:string;category:string;note:string;payee:string;document:string;currency:'VND';total_vnd:number;commission_vnd:number;installments:{key:string;due_date:string;amount_vnd:number}[]};
export type ExpensePayment={id:number;expense_id:number;installment_key:string;amount_vnd:number;paid_date:string;reference:string;reason:string;actor_id:number;reversal_of:number|null;exception_reason:string|null;created_at:string};
export type ExpenseView=ExpensePlan&{id:number;version:number;paid_vnd:number;remaining_vnd:number;overpaid_vnd:number;payments:ExpensePayment[];audit:Input[]};
const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
function text(v:unknown,required=false){if(v==null&&!required)return '';if(typeof v!=='string'||v.length>2000||(required&&!v.trim()))throw Error('Thông tin không hợp lệ (tối đa 2000 ký tự).');return v.trim();}
function money(v:unknown,zero=false){if(!Number.isSafeInteger(v)||Number(v)<(zero?0:1)||Number(v)>1_000_000_000_000)throw Error('Số tiền VND phải là số nguyên hợp lệ (tối đa 1.000 tỷ).');return Number(v);}
function date(v:unknown){const s=text(v,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ.');return s;}
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
function authorize(a:Actor){if(!['BOD','FINANCE'].includes(a.role))throw Error('Forbidden');}
/** Internal VND only; never posts to Client Balance, Refund, GP or Statements. */
export class InternalExpenses {
 constructor(private db:Database.Database){db.exec(`
 CREATE TABLE IF NOT EXISTS internal_expenses(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS internal_expense_versions(expense_id INTEGER NOT NULL REFERENCES internal_expenses(id),version INTEGER NOT NULL,plan_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(expense_id,version));
 CREATE TABLE IF NOT EXISTS internal_expense_payments(id INTEGER PRIMARY KEY,expense_id INTEGER NOT NULL REFERENCES internal_expenses(id),installment_key TEXT NOT NULL,amount_vnd INTEGER NOT NULL CHECK(amount_vnd!=0),paid_date TEXT NOT NULL,reference TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),reversal_of INTEGER UNIQUE REFERENCES internal_expense_payments(id),exception_reason TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE INDEX IF NOT EXISTS internal_expense_payment_index ON internal_expense_payments(expense_id,id);
 CREATE TABLE IF NOT EXISTS internal_expense_receipts(request_key TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL);
 `);for(const table of ['internal_expenses','internal_expense_versions','internal_expense_payments','internal_expense_receipts'])for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Internal expense audit is immutable'); END;`);}
 private read(id:number):ExpenseView{
  const versions=this.db.prepare('SELECT * FROM internal_expense_versions WHERE expense_id=? ORDER BY version DESC').all(id) as Input[];
  if(!versions.length)throw Error('Khoản chi không tồn tại.');
  const plan=JSON.parse(String(versions[0].plan_json)) as ExpensePlan;
  const payments=this.db.prepare('SELECT * FROM internal_expense_payments WHERE expense_id=? ORDER BY id DESC').all(id) as ExpensePayment[];
  const paid=payments.reduce((s,p)=>s+p.amount_vnd,0);
  return {...plan,id,version:Number(versions[0].version),paid_vnd:paid,remaining_vnd:Math.max(0,plan.total_vnd-paid),overpaid_vnd:Math.max(0,paid-plan.total_vnd),payments,audit:versions};
 }
 list(a:Actor){authorize(a);return this.db.transaction(()=> (this.db.prepare('SELECT id FROM internal_expenses ORDER BY id DESC').all() as {id:number}[]).map(r=>this.read(r.id))).deferred();}
 private plan(b:Input):ExpensePlan{
  const total=money(b.total_vnd),commission=money(b.commission_vnd??0,true),category=text(b.category,true);
  if(!expenseCategories.includes(category as typeof expenseCategories[number]))throw Error('Phân loại không hợp lệ.');
  if(b.currency!=='VND')throw Error('Chỉ hỗ trợ VND.');
  if(commission>total||(commission&&category!=='PAYROLL_BONUS'))throw Error('Hoa hồng nằm trong tổng lương thưởng, không cộng thêm lần nữa.');
  if(!Array.isArray(b.installments)||!b.installments.length||b.installments.length>100)throw Error('Cần 1–100 đợt đến hạn.');
  const installments=b.installments.map((r:Input)=>({key:text(r.key,true),due_date:date(r.due_date),amount_vnd:money(r.amount_vnd)}));
  if(new Set(installments.map(i=>i.key)).size!==installments.length||installments.reduce((s,i)=>s+i.amount_vnd,0)!==total)throw Error('Mã đợt phải duy nhất; tổng lịch đến hạn phải bằng tổng cam kết.');
  return {title:text(b.title,true),category,note:text(b.note,true),payee:text(b.payee),document:text(b.document),currency:'VND',total_vnd:total,commission_vnd:commission,installments};
 }
 command(a:Actor,b:Input){authorize(a);return this.db.transaction(()=>{
  const key=text(b.request_key,true);if(key.length>200)throw Error('Request key quá dài.');
  const hash=createHash('sha256').update(JSON.stringify(canonical({actor:a.id,payload:b}))).digest('hex');
  const old=this.db.prepare('SELECT * FROM internal_expense_receipts WHERE request_key=?').get(key) as {payload_hash:string;result_json:string}|undefined;
  if(old){if(old.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(old.result_json) as ExpenseView;}
  const reason=text(b.reason,true);let id=Number(b.expense_id);
  if(b.action==='create'||b.action==='edit'){
   const plan=this.plan(b);let version=1;
   if(b.action==='create')id=Number(this.db.prepare('INSERT INTO internal_expenses DEFAULT VALUES').run().lastInsertRowid);
   else{const current=this.read(id);if(b.expected_version!==current.version)throw Error('Dữ liệu đã thay đổi; tải lại trước khi sửa.');version=current.version+1;
    if(plan.total_vnd<current.paid_vnd&&plan.total_vnd<current.total_vnd)throw Error('Cam kết không được thấp hơn đã chi; đảo khoản ghi sai trước.');
    for(const prior of current.installments){const paid=current.payments.filter(p=>p.installment_key===prior.key).reduce((s,p)=>s+p.amount_vnd,0);const next=plan.installments.find(i=>i.key===prior.key);
     if(current.payments.some(p=>p.installment_key===prior.key)&&!next)throw Error('Không được xóa đợt có lịch sử thanh toán.');
     if(next&&next.amount_vnd<paid&&next.amount_vnd<prior.amount_vnd)throw Error('Lịch mới thấp hơn đã chi trong đợt.');}
   }
   this.db.prepare('INSERT INTO internal_expense_versions(expense_id,version,plan_json,reason,actor_id) VALUES (?,?,?,?,?)').run(id,version,JSON.stringify(plan),reason,a.id);
  }else if(b.action==='pay'){
   const current=this.read(id),installment=text(b.installment_key,true),stage=current.installments.find(i=>i.key===installment);
   if(b.expected_version!==current.version)throw Error('Lịch đã thay đổi; tải lại trước khi thanh toán.');
   if(!stage)throw Error('Đợt thanh toán không tồn tại.');
   const paid=current.payments.filter(p=>p.installment_key===installment).reduce((s,p)=>s+p.amount_vnd,0),amount=money(b.amount_vnd),paidDate=date(b.paid_date);
   if(paidDate>today())throw Error('Chỉ ghi thực chi đã thực hiện.');
   const exceeds=amount>stage.amount_vnd-paid||amount>current.total_vnd-current.paid_vnd;
   const exception=exceeds&&b.allow_overpay===true?text(b.exception_reason,true):null;
   if(exceeds&&!exception)throw Error('Chi vượt lịch/cam kết: cần xác nhận ngoại lệ và lý do rõ ràng.');
   if(current.paid_vnd+amount>1_000_000_000_000)throw Error('Tổng chi vượt phạm vi hỗ trợ.');
   this.db.prepare('INSERT INTO internal_expense_payments(expense_id,installment_key,amount_vnd,paid_date,reference,reason,actor_id,exception_reason) VALUES (?,?,?,?,?,?,?,?)').run(id,installment,amount,paidDate,text(b.reference,true),reason,a.id,exception);
  }else if(b.action==='reverse'){
   const current=this.read(id),p=current.payments.find(p=>p.id===b.payment_id);
   if(!p||p.amount_vnd<=0||current.payments.some(r=>r.reversal_of===p.id))throw Error('Khoản chi không thể đảo hoặc đã đảo.');
   this.db.prepare('INSERT INTO internal_expense_payments(expense_id,installment_key,amount_vnd,paid_date,reference,reason,actor_id,reversal_of) VALUES (?,?,?,?,?,?,?,?)').run(id,p.installment_key,-p.amount_vnd,today(),p.reference,reason,a.id,p.id);
  }else throw Error('Action không hỗ trợ.');
  const result=this.read(id);this.db.prepare('INSERT INTO internal_expense_receipts VALUES (?,?,?)').run(key,hash,JSON.stringify(result));return result;
 }).immediate();}
 report(a:Actor,month:string){authorize(a);if(!/^\d{4}-\d{2}$/.test(month)||!Number.isFinite(Date.parse(month+'-01'))||new Date(month+'-01').toISOString().slice(0,7)!==month)throw Error('Tháng không hợp lệ.');
  const items=this.list(a),sum=(xs:number[])=>{const n=xs.reduce((s,x)=>s+x,0);if(!Number.isSafeInteger(n))throw Error('Tổng tiền vượt phạm vi số nguyên chính xác.');return n;};
  return {month,currency:'VND',committed_total_vnd:sum(items.map(i=>i.total_vnd)),paid_total_vnd:sum(items.map(i=>i.paid_vnd)),remaining_total_vnd:sum(items.map(i=>i.remaining_vnd)),overpaid_total_vnd:sum(items.map(i=>i.overpaid_vnd)),
   due_month_vnd:sum(items.flatMap(i=>i.installments.filter(s=>s.due_date.startsWith(month)).map(s=>s.amount_vnd))),
   cash_month_vnd:sum(items.flatMap(i=>i.payments.filter(p=>p.paid_date.startsWith(month)).map(p=>p.amount_vnd))),
   categories:expenseCategories.map(category=>({category,committed_vnd:sum(items.filter(i=>i.category===category).map(i=>i.total_vnd)),cash_month_vnd:sum(items.filter(i=>i.category===category).flatMap(i=>i.payments.filter(p=>p.paid_date.startsWith(month)).map(p=>p.amount_vnd)))}))};
 }
}
