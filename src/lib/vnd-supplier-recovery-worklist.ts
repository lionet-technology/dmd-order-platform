import type {AuthUser} from './auth';
import {db} from './db';
import {lotFulfillments} from './vnd-fulfillment';
import {compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {allocateVndRefund,type RefundOrderBasis} from './vnd-refund-allocation';

type RefundRow={
 client_claim_id:number;
 decision_id:number;
 approved:string;
 context_json:string|null;
 order_id:number;
 order_code:string;
 supplier_claim_id:number|null;
 latest_approved:string|null;
};

export function supplierRecoveryWorklist(actor:AuthUser){
 if(!['ADMIN','FINANCE','BOD'].includes(actor.role))throw Error('Không có quyền xem Supplier Recovery.');
 return db.transaction(readWorklist).deferred();
}

function readWorklist(){
 const refunds=db.prepare(`SELECT c.id client_claim_id,e.id decision_id,e.approved,e.context_json,
  o.id order_id,COALESCE(o.system_order_code,o.order_id) order_code,
  source.supplier_claim_id,
  (SELECT approved FROM vnd_supplier_claim_events se WHERE se.claim_id=source.supplier_claim_id
    AND se.kind IN ('APPROVE','CORRECT') ORDER BY se.id DESC LIMIT 1) latest_approved
  FROM vnd_claims c JOIN vnd_refund_events e ON e.id=(
   SELECT MAX(d.id) FROM vnd_refund_events d WHERE d.claim_id=c.id AND d.kind='DECISION'
  )
  JOIN json_each(c.orders_json) member
  JOIN orders o ON o.id=member.value AND o.client_user_id=c.client_id
  LEFT JOIN vnd_supplier_recovery_sources source ON source.client_claim_id=c.id AND source.order_id=o.id
  ORDER BY e.id DESC,o.id`).all() as RefundRow[];
 const recognized=db.prepare(`SELECT a.allocation_json FROM vnd_supplier_recovery_allocations a
  JOIN vnd_supplier_claim_events e ON e.id=a.supplier_decision_id WHERE e.claim_id=? AND a.order_id=?
  ORDER BY e.id DESC LIMIT 1`);
 const lots=db.prepare('SELECT id FROM order_lots WHERE order_id=? ORDER BY id');
 return refunds.filter(row=>row.supplier_claim_id||compareVnd(row.approved,'0')>0).flatMap(row=>{
  const context=row.context_json?JSON.parse(row.context_json):null;
  const allocation=context?.allocation?.find((item:{order_id:number})=>item.order_id===row.order_id);
  if(!row.supplier_claim_id&&allocation&&compareVnd(allocation.total_vnd,'0')===0)return [];
  const fulfillment=(lots.all(row.order_id) as {id:number}[]).map(lot=>lotFulfillments(lot.id));
  const attempts=fulfillment.flatMap(lot=>lot?.attempts.map(attempt=>({
   lot_id:attempt.lot_id,epoch:attempt.id,supplier:attempt.supplier,
   trackings:attempt.trackings.map(tracking=>tracking.tracking),
  }))??[]);
  const needsReview=!allocation||!attempts.length||attempts.some(attempt=>!attempt.supplier?.trim())
   ||fulfillment.some(lot=>!lot||lot.incomplete);
  const posted=row.supplier_claim_id?recognized.get(row.supplier_claim_id,row.order_id) as {allocation_json:string}|undefined:undefined;
  const recovered=posted?String(JSON.parse(posted.allocation_json).total_vnd):'0';
  const remaining=allocation?subtractVnd(allocation.total_vnd,recovered):null;
  return [{
   client_claim_id:row.client_claim_id,decision_id:row.decision_id,order_id:row.order_id,
   order_code:row.order_code,refund_vnd:allocation?.total_vnd??null,attempts,needs_review:needsReview,
   supplier_claim_id:row.supplier_claim_id,recovered_vnd:recovered,
   unrecovered_vnd:remaining===null?null:compareVnd(remaining,'0')>0?remaining:'0',
   recovery_status:row.supplier_claim_id?(row.latest_approved===null?'IN_CLAIM':'DECIDED'):'PENDING',
  }];
 });
}

type Selection={client_claim_id:number;decision_id:number;order_id:number;lot_id:number;epoch:number};
type Basis=RefundOrderBasis & {sales_user_id:number|null;origin_month:string|null};

export function selectRecoverySources(supplier:string,input:unknown){
 if(!Array.isArray(input)||!input.length||input.length>200)throw Error('Chọn từ 1 đến 200 Order.');
 const orders=new Set<number>();
 return (input as Selection[]).map(item=>{
  if(!item||!Number.isSafeInteger(item.order_id)||orders.has(item.order_id))
   throw Error('Chọn mỗi Order một lần trong cùng Supplier Claim.');
  orders.add(item.order_id);
  const row=db.prepare(`SELECT e.context_json,o.sales_user_id,substr(datetime(o.service_purchased_at,'+7 hours'),1,7) origin_month
   FROM vnd_claims c JOIN json_each(c.orders_json) member
   JOIN orders o ON o.id=member.value AND o.client_user_id=c.client_id
   JOIN vnd_refund_events e ON e.id=(SELECT MAX(id) FROM vnd_refund_events WHERE claim_id=c.id AND kind='DECISION')
   WHERE c.id=? AND o.id=? AND e.id=?`).get(item.client_claim_id,item.order_id,item.decision_id) as
   {context_json:string|null;sales_user_id:number|null;origin_month:string|null}|undefined;
  const context=row?.context_json?JSON.parse(row.context_json):null;
  const basis=context?.orders?.find((order:RefundOrderBasis)=>order.order_id===item.order_id) as Basis|undefined;
  const allocation=context?.allocation?.find((order:RefundOrderBasis)=>order.order_id===item.order_id);
  if(!row||!basis||!allocation||compareVnd(allocation.total_vnd,'0')<=0)
   throw Error('Cần quyết định hoàn tiền mới nhất đã phân bổ cho Order.');
  if(db.prepare('SELECT 1 FROM vnd_supplier_recovery_sources WHERE client_claim_id=? AND order_id=?').get(item.client_claim_id,item.order_id))
   throw Error('Order của Client Claim này đã có Supplier Claim.');
  const history=lotFulfillments(item.lot_id);
  const attempt=history?.attempts.find(attempt=>attempt.id===item.epoch&&attempt.supplier===supplier);
  if(!history||history.incomplete||history.lot.order_id!==item.order_id||!attempt)
   throw Error('Lượt fulfillment không khớp Order và Supplier hoặc thiếu lịch sử.');
  const existing=db.prepare(`SELECT 1 FROM vnd_supplier_claims c JOIN json_each(c.lots_json) lot
   WHERE c.supplier=? COLLATE NOCASE AND lot.value=? AND NOT EXISTS(
    SELECT 1 FROM vnd_supplier_recovery_sources s WHERE s.supplier_claim_id=c.id
   )`).get(supplier,item.lot_id);
  if(existing)throw Error('Lot đang có Supplier Claim cũ; cần đối chiếu hồ sơ trước khi gom.');
  return {selection:item,basis:{...basis,sales_user_id:Object.hasOwn(basis,"sales_user_id")?basis.sales_user_id:row.sales_user_id,origin_month:row.origin_month},attempt};
 });
}

export function postRecoveryAllocation(claimId:number,decisionId:number,approved:string){
 const sources=db.prepare('SELECT order_id,basis_json FROM vnd_supplier_recovery_sources WHERE supplier_claim_id=? ORDER BY order_id')
  .all(claimId) as {order_id:number;basis_json:string}[];
 if(!sources.length)return;
 const basis=sources.map(row=>JSON.parse(row.basis_json) as Basis);
 const previous=db.prepare(`SELECT a.allocation_json FROM vnd_supplier_recovery_allocations a
  JOIN vnd_supplier_claim_events e ON e.id=a.supplier_decision_id
  WHERE e.claim_id=? AND a.order_id=? ORDER BY e.id DESC LIMIT 1`);
 const insert=db.prepare(`INSERT INTO vnd_supplier_recovery_allocations(supplier_decision_id,order_id,sales_user_id,origin_month,prior_json,allocation_json)
  VALUES (?,?,?,?,?,?)`);
 allocateVndRefund(approved,basis).forEach((allocation,index)=>{
  const row=basis[index];
  const last=previous.get(claimId,row.order_id) as {allocation_json:string}|undefined;
  insert.run(decisionId,row.order_id,row.sales_user_id,row.origin_month,last?.allocation_json??null,JSON.stringify(allocation));
 });
}

export function supplierRecoveryMovements(month:string){
 const rows=db.prepare(`SELECT a.*,e.claim_id supplier_claim_id,e.reference,c.supplier,
  substr(datetime(e.created_at,'+7 hours'),1,7) posting_month
  FROM vnd_supplier_recovery_allocations a JOIN vnd_supplier_claim_events e ON e.id=a.supplier_decision_id
  JOIN vnd_supplier_claims c ON c.id=e.claim_id
  WHERE substr(datetime(e.created_at,'+7 hours'),1,7)=? ORDER BY e.id,a.order_id`).all(month) as {
   supplier_decision_id:number;order_id:number;sales_user_id:number|null;origin_month:string|null;
   prior_json:string|null;allocation_json:string;supplier_claim_id:number;reference:string;
   supplier:string;posting_month:string
  }[];
 return rows.map(({prior_json,allocation_json,...row})=>{
  type Allocation=ReturnType<typeof allocateVndRefund>[number];
  const current=JSON.parse(allocation_json) as Allocation;
  const prior=prior_json?JSON.parse(prior_json) as Allocation:null;
  const delta=(key:Exclude<keyof Allocation,'order_id'>)=>subtractVnd(current[key],prior?.[key]??'0');
  const tax=delta('tax_vnd');
  return {...row,gp_net_recovery_delta:delta('total_vnd'),selling_delta:delta('selling_vnd'),surcharge_delta:delta('surcharge_vnd'),tax_delta:tax,
   compensation_delta:delta('compensation_vnd'),recovery_delta:delta('total_vnd')};
 });
}

/** Latest approved amount per claim and Order; settlement events never enter this sum. */
export function approvedRecoveryForOrder(orderId:number){
 const rows=db.prepare(`SELECT json_extract(a.allocation_json,'$.total_vnd') total
  FROM vnd_supplier_recovery_allocations a JOIN vnd_supplier_claim_events e ON e.id=a.supplier_decision_id
  WHERE a.order_id=? AND e.id=(SELECT MAX(d.id) FROM vnd_supplier_claim_events d
   WHERE d.claim_id=e.claim_id AND d.kind IN ('APPROVE','CORRECT'))`).all(orderId) as {total:string}[];
 return sumVnd(rows.map(row=>row.total));
}
