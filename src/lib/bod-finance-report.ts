import {db} from './db';
import './cases'; // Initialize legacy Claim schema used by refund compatibility checks.
import {accountFinancials,validDay} from './credit';
import {RefundService} from './refunds';
import type {AuthUser} from './auth';

/** Read-only cross-module BOD projection. Refund obligation is NOT added to wallet or Debt. */
export function bodFinanceReport(actor:Pick<AuthUser,'role'|'id'>,start:string,end:string){
 if(!['BOD','FINANCE'].includes(actor.role))throw Error('Forbidden');
 validDay(start);validDay(end);if(start>end)throw Error('Khoảng ngày không hợp lệ.');
 const refunds=new RefundService(db).report(actor,start,end);
 const clients=db.prepare("SELECT id,display_name FROM users WHERE role='CLIENT' ORDER BY display_name,id").all() as {id:number;display_name:string}[];
 const accounts=clients.map(c=>{
  const f=accountFinancials(c.id);
  const refund=refunds.clients.find(x=>x.client_id===c.id);
  return {client_id:c.id,display_name:c.display_name,balance_cents:f.net_balance_cents,
   debt_outstanding_cents:f.debts.reduce((s,d)=>s+d.outstanding_cents,0),
   refund_balance_cents:refund?.refund_balance_cents??0,reserve_cents:f.reserved_cents,
   available_to_buy_cents:f.available_to_buy_cents,purchase_blocked:f.purchase_blocked};
 });
 // Finance activity is posted exactly once in Ledger. Use posting date, not Order economic date,
 // to prevent backdated adjustments from silently rewriting a finalized past report.
 const postings=db.prepare(`SELECT entry_type,direction,ROUND(amount*100) amount_cents,client_user_id,id,created_at
 FROM ledger_entries WHERE client_user_id IS NOT NULL AND entry_type!='SERVICE_COST'
 AND date(created_at,'+7 hours') BETWEEN ? AND ? ORDER BY created_at,id`).all(start,end) as
 {entry_type:string;direction:string;amount_cents:number;client_user_id:number;id:number;created_at:string}[];
 const sum=(predicate:(x:typeof postings[number])=>boolean)=>postings.filter(predicate).reduce((s,e)=>s+(e.direction==='CREDIT'?1:-1)*e.amount_cents,0);
 const refundWalletIds=new Set((refunds.events as {ledger_id?:number;kind:string}[]).filter(e=>e.kind==='TO_BALANCE'||e.kind==='RECOVERY').map(e=>e.ledger_id).filter((v):v is number=>typeof v==='number'));
 const report={
  period_start:start,period_end:end,accounts,
  balances:{negative_clients_cents:accounts.reduce((s,c)=>s+Math.max(0,-c.balance_cents),0),
   positive_clients_cents:accounts.reduce((s,c)=>s+Math.max(0,c.balance_cents),0),
   debt_outstanding_cents:accounts.reduce((s,c)=>s+c.debt_outstanding_cents,0),
   reserve_cents:accounts.reduce((s,c)=>s+c.reserve_cents,0)},
  refunds:{owes_clients_cents:refunds.owes_clients_cents,overpaid_clients_cents:refunds.overpaid_clients_cents,
   bank_outflow_cents:refunds.bank_outflow_cents,balance_refund_cents:refunds.balance_refund_cents,
   categories:refunds.categories,bank_events:refunds.bank_events},
  ledger_flows:{net_balance_change_cents:sum(()=>true),
   payment_net_cents:sum(e=>['PAYMENT','PAYMENT_ADJUSTMENT','PAYMENT_REVERSAL'].includes(e.entry_type)),
   refund_balance_net_cents:sum(e=>refundWalletIds.has(e.id)),
   service_and_adjustment_net_cents:sum(e=>!['PAYMENT','PAYMENT_ADJUSTMENT','PAYMENT_REVERSAL'].includes(e.entry_type)&&!refundWalletIds.has(e.id)),
   postings_count:postings.length},
  limitations:['Signed wallet and Debt balances are current as-of query, not period-end reconstructed snapshots.',
   'Bank refunds are reported as cash outflow, not Client wallet entries.',
   'Statement finalization and Supplier cash reconciliation are separate modules.']
 };
 if(report.ledger_flows.payment_net_cents+report.ledger_flows.refund_balance_net_cents+
   report.ledger_flows.service_and_adjustment_net_cents!==report.ledger_flows.net_balance_change_cents)throw Error('BOD Ledger report invariant failed');
 return report;
}
