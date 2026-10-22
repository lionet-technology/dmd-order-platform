import { db } from './db';
type Row=Record<string,unknown>;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function debtInterestSchema(){
 if(!(db.prepare('PRAGMA table_info(credit_allocations)').all() as Row[]).some(r=>r.name==='interest_cents'))db.exec('ALTER TABLE credit_allocations ADD COLUMN interest_cents INTEGER NOT NULL DEFAULT 0');
 db.exec(`CREATE TABLE IF NOT EXISTS debt_interest_events(id INTEGER PRIMARY KEY,debt_id INTEGER NOT NULL REFERENCES credit_debts(id),effective_day TEXT NOT NULL,principal_cents INTEGER NOT NULL,daily_rate_pct REAL NOT NULL,actor_id INTEGER,reason TEXT);
 CREATE TABLE IF NOT EXISTS debt_daily_interest(debt_id INTEGER NOT NULL REFERENCES credit_debts(id),day TEXT NOT NULL,principal_cents INTEGER NOT NULL,daily_rate_pct REAL NOT NULL,amount_cents INTEGER NOT NULL,PRIMARY KEY(debt_id,day));
 CREATE TRIGGER IF NOT EXISTS immutable_daily_interest_update BEFORE UPDATE ON debt_daily_interest BEGIN SELECT RAISE(ABORT,'Accrued interest is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_daily_interest_delete BEFORE DELETE ON debt_daily_interest BEGIN SELECT RAISE(ABORT,'Accrued interest is immutable'); END;`);
}
export function debtInterestTotal(id:number){return Number((db.prepare('SELECT COALESCE(SUM(amount_cents),0) n FROM debt_daily_interest WHERE debt_id=?').get(id) as {n:number}).n);}
export function debtInterestRemaining(id:number){return Math.max(0,debtInterestTotal(id)-Number((db.prepare('SELECT COALESCE(SUM(interest_cents),0) n FROM credit_allocations WHERE debt_id=?').get(id) as {n:number}).n));}
export function snapshotDebt(id:number,rate?:unknown,actorId=0,reason='Principal/payment change',today=day()){
 const debt=db.prepare('SELECT amount_cents FROM credit_debts WHERE id=?').get(id) as {amount_cents:number};
 const paid=Number((db.prepare('SELECT COALESCE(SUM(amount_cents-interest_cents),0) n FROM credit_allocations WHERE debt_id=?').get(id) as {n:number}).n);
 const previous=db.prepare('SELECT * FROM debt_interest_events WHERE debt_id=? ORDER BY effective_day DESC,id DESC LIMIT 1').get(id) as Row|undefined;
 const dailyRate=rate===undefined?Number(previous?.daily_rate_pct||0):Number(rate);
 if(!Number.isFinite(dailyRate)||dailyRate<0||dailyRate>100)throw Error('Lãi suất phải từ 0 đến 100 %/ngày.');
 const principal=Math.max(0,debt.amount_cents-paid);
 if(previous&&Number(previous.principal_cents)===principal&&Number(previous.daily_rate_pct)===dailyRate)return;
 db.prepare('INSERT INTO debt_interest_events(debt_id,effective_day,principal_cents,daily_rate_pct,actor_id,reason) VALUES (?,?,?,?,?,?)').run(id,today,principal,dailyRate,actorId||null,reason);
}
/** Same completed-day rounding as accrual, without inserting rows or legacy events. */
export function projectedUnpostedInterest(id:number,today=day()){
 const events=db.prepare('SELECT effective_day,principal_cents,daily_rate_pct FROM debt_interest_events WHERE debt_id=? ORDER BY effective_day,id').all(id) as {effective_day:string;principal_cents:number;daily_rate_pct:number}[];
 if(!events.length)return 0;
 const posted=new Set((db.prepare('SELECT day FROM debt_daily_interest WHERE debt_id=?').all(id) as {day:string}[]).map(r=>r.day));
 let total=0,index=0;
 for(let date=events[0].effective_day;date<today;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)){
  while(index+1<events.length&&events[index+1].effective_day<=date)index++;
  if(!posted.has(date))total+=Math.round(events[index].principal_cents*events[index].daily_rate_pct/100);
 }
 if(!Number.isSafeInteger(total))throw Error('Interest projection exceeds exact cents range');
 return total;
}
export function accrueDebtInterest(clientId:number,today=day()){
 const debts=db.prepare('SELECT id FROM credit_debts WHERE client_id=?').all(clientId) as {id:number}[];
 for(const debt of debts){
 const first=db.prepare('SELECT MIN(effective_day) start FROM debt_interest_events WHERE debt_id=?').get(debt.id) as {start:string|null};
 if(!first.start){snapshotDebt(debt.id,undefined,0,'Legacy interest starts prospectively',today);continue;}
 const last=db.prepare('SELECT MAX(day) last FROM debt_daily_interest WHERE debt_id=?').get(debt.id) as {last:string|null};
 const next=(date:string)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
 for(let date=last.last?next(last.last):first.start;date<today;date=next(date)){
 const event=db.prepare('SELECT * FROM debt_interest_events WHERE debt_id=? AND effective_day<=? ORDER BY effective_day DESC,id DESC LIMIT 1').get(debt.id,date) as Row;
 const amount=Math.round(Number(event.principal_cents)*Number(event.daily_rate_pct)/100);
 db.prepare('INSERT OR IGNORE INTO debt_daily_interest(debt_id,day,principal_cents,daily_rate_pct,amount_cents) VALUES (?,?,?,?,?)').run(debt.id,date,event.principal_cents,event.daily_rate_pct,amount);
 }
 }
}
