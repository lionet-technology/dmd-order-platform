import {db} from './db';
import {listStatements,finalizeStatement} from './statements-v2';
import {localDay} from './credit';
import {PaymentReconciliation} from './payment-reconciliation';
import type {AuthUser} from './auth';
type Review={client_id:number;period_start:string;period_end:string;status:string;reason:string|null};
function access(actor:AuthUser){if(!['ADMIN','FINANCE'].includes(actor.role))throw Error('Forbidden');}
function schema(){
 new PaymentReconciliation(db);
 db.exec(`CREATE TABLE IF NOT EXISTS statement_monthly_close(
 client_id INTEGER NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('REVIEW','FINALIZED')),reason TEXT,actor_id INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(client_id,period_start));`);
}
export function monthlyCloseReview(actor:AuthUser){
 access(actor);schema();
 return db.prepare("SELECT * FROM statement_monthly_close WHERE status='REVIEW' AND NOT EXISTS(SELECT 1 FROM statement_v2_snapshots s WHERE s.client_id=statement_monthly_close.client_id AND s.period_start=statement_monthly_close.period_start AND s.period_end=statement_monthly_close.period_end) ORDER BY period_start,client_id").all() as Review[];
}
function paymentGate(client:number,end:string){
 const pending=db.prepare(`SELECT e.id FROM ledger_entries e
 LEFT JOIN payment_reconciliation_events r ON r.id=(SELECT MAX(x.id) FROM payment_reconciliation_events x WHERE x.ledger_id=e.id)
 WHERE e.client_user_id=? AND e.entry_type='PAYMENT' AND e.direction='CREDIT'
 AND date(e.created_at,'+7 hours')<=? AND NOT EXISTS(SELECT 1 FROM rejected_payments p WHERE p.ledger_id=e.id)
 AND (COALESCE(r.status,'PENDING')<>'CONFIRMED' OR COALESCE(r.actual_cents,r.amount_cents) IS NOT
 COALESCE((SELECT a.actual_cents FROM payment_adjustment_events a WHERE a.ledger_id=e.id ORDER BY a.id DESC LIMIT 1),ROUND(e.amount*100)))`).all(client,end) as {id:number}[];
 if(pending.length)throw Error('Payment cần Finance đối soát: '+pending.map(p=>p.id).join(', '));
}
/** Bounded resumable batch; no timers or background scheduling implied. */
export function closeMonthlyStatements(actor:AuthUser,throughMonth:string,afterClientId=0,limit=50,maxPeriods=12){
 access(actor);
 if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(throughMonth)||throughMonth>=localDay().slice(0,7))throw Error('Chỉ đóng tháng đã kết thúc, dạng YYYY-MM.');
 if(!Number.isSafeInteger(afterClientId)||afterClientId<0||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(maxPeriods)||maxPeriods<1||maxPeriods>12)throw Error('Giới hạn batch không hợp lệ.');
 schema();
 const clients=db.prepare("SELECT id FROM users WHERE role='CLIENT' AND id>? ORDER BY id LIMIT ?").all(afterClientId,limit) as {id:number}[];
 const items:Review[]=[];
 for(const client of clients)for(let i=0;i<maxPeriods;i++){
  let start='';
  const result=db.transaction(()=>{
   try{
    start=listStatements(actor,client.id).next_period_start;
    if(start.slice(0,7)>throughMonth)return null;
    const [y,m]=start.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    // Savepoint rolls back interest/allocation on any failed close; REVIEW persists outside it.
    db.transaction(()=>{paymentGate(client.id,end);finalizeStatement(actor,client.id,start,end);}).immediate();
    db.prepare("INSERT INTO statement_monthly_close(client_id,period_start,period_end,status,actor_id) VALUES (?,?,?,'FINALIZED',?) ON CONFLICT(client_id,period_start) DO UPDATE SET status='FINALIZED',reason=NULL,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(client.id,start,end,actor.id);
    return {client_id:client.id,period_start:start,period_end:end,status:'FINALIZED',reason:null};
   }catch(e){
    if(!start)throw e;
    const [y,m]=start.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),reason=(e as Error).message;
    db.prepare("INSERT INTO statement_monthly_close(client_id,period_start,period_end,status,reason,actor_id) VALUES (?,?,?,'REVIEW',?,?) ON CONFLICT(client_id,period_start) DO UPDATE SET status='REVIEW',reason=excluded.reason,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP").run(client.id,start,end,reason,actor.id);
    return {client_id:client.id,period_start:start,period_end:end,status:'REVIEW',reason};
   }
  }).immediate();
  if(!result)break;items.push(result);if(result.status==='REVIEW')break;
 }
 const remaining=clients.length===limit;
 const remaining_client_ids=clients.filter(c=>listStatements(actor,c.id).next_period_start.slice(0,7)<=throughMonth).map(c=>c.id);
 return {items,remaining_client_ids,next_client_id:remaining?clients.at(-1)!.id:null,review:monthlyCloseReview(actor),note:'Chạy batch theo yêu cầu; chưa cấu hình lịch nền. Chạy lại từ đầu để xử lý kỳ còn lại hoặc mục Review đã sửa.'};
}
