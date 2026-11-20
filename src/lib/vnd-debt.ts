import {db} from './db';
import {vnd,addVnd,subtractVnd,multiplyVnd,compareVnd,sumVnd} from './vnd-money';
type Row=Record<string,unknown>;
export const vndDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function validVndDay(value:unknown){const s=String(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ.');return s;}
export const nextVndDay=(s:string)=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
export function vndDebt(clientId:number){
 const d=db.prepare('SELECT * FROM vnd_debts WHERE client_id=?').get(clientId) as Row|undefined;
 return d??{client_id:clientId,principal:'0',interest:'0',daily_rate_pct:'0',deadline:null};
}
function debtEvent(clientId:number,kind:string,pDelta:string,iDelta:string,reason:string,actorId:number,paymentLedgerId:number|null=null){
 const d=vndDebt(clientId);
 const posting=paymentLedgerId===null?undefined:db.prepare("SELECT created_at,date(created_at,'+7 hours') day FROM vnd_ledger WHERE id=?").get(paymentLedgerId) as {created_at:string;day:string}|undefined;
 const watermark=db.prepare('SELECT COALESCE(MAX(id),0) id FROM vnd_ledger WHERE client_id=?').get(clientId) as {id:number};
 db.prepare('INSERT INTO vnd_debt_events(client_id,day,principal,interest,principal_delta,interest_delta,daily_rate_pct,kind,reason,actor_id,payment_ledger_id,ledger_watermark,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))').run(clientId,posting?.day??vndDay(),d.principal,d.interest,pDelta,iDelta,d.daily_rate_pct,kind,reason,actorId,paymentLedgerId,watermark.id,posting?.created_at??null);
}
export function projectedVndInterest(clientId:number,today=vndDay()){
 const events=db.prepare('SELECT * FROM vnd_debt_events WHERE client_id=? ORDER BY day,id').all(clientId) as Row[];
 const posted=new Set((db.prepare('SELECT day FROM vnd_debt_daily WHERE client_id=?').all(clientId) as {day:string}[]).map(x=>x.day));
 const rows:Array<{day:string;amount:string}>=[];
 if(!events.length)return rows;
 let i=0;
 for(let day=String(events[0].day);day<today;day=nextVndDay(day)){
  while(i+1<events.length&&String(events[i+1].day)<=day)i++;
  if(!posted.has(day))rows.push({day,amount:multiplyVnd(multiplyVnd(String(events[i].principal),String(events[i].daily_rate_pct)),'0.01')});
 }
 return rows;
}
export function accrueVndDebt(clientId:number,actorId:number){
 for(const row of projectedVndInterest(clientId)){
  db.prepare('INSERT INTO vnd_debt_daily(client_id,day,amount) VALUES (?,?,?)').run(clientId,row.day,row.amount);
  db.prepare('UPDATE vnd_debts SET interest=? WHERE client_id=?').run(addVnd(String(vndDebt(clientId).interest),row.amount),clientId);
  if(row.amount!=='0')db.prepare("INSERT INTO vnd_ledger(client_id,kind,delta,reason,actor_id,request_key) VALUES (?,'DEBT_INTEREST',?,?,?,?)").run(clientId,subtractVnd('0',row.amount),'Lãi hoàn tất ngày '+row.day,actorId,'vnd-interest:'+clientId+':'+row.day);
 }
}
export function settleVndPayment(clientId:number,amount:string,actorId:number,reason:string,paymentLedgerId:number){
 const d=vndDebt(clientId);
 const interest=compareVnd(amount,String(d.interest))<0?amount:String(d.interest);
 const left=subtractVnd(amount,interest),principal=compareVnd(left,String(d.principal))<0?left:String(d.principal);
 if(principal!=='0'||interest!=='0'){
  db.prepare('UPDATE vnd_debts SET principal=?,interest=? WHERE client_id=?').run(subtractVnd(String(d.principal),principal),subtractVnd(String(d.interest),interest),clientId);
  debtEvent(clientId,'PAYMENT',subtractVnd('0',principal),subtractVnd('0',interest),reason,actorId,paymentLedgerId);
 }
 return {interest,principal,balance:subtractVnd(left,principal)};
}
export function vndDebtAction(clientId:number,action:string,input:Row,netBalance:string,actorId:number,reason:string){
 const d=vndDebt(clientId);
 if(action==='debt'){
  const amount=vnd(String(input.amount)),deadline=validVndDay(input.deadline),rate=vnd(String(input.daily_rate_pct??d.daily_rate_pct));
  if(compareVnd(amount,'0')<=0||compareVnd(amount,subtractVnd('0',netBalance))>0)throw Error('Chỉ chuyển Balance ròng âm; Reserve không phải Debt.');
  if(compareVnd(rate,'0')<0||compareVnd(rate,'100')>0||deadline<vndDay()||(d.deadline&&compareVnd(String(d.principal),'0')>0&&deadline<String(d.deadline)))throw Error('Lãi suất/deadline không hợp lệ.');
  db.prepare('INSERT INTO vnd_debts(client_id,principal,interest,deadline,daily_rate_pct) VALUES (?,?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET principal=excluded.principal,deadline=excluded.deadline,daily_rate_pct=excluded.daily_rate_pct').run(clientId,addVnd(String(d.principal),amount),d.interest,deadline,rate);
  debtEvent(clientId,'TRANSFER',amount,'0',reason,actorId);
 }else{
  if(compareVnd(addVnd(String(d.principal),String(d.interest)),'0')<=0)throw Error('Debt không còn mở.');
  if(action==='extend_debt'){
   const deadline=validVndDay(input.deadline);if(deadline<String(d.deadline))throw Error('Chỉ gia hạn deadline.');
   db.prepare('UPDATE vnd_debts SET deadline=? WHERE client_id=?').run(deadline,clientId);
  }else{
   const rate=vnd(String(input.daily_rate_pct));if(compareVnd(rate,'0')<0||compareVnd(rate,'100')>0)throw Error('Lãi suất 0–100 %/ngày.');
   db.prepare('UPDATE vnd_debts SET daily_rate_pct=? WHERE client_id=?').run(rate,clientId);
  }
  debtEvent(clientId,action.toUpperCase(),'0','0',reason,actorId);
 }
}
export function vndDebtProjection(clientId:number){
 const debt=vndDebt(clientId),projected=sumVnd(projectedVndInterest(clientId).map(r=>r.amount));
 return {...debt,projected_interest:projected,total:addVnd(addVnd(String(debt.principal),String(debt.interest)),projected),overdue:Boolean(debt.deadline&&String(debt.deadline)<vndDay()&&compareVnd(addVnd(String(debt.principal),String(debt.interest)),'0')>0)};
}
