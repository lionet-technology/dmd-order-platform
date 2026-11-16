import {db} from './db';
import {addVnd,subtractVnd,sumVnd,compareVnd} from './vnd-money';
import {validVndDay,vndDay,nextVndDay} from './vnd-debt';
type Row=Record<string,unknown>;
export function vndStatementHistory(clientId:number){return (db.prepare('SELECT * FROM vnd_statements WHERE client_id=? ORDER BY period_end').all(clientId) as Row[]).map(r=>({...r,snapshot:JSON.parse(String(r.snapshot_json))}));}
export function makeVndStatement(clientId:number,start:unknown,end:unknown){
 const from=validVndDay(start),to=validVndDay(end);
 if(from>to||to>vndDay())throw Error('Kỳ không hợp lệ hoặc chưa kết thúc.');
 const last=db.prepare('SELECT * FROM vnd_statements WHERE client_id=? ORDER BY period_end DESC LIMIT 1').get(clientId) as Row|undefined;
 const activation=db.prepare("SELECT date(created_at,'+7 hours') day FROM vnd_accounts WHERE client_id=?").get(clientId) as {day:string}|undefined;
 if(!activation)throw Error('Client chưa có tài khoản VNĐ.');
 if(!last&&from>activation.day)throw Error('Kỳ đầu phải bao gồm ngày mở tài khoản VNĐ để đối chiếu opening.');
 if(last&&from!==nextVndDay(String(last.period_end)))throw Error('Statement phải nối tiếp kỳ đã chốt.');
 const opening=last?JSON.parse(String(last.snapshot_json)).closing:{balance:'0',debt_principal:'0',debt_interest:'0',refund_balance:null};
 const rows=db.prepare("SELECT * FROM vnd_ledger WHERE client_id=? AND id>? AND date(created_at,'+7 hours')<=? ORDER BY id").all(clientId,Number(last?.last_ledger_id??0),to) as Row[];
 const debtEvents=db.prepare("SELECT * FROM vnd_debt_events WHERE client_id=? AND id>? AND date(created_at,'+7 hours')<=? ORDER BY id").all(clientId,Number(last?.last_debt_event_id??0),to) as Row[];
 // First statement carries all unreported opening activity; later statements carry late postings by journal id.
 const economicDelta=sumVnd(rows.map(r=>String(r.delta))),principalDelta=sumVnd(debtEvents.map(r=>String(r.principal_delta))),interestPayment=sumVnd(debtEvents.filter(r=>r.kind==='PAYMENT').map(r=>String(r.interest_delta))),interestAccrued=subtractVnd('0',sumVnd(rows.filter(r=>r.kind==='DEBT_INTEREST').map(r=>String(r.delta))));
 const closing={balance:addVnd(addVnd(opening.balance,economicDelta),principalDelta),debt_principal:addVnd(opening.debt_principal,principalDelta),debt_interest:addVnd(addVnd(opening.debt_interest,interestAccrued),interestPayment),refund_balance:null};
 return {currency:'VND',client_id:clientId,period_start:from,period_end:to,opening,closing,movements:rows,debt_movements:debtEvents,last_ledger_id:Number(rows.at(-1)?.id??last?.last_ledger_id??0),last_debt_event_id:Number(debtEvents.at(-1)?.id??last?.last_debt_event_id??0),claim_refund_status:'NOT_ACTIVATED',cash_flow:{payments:sumVnd(rows.filter(r=>r.kind==='PAYMENT').map(r=>String(r.delta))),cancellation_refunds:sumVnd(rows.filter(r=>r.kind==='CANCELLATION_REFUND').map(r=>String(r.delta)))}};
}
export function finalizeVndStatement(clientId:number,input:Row,actorId:number){
 const snapshot=makeVndStatement(clientId,input.period_start,input.period_end);
 const id=Number(db.prepare('INSERT INTO vnd_statements(client_id,period_start,period_end,last_ledger_id,last_debt_event_id,snapshot_json,actor_id) VALUES (?,?,?,?,?,?,?)').run(clientId,snapshot.period_start,snapshot.period_end,snapshot.last_ledger_id,snapshot.last_debt_event_id,JSON.stringify(snapshot),actorId).lastInsertRowid);
 return {id,...snapshot};
}
export function vndCreditOverdue(clientId:number,netBalance:string){
 if(compareVnd(netBalance,'0')>=0)return false;
 const days=Number((db.prepare('SELECT credit_term_days FROM users WHERE id=?').get(clientId) as Row).credit_term_days);
 if(!Number.isInteger(days)||days<1)throw Error('Credit Term không hợp lệ.');
 // Cover residual Balance newest-to-oldest using economic obligation increments.
 const statements=vndStatementHistory(clientId);
 let residual:string=subtractVnd('0',netBalance),overdue=false;
 const currentRaw=sumVnd((db.prepare('SELECT delta FROM vnd_ledger WHERE client_id=?').all(clientId) as Row[]).map(r=>String(r.delta)));
 const last=statements.at(-1)?.snapshot as {closing:{balance:string;debt_principal:string}}|undefined;
 const negative=(n:string)=>compareVnd(n,'0')<0?subtractVnd('0',n):'0';
 const currentObligation=negative(currentRaw);
 const frozenObligation=last?addVnd(negative(last.closing.balance),last.closing.debt_principal):'0';
 const openIncrease=subtractVnd(currentObligation,frozenObligation);
 if(compareVnd(openIncrease,'0')>0)residual=compareVnd(residual,openIncrease)>0?subtractVnd(residual,openIncrease):'0';
 for(let i=statements.length-1;i>=0&&compareVnd(residual,'0')>0;i--){
  const s=statements[i].snapshot as {period_end:string;opening:{balance:string;debt_principal:string};closing:{balance:string;debt_principal:string}};
  const capacity=subtractVnd(addVnd(negative(s.closing.balance),s.closing.debt_principal),addVnd(negative(s.opening.balance),s.opening.debt_principal));
  if(compareVnd(capacity,'0')<=0)continue;
  const covered=compareVnd(residual,capacity)<0?residual:capacity;
  if(compareVnd(covered,'0')>0&&new Date(Date.parse(s.period_end+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)<vndDay())overdue=true;
  residual=subtractVnd(residual,covered);
 }
 return overdue;
}
