import {db} from './db';
import {accountFinancials,assertClientAccess,localDay,validDay,shiftDay} from './credit';
import './cases';
import {statementOrderIdsV2} from './statement-orders-v2';
import type {AuthUser} from './auth';
type Row=Record<string,unknown>;
type Totals={balance_cents:number;debt_cents:number;refund_cents:number};
type Movement=Totals&{id:number;source:string;source_id:string;operation:string;bank_cents:number;detail:Row;posted_at:string;statement_day:string};
export type StatementSnapshot={version:2;client_id:number;period_start:string;period_end:string;status:'FINALIZED';opening:Totals;closing:Totals;movements:Movement[];bank_outflow_cents:number;reference:{credit_limit_cents:number;reserve_cents:number};order_ids:number[];last_event_id:number;checkpoint_at:string};
function access(actor:AuthUser,client:number){if(['FINANCE','BOD'].includes(actor.role)){if(!db.prepare("SELECT id FROM users WHERE id=? AND role='CLIENT'").get(client))throw Error('Client không tồn tại.');}else assertClientAccess(actor,client);}
function total(events:Movement[]):Totals {return events.reduce((s,e)=>({balance_cents:s.balance_cents+e.balance_cents,debt_cents:s.debt_cents+e.debt_cents,refund_cents:s.refund_cents+e.refund_cents}),{balance_cents:0,debt_cents:0,refund_cents:0});}
export function statementEvents(client:number):Movement[]{
 const closed=db.prepare('SELECT period_end,snapshot_json FROM statement_v2_snapshots WHERE client_id=? ORDER BY period_end').all(client) as {period_end:string;snapshot_json:string}[];
 const cutoffs=closed.map(s=>({end:s.period_end,last:JSON.parse(s.snapshot_json).last_event_id}));
 return (db.prepare("SELECT *,date(posted_at,'+7 hours') posting_day FROM statement_v2_events WHERE client_id=? ORDER BY id").all(client) as Row[]).map(e=>{
 let day=String(e.posting_day);
 for(const s of cutoffs)if(Number(e.id)>s.last&&day<=s.end)day=shiftDay(s.end,1);
 return {...e,detail:JSON.parse(String(e.detail_json)),statement_day:day} as unknown as Movement;
 });
}
function epoch(){return String((db.prepare('SELECT started_at FROM statement_v2_epoch WHERE id=1').get() as {started_at:string}).started_at);}
function range(start:string,end:string){validDay(start);validDay(end);if(start>end)throw Error('Khoảng ngày không hợp lệ.');const first=(db.prepare("SELECT date(?,'+7 hours') day").get(epoch()) as {day:string}).day;if(start<first)throw Error('Kỳ trước checkpoint Statement V2; cần đối chiếu lịch sử, không suy diễn allocation.');}
function disputes(client:number,events:Movement[],capturedOrderIds?:number[]){
 const orderIds=capturedOrderIds?new Set(capturedOrderIds):statementOrderIdsV2(events);
 const claims=(db.prepare("SELECT DISTINCT c.id,c.status,co.order_id FROM operation_cases c JOIN operation_case_orders co ON co.case_id=c.id JOIN orders o ON o.id=co.order_id WHERE c.kind='CLAIM' AND o.client_user_id=? AND c.status NOT IN ('RESOLVED','CLOSED')").all(client) as {id:number;status:string;order_id:number}[]).filter(c=>orderIds.has(c.order_id));
 return {disputed:claims.length>0,claim_ids:[...new Set(claims.map(c=>c.id))],order_ids:[...orderIds]};
}
export function statementPreview(actor:AuthUser,client:number,start:string,end:string){access(actor,client);range(start,end);return db.transaction(()=>{
 if((db.prepare('SELECT count(*) n FROM credit_debts WHERE client_id=?').get(client) as {n:number}).n>1)throw Error('Nhiều Debt legacy; cần đối chiếu trước Statement V2.');
 if(db.prepare('SELECT c.id FROM claim_decisions c JOIN operation_case_orders co ON co.case_id=c.case_id JOIN orders o ON o.id=co.order_id WHERE o.client_user_id=? LIMIT 1').get(client))throw Error('Claim legacy chưa đối chiếu; chưa chứng minh được Refund Balance đầu kỳ.');
 const f=accountFinancials(client),events=statementEvents(client);
 const opening=total(events.filter(e=>e.source==='OPENING'||e.statement_day<start));
 const movements=events.filter(e=>e.source!=='OPENING'&&e.statement_day>=start&&e.statement_day<=end);
 const delta=total(movements),closing={balance_cents:opening.balance_cents+delta.balance_cents,debt_cents:opening.debt_cents+delta.debt_cents,refund_cents:opening.refund_cents+delta.refund_cents};
 const bank=Number((db.prepare("SELECT COALESCE(SUM(-delta_cents),0) n FROM refund_events WHERE client_id=? AND kind='TO_BANK'").get(client) as {n:number}).n);
 if(events.reduce((sum,e)=>sum+e.bank_cents,0)!==bank)throw Error('Statement bank outflow mismatch');
 const live=total(events),refund=Number((db.prepare('SELECT COALESCE(SUM(delta_cents),0) n FROM refund_events WHERE client_id=?').get(client) as {n:number}).n);
 if(live.balance_cents!==f.net_balance_cents||live.debt_cents!==f.debts.reduce((s,d)=>s+d.outstanding_cents,0)||live.refund_cents!==refund)throw Error('Statement journal / operational balances mismatch; đối chiếu trước khi Finalize.');
 for(const n of [...Object.values(opening),...Object.values(closing),...Object.values(live)])if(!Number.isSafeInteger(n))throw Error('Statement exceeds exact cents range');
 return {version:2 as const,client_id:client,period_start:start,period_end:end,status:'DRAFT' as const,opening,closing,movements,
 bank_outflow_cents:movements.reduce((s,e)=>s+e.bank_cents,0),reference:{credit_limit_cents:Number((db.prepare('SELECT credit_limit_cents FROM users WHERE id=?').get(client) as {credit_limit_cents:number}).credit_limit_cents),reserve_cents:f.reserved_cents},
 last_event_id:events.at(-1)?.id??0,checkpoint_at:epoch(),...disputes(client,movements)};
 }).immediate();}
export function finalizeStatement(actor:AuthUser,client:number,start:string,end:string){
 access(actor,client);if(!['ADMIN','FINANCE'].includes(actor.role))throw Error('Forbidden');range(start,end);if(end>localDay())throw Error('Không đóng kỳ tương lai.');
 return db.transaction(()=>{
 const old=db.prepare('SELECT * FROM statement_v2_snapshots WHERE client_id=? AND period_start=?').get(client,start) as Row|undefined;
 if(old){if(old.period_end!==end)throw Error('Kỳ đã Finalized có ngày kết thúc khác.');return JSON.parse(String(old.snapshot_json)) as StatementSnapshot;}
 if(db.prepare('SELECT id FROM statement_v2_snapshots WHERE client_id=? AND period_start<=? AND period_end>=?').get(client,end,start))throw Error('Kỳ trùng Statement Finalized.');
 const last=db.prepare('SELECT period_end FROM statement_v2_snapshots WHERE client_id=? ORDER BY period_end DESC LIMIT 1').get(client) as {period_end:string}|undefined;
 const first=(db.prepare("SELECT date(?,'+7 hours') day").get(epoch()) as {day:string}).day;
 if(start!==(last?shiftDay(last.period_end,1):first))throw Error('Phải đóng kỳ liên tục từ checkpoint hoặc Statement trước.');
 const p=statementPreview(actor,client,start,end);
 // Claim state remains a live projection, not a mutable field in the financial snapshot.
 const {disputed:_disputed,claim_ids:_claims,...financial}=p;
 const snapshot:StatementSnapshot={...financial,status:'FINALIZED'};
 db.prepare('INSERT INTO statement_v2_snapshots(client_id,period_start,period_end,actor_id,snapshot_json) VALUES (?,?,?,?,?)').run(client,start,end,actor.id,JSON.stringify(snapshot));
 db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,'STATEMENT_V2_FINALIZED',?)").run(client,actor.id,JSON.stringify({start,end,last_event_id:snapshot.last_event_id}));return snapshot;
 }).immediate();
}
export function listStatements(actor:AuthUser,client:number){access(actor,client);return {checkpoint_at:epoch(),items:(db.prepare('SELECT id,actor_id,finalized_at,snapshot_json FROM statement_v2_snapshots WHERE client_id=? ORDER BY period_start DESC').all(client) as Row[]).map(r=>{const s=JSON.parse(String(r.snapshot_json)) as StatementSnapshot;return {id:r.id,actor_id:r.actor_id,finalized_at:r.finalized_at,...s,...disputes(client,s.movements,s.order_ids)};})};}
