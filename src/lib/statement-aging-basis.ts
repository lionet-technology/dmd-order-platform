import {classifyTransaction} from './transaction-taxonomy';
/**
 * Monetary obligation CREATED by a reporting period, not its closing Balance.
 * Payment, Debt transfer, Refund payout and posted Debt interest are NOT new
 * principal obligations. Credits reduce this period's net obligation.
 * An unknown journal type blocks finalization rather than silently aging it.
 */
export function statementAgingBasis(events:{source:string;balance_cents:number;debt_cents:number;detail:Record<string,unknown>}[]):number{
 let amount=0;
 for(const event of events){
  if(event.source!=='ledger_entries')continue;
  const type=String(event.detail?.entry_type||'');
  const cls=classifyTransaction(type);
  if(cls==='SETTLEMENT'||cls==='REVERSAL'||type==='PAYMENT_ADJUSTMENT'||(type==='ADJUSTMENT_DEBIT'&&String(event.detail?.reference_type)==='REFUND_ACTUAL'))continue;
  // Signed cents: debit creates obligation; credit reduces it.
  amount+=Number(event.debt_cents)-Number(event.balance_cents);
  if(!Number.isSafeInteger(amount))throw Error('Aging basis exceeds exact cents range');
 }
 return amount;
}
