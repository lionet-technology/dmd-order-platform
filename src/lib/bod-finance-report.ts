import {db} from './db';
import './cases'; // Initialize legacy Claim schema used by refund compatibility checks.
import {accountFinancials,validDay} from './credit';
import {RefundService} from './refunds';
import {statementPreview,listStatements} from './statements-v2';
import {supplierAccounts} from './supplier-account';
import type {AuthUser} from './auth';

/** Read-only cross-module BOD projection. Refund obligation is NOT added to wallet or Debt. */
export function bodFinanceReport(actor:Pick<AuthUser,'role'|'id'>,start:string,end:string){
 if(!['BOD','FINANCE'].includes(actor.role))throw Error('Forbidden');
 validDay(start);validDay(end);if(start>end)throw Error('Khoảng ngày không hợp lệ.');
 return db.transaction(()=>{
 const refunds=new RefundService(db).report(actor,start,end);
 const clients=db.prepare("SELECT id,display_name FROM users WHERE role='CLIENT' ORDER BY display_name,id").all() as {id:number;display_name:string}[];
 const accounts=clients.map(c=>{
  const f=accountFinancials(c.id,{readOnly:true});
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
 const statement_periods=clients.map(c=>{
  try{const p=statementPreview(actor as AuthUser,c.id,start,end);const issued=listStatements(actor as AuthUser,c.id).items.filter(s=>s.period_start===start&&s.period_end===end);
   return {client_id:c.id,available:true,opening:p.opening,closing:p.closing,bank_posted_cents:p.bank_outflow_cents,finalized:issued[0]??null};
  }catch(e){return {client_id:c.id,available:false,error:(e as Error).message};}
 });
 const supplierData=supplierAccounts(actor as AuthUser);
 const supplier_accounts=supplierData.suppliers.map(s=>({...s,requires_review:supplierData.claims.some(c=>(c as Record<string,unknown>).supplier===s.supplier&&c.requires_review)}));
 const supplierPeriod=supplierData.entries.filter(e=>{const day=String(e.created_at).replace(' ','T')+'Z';const postingDay=new Date(new Date(day).getTime()+7*3600000).toISOString().slice(0,10);return postingDay>=start&&postingDay<=end;});
 const order_gp=db.prepare(`SELECT
 COALESCE(SUM(CASE WHEN margin_status='FINALIZED' AND actual_cost_coverage='COMPLETE' AND reconciliation_status='PASS' THEN ROUND(finalized_gp*100) ELSE 0 END),0) finalized_gp_cents,
 SUM(CASE WHEN margin_status='FINALIZED' AND actual_cost_coverage='COMPLETE' AND reconciliation_status='PASS' THEN 1 ELSE 0 END) finalized_count,
 SUM(CASE WHEN margin_status='FINALIZED' AND actual_cost_coverage='COMPLETE' AND reconciliation_status='PASS' THEN 0 ELSE 1 END) pending_count,
 COALESCE(SUM(CASE WHEN margin_status='FINALIZED' AND actual_cost_coverage='COMPLETE' AND reconciliation_status='PASS' THEN 0 ELSE ROUND(COALESCE(estimated_gp,0)*100) END),0) pending_estimated_gp_cents
 FROM orders`).get() as {finalized_gp_cents:number;finalized_count:number|null;pending_count:number|null;pending_estimated_gp_cents:number};
 const client_reconciliation={available_count:statement_periods.filter(p=>p.available).length,total_count:clients.length,unavailable:statement_periods.filter(p=>!p.available).map(p=>({client_id:p.client_id,error:p.error})),finalized_count:statement_periods.filter(p=>p.available&&p.finalized).length};
 const report={
  client_reconciliation,
  supplier_accounts,
  supplier_addons_period:{revenue_cents:supplierPeriod.reduce((n,e)=>n+Number(e.revenue_cents),0),cost_cents:supplierPeriod.reduce((n,e)=>n+Number(e.cost_cents),0)},
  order_gp:{...order_gp,finalized_count:order_gp.finalized_count||0,pending_count:order_gp.pending_count||0},
  statement_periods,
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
   'Supplier balances/receivables and Order GP are current as-of query; Add-ons use Vietnam posting period. No inferred historical Supplier opening or company bank reconciliation.',
   'Only approved COMPLETE Actual Cost contributes finalized Order GP. Pending estimated GP and Supplier Add-ons stay separate; this is not company net profit.']
 };
 if(report.ledger_flows.payment_net_cents+report.ledger_flows.refund_balance_net_cents+
   report.ledger_flows.service_and_adjustment_net_cents!==report.ledger_flows.net_balance_change_cents)throw Error('BOD Ledger report invariant failed');
 return report;
 }).immediate();
}
