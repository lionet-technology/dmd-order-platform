import {db} from './db';
import {addVnd,subtractVnd,sumVnd,compareVnd} from './vnd-money';
import {validVndDay,vndDay,nextVndDay} from './vnd-debt';
type Row=Record<string,unknown>;
export function vndStatementHistory(clientId:number){return (db.prepare('SELECT * FROM vnd_statements WHERE client_id=? ORDER BY period_end').all(clientId) as Row[]).map(r=>({...r,snapshot:JSON.parse(String(r.snapshot_json))}));}
export function makeVndStatement(clientId:number,start:unknown,end:unknown,today=vndDay()){
 const from=validVndDay(start),to=validVndDay(end);
 if(from>to||to>=today)throw Error('Kỳ không hợp lệ hoặc chưa kết thúc.');
 const last=db.prepare('SELECT * FROM vnd_statements WHERE client_id=? ORDER BY period_end DESC LIMIT 1').get(clientId) as Row|undefined;
 const activation=db.prepare("SELECT date(created_at,'+7 hours') day FROM vnd_accounts WHERE client_id=?").get(clientId) as {day:string}|undefined;
 if(!activation)throw Error('Client chưa có tài khoản VNĐ.');
 if(!last&&from>activation.day)throw Error('Kỳ đầu phải bao gồm ngày mở tài khoản VNĐ để đối chiếu opening.');
 if(last&&from!==nextVndDay(String(last.period_end)))throw Error('Statement phải nối tiếp kỳ đã chốt.');
 const opening=last?JSON.parse(String(last.snapshot_json)).closing:{balance:'0',debt_principal:'0',debt_interest:'0',refund_balance:'0'};
 const rows=db.prepare("SELECT * FROM vnd_ledger WHERE client_id=? AND id>? AND date(created_at,'+7 hours')<=? ORDER BY id").all(clientId,Number(last?.last_ledger_id??0),to) as Row[];
 const debtEvents=db.prepare("SELECT * FROM vnd_debt_events WHERE client_id=? AND id>? AND date(created_at,'+7 hours')<=? ORDER BY id").all(clientId,Number(last?.last_debt_event_id??0),to) as Row[];
 // First statement carries all unreported opening activity; later statements carry late postings by journal id.
 const economicDelta=sumVnd(rows.map(r=>String(r.delta))),principalDelta=sumVnd(debtEvents.map(r=>String(r.principal_delta))),interestPayment=sumVnd(debtEvents.filter(r=>r.kind==='PAYMENT').map(r=>String(r.interest_delta))),interestAccrued=subtractVnd('0',sumVnd(rows.filter(r=>r.kind==='DEBT_INTEREST').map(r=>String(r.delta))));
 const lastSnapshot=last?JSON.parse(String(last.snapshot_json)):null;
 const refundRows=db.prepare("SELECT id,claim_id,kind,delta,approved,revision,category,executed_day,reason,actor_id,created_at FROM vnd_refund_events WHERE client_id=? AND id>? AND date(created_at,'+7 hours')<=? ORDER BY id").all(clientId,Number(lastSnapshot?.last_refund_event_id??0),to) as Row[];
 const closing={balance:addVnd(addVnd(opening.balance,economicDelta),principalDelta),debt_principal:addVnd(opening.debt_principal,principalDelta),debt_interest:addVnd(addVnd(opening.debt_interest,interestAccrued),interestPayment),refund_balance:addVnd(opening.refund_balance??'0',sumVnd(refundRows.map(r=>String(r.delta))))};
 return {currency:'VND',client_id:clientId,period_start:from,period_end:to,opening,closing,movements:rows,debt_movements:debtEvents,last_ledger_id:Number(rows.at(-1)?.id??last?.last_ledger_id??0),last_debt_event_id:Number(debtEvents.at(-1)?.id??last?.last_debt_event_id??0),last_refund_event_id:Number(refundRows.at(-1)?.id??lastSnapshot?.last_refund_event_id??0),refund_movements:refundRows,claim_refund_status:'ACTIVE',cash_flow:{payments:sumVnd(rows.filter(r=>r.kind==='PAYMENT').map(r=>String(r.delta))),cancellation_refunds:sumVnd(rows.filter(r=>r.kind==='CANCELLATION_REFUND').map(r=>String(r.delta)))}};
}

function shiftDay(day:string,days:number){
 return new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}

function weekEnd(day:string){
 return shiftDay(day,(7-new Date(day+'T00:00:00Z').getUTCDay())%7);
}

type CloseRequest={actorId:number;reason:string};
export function closeVndWeeklyStatements(clientId:number,manual?:CloseRequest,now=new Date()){
 const today=vndDay(now);
 return db.transaction(()=>{
  const account=db.prepare("SELECT date(created_at,'+7 hours') day,actor_id FROM vnd_accounts WHERE client_id=?").get(clientId) as {day:string;actor_id:number}|undefined;
  if(!account)throw Error('Client chưa có tài khoản VNĐ.');
  const last=db.prepare('SELECT period_end FROM vnd_statements WHERE client_id=? ORDER BY period_end DESC LIMIT 1').get(clientId) as {period_end:string}|undefined;
  // A legacy close may end within a week. Close only its uncovered tail.
  let start=last?nextVndDay(last.period_end):shiftDay(weekEnd(account.day),-6);
  const ids:number[]=[];
  const actorId=manual?.actorId??account.actor_id;
  while(weekEnd(start)<today){
   const snapshot=makeVndStatement(clientId,start,weekEnd(start),today);
   const close={source:manual?'MANUAL':'SCHEDULED',reason:manual?.reason??'Chốt Statement tuần tự động',time_zone:'Asia/Ho_Chi_Minh'};
   const id=Number(db.prepare('INSERT INTO vnd_statements(client_id,period_start,period_end,last_ledger_id,last_debt_event_id,snapshot_json,actor_id) VALUES (?,?,?,?,?,?,?)')
    .run(clientId,snapshot.period_start,snapshot.period_end,snapshot.last_ledger_id,snapshot.last_debt_event_id,JSON.stringify({...snapshot,close}),actorId).lastInsertRowid);
   db.prepare("INSERT INTO vnd_history(client_id,event,data_json,actor_id) VALUES (?,'WEEKLY_STATEMENT_CLOSED',?,?)")
    .run(clientId,JSON.stringify({...close,statement_id:id,period_start:start,period_end:snapshot.period_end}),actorId);
   ids.push(id);
   start=nextVndDay(snapshot.period_end);
  }
  return ids;
 }).immediate();
}

type LedgerPosting={id:number;kind:string;delta:string;created_at:string;day:string;actor_id:number;reason:string};
type DebtPosting={id:number;kind:string;principal_delta:string;created_at:string;day:string;actor_id:number;reason:string;payment_ledger_id:number|null;ledger_watermark:number|null};

export function vndCreditStatus(clientId:number){
 const {credit_term_weeks:term_weeks}=db.prepare('SELECT credit_term_weeks FROM vnd_accounts WHERE client_id=?').get(clientId) as {credit_term_weeks:number};
 const ledger=db.prepare("SELECT id,kind,delta,created_at,date(created_at,'+7 hours') day,actor_id,reason FROM vnd_ledger WHERE client_id=? ORDER BY id").all(clientId) as LedgerPosting[];
 const debt=db.prepare("SELECT id,kind,principal_delta,created_at,date(created_at,'+7 hours') day,actor_id,reason,payment_ledger_id,ledger_watermark FROM vnd_debt_events WHERE client_id=? AND principal_delta<>'0' ORDER BY id").all(clientId) as DebtPosting[];
 const payments=new Map<number,DebtPosting>();
 const transfers:DebtPosting[]=[];
 const legacyKey=(row:LedgerPosting|DebtPosting)=>JSON.stringify([row.created_at,row.actor_id,row.reason]);
 const legacyPayments=new Map<string,LedgerPosting[]>();
 for(const row of ledger){
  if(row.kind!=='PAYMENT')continue;
  const key=legacyKey(row);
  const matches=legacyPayments.get(key)??[];
  matches.push(row);
  legacyPayments.set(key,matches);
 }
 for(const row of debt){
  // New debt allocations link to their atomic ledger posting. Older events
  // have only second-resolution timestamps, actor and reason to pair them.
  const paymentId=row.payment_ledger_id??(row.kind==='PAYMENT'?legacyPayments.get(legacyKey(row))?.shift()?.id:undefined);
  if(paymentId!==undefined)payments.set(paymentId,row);
  else transfers.push(row);
 }
 const postings=[
  ...ledger.map(row=>({at:row.created_at,day:row.day,order:row.id,debtId:0,delta:addVnd(row.delta,payments.get(row.id)?.principal_delta??'0')})),
  ...transfers.map(row=>({at:row.created_at,day:row.day,order:row.ledger_watermark??Number.MAX_SAFE_INTEGER,debtId:row.id,delta:row.principal_delta})),
 ].sort((a,b)=>a.at.localeCompare(b.at)||a.order-b.order||a.debtId-b.debtId);
 let balance='0',negativeSince:string|null=null;
 for(const posting of postings){
  balance=addVnd(balance,posting.delta);
  negativeSince=compareVnd(balance,'0')>=0?null:negativeSince??posting.day;
 }
 let consecutive_weeks=0;
 if(negativeSince!==null){
  const periods=db.prepare("SELECT period_end,json_extract(snapshot_json,'$.closing.balance') balance FROM vnd_statements WHERE client_id=? AND period_end>=? AND period_end<? AND strftime('%w',period_end)='0' ORDER BY period_end DESC")
   .all(clientId,negativeSince,vndDay()) as {period_end:string;balance:string}[];
  for(const [index,period] of periods.entries()){
   if(compareVnd(period.balance,'0')>=0||(index>0&&shiftDay(periods[index-1].period_end,-7)!==period.period_end))break;
   consecutive_weeks++;
  }
 }
 const overdue=negativeSince!==null&&consecutive_weeks>=term_weeks;
 return {term_weeks,consecutive_weeks,overdue,overdue_weeks:overdue?Math.max(0,consecutive_weeks-Math.max(1,term_weeks)+1):0};
}
