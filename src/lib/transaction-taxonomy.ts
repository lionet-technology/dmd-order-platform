/** Public ledger values stay stable. Unknown types fail closed. */
export type TransactionClass = 'OBLIGATION'|'SETTLEMENT'|'CREDIT'|'ADJUSTMENT'|'REVERSAL';
const groups: Record<TransactionClass, readonly string[]> = {
 OBLIGATION: ['ORDER_CHARGE','ADDITIONAL_FEE','SERVICE_COST','ERROR_CHARGEABLE'],
 SETTLEMENT: ['PAYMENT','OFFSET','SERVICE_SETTLEMENT'],
 CREDIT: ['REFUND','COMPENSATION','MANUAL_CREDIT','ERROR_REFUND','ERROR_PROCESSING','ADJUSTMENT_CREDIT','DEPOSIT'],
 ADJUSTMENT: ['WEIGHT_ADJUSTMENT','PURCHASE_DELTA','PRIOR_PERIOD_ADJUSTMENT','ADJUSTMENT_DEBIT'],
 REVERSAL: ['PAYMENT_REVERSAL'],
};
export function classifyTransaction(type: string): TransactionClass {
 for (const [category,types] of Object.entries(groups)) if(types.includes(type.toUpperCase())) return category as TransactionClass;
 throw Error('Loại giao dịch chưa được định nghĩa: '+type);
}
export const AUTO_ALLOCATABLE_TYPES=groups.SETTLEMENT;
export const isAutoAllocatable=(type:string)=>classifyTransaction(type)==='SETTLEMENT';
export const affectsPurchasingBalance=(type:string)=>Boolean(classifyTransaction(type))&&type.toUpperCase()!=='SERVICE_COST';
/** Credit memos affect AR only through explicit allocation; settlement/reversal changes AR. */
export const affectsReceivable=(type:string)=>type.toUpperCase()!=='SERVICE_COST'&&classifyTransaction(type)!=='CREDIT';
export const canPostBeyondCreditLimit=(type:string)=>type.toUpperCase()!=='ORDER_CHARGE'&&Boolean(classifyTransaction(type));
export const defaultDirection=(type:string)=>['CREDIT','SETTLEMENT'].includes(classifyTransaction(type))?'CREDIT' as const:'DEBIT' as const;
export const canApplyToReceivable=(type:string)=>['CREDIT','SETTLEMENT'].includes(classifyTransaction(type))&&!['ERROR_PROCESSING','DEPOSIT'].includes(type.toUpperCase());
