import {classifyTransaction} from './transaction-taxonomy';
/** Read-only coverage; never assigns a Payment to an individual Statement. */
export type AgeEvent={source:string;operation:string;balance_cents:number;debt_cents:number;detail:Record<string,unknown>};
export type AgeBucket={id:number;finalized_day:string;movements:AgeEvent[];aging_basis_cents?:number};
export function deriveDebtAge(signedRemaining:number,buckets:AgeBucket[],pending:AgeEvent[],opening:number,term:number,today:string,legacy?:{amount_cents:number;reference_day:string}){
 const unresolved:string[]=[];
 if(!Number.isSafeInteger(signedRemaining)||!Number.isInteger(term)||term<1)throw Error('Invalid debt age input');
 const frozenLedgerIds=new Set(buckets.flatMap(b=>b.movements.filter(e=>e.source==='ledger_entries').map(e=>Number(e.detail.id))));
 const incurred=(events:AgeEvent[],late=false)=>events.reduce((sum,e)=>{
  // Transfers and Payment-to-Debt allocations have equal Balance/Debt deltas.
  if(!Number.isSafeInteger(e.debt_cents)||!Number.isSafeInteger(e.balance_cents))throw Error('Invalid period cents');
  const delta=e.debt_cents-e.balance_cents;
  if(!delta||e.source==='OPENING')return sum;
  if(e.source==='ledger_entries'){
   const type=String(e.detail.entry_type||'');
   try{classifyTransaction(type);}catch{unresolved.push('Unclassified ledger type');}
   if(['PAYMENT','OFFSET','SERVICE_SETTLEMENT','PAYMENT_ADJUSTMENT','PAYMENT_REVERSAL'].includes(type))return sum;
   if(late&&e.operation!=='INSERT_NEW'&&frozenLedgerIds.has(Number(e.detail.id)))unresolved.push('Reversal / edited historical ledger requires review');
  }else if(e.source!=='debt_daily_interest')unresolved.push('Unclassified obligation event');
  if(!Number.isSafeInteger(sum+delta))throw Error('Period coverage exceeds exact cents range');
  return sum+delta;
 },0);
 const amount=Math.max(0,signedRemaining),unfinalized=Math.max(0,incurred(pending,true));
 let left=Math.max(0,amount-unfinalized),anchor:string|null=null,statementId:number|null=null;
 for(const b of [...buckets].sort((a,b)=>b.finalized_day.localeCompare(a.finalized_day)||b.id-a.id)){
  // New snapshots carry a frozen per-period economic basis. Historical snapshots
  // remain read-compatible until their accounting provenance is reconciled.
  const capacity=b.aging_basis_cents===undefined?incurred(b.movements):b.aging_basis_cents;
  // A net credit period adds no new aged principal. It reduces total
  // outstanding exposure through the signed Balance; do not mark REVIEW.
  // A residual without an older obligation still becomes REVIEW below.
  if(left>0&&capacity>0){anchor=b.finalized_day;statementId=b.id;left-=Math.min(left,capacity);}
 }
 const uncovered_cents=left;
 if(left>0&&legacy&&Number.isSafeInteger(legacy.amount_cents)&&legacy.amount_cents>=left&&/^\d{4}-\d{2}-\d{2}$/.test(legacy.reference_day)&&legacy.reference_day<=today){
  if(anchor===null||legacy.reference_day<anchor){anchor=legacy.reference_day;statementId=null;}
  left=0;
 }
 if(left>0)unresolved.push(opening>0?'Unresolved legacy opening exposure':'Remaining exposure exceeds frozen period coverage');
 if(unresolved.length){anchor=null;statementId=null;}
 const due=anchor?new Date(Date.parse(anchor+'T00:00:00Z')+term*86400000).toISOString().slice(0,10):null;
 return {amount_cents:amount,uncovered_cents,legacy_opening_used:uncovered_cents>0&&left===0,signed_remaining_cents:signedRemaining,unfinalized_cents:unfinalized,oldest_unpaid_statement_date:anchor,statement_id:statementId,due_date:due,status:!amount?'CLEAR':unresolved.length?'REVIEW':due?(due<today?'OVERDUE':'OPEN'):'UNFINALIZED',warnings:[...new Set(unresolved)]};
}
