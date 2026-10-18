export type SearchableLot={order_reference:string;order_id:number;system_order_code?:string;customer:string;service?:string;sub_service?:string;supplier?:string;reconciliation_status:string|null;actual_cost_coverage:string};
export type LotFilters={query:string;status:string;route:string;coverage:string};
export const lotRoute=(lot:SearchableLot)=>[lot.service,lot.sub_service,lot.supplier].filter(Boolean).join(' / ');
const folded=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterReconciliationLots<T extends SearchableLot>(lots:T[],filters:LotFilters):T[]{
 const terms=filters.query.split(/[\n,;]+/).map(s=>folded(s.trim())).filter(Boolean);
 return lots.filter(l=>{
  const haystack=folded([l.order_reference,l.system_order_code,String(l.order_id),l.customer,lotRoute(l)].join(' '));
  return (!terms.length||terms.some(term=>haystack.includes(term)))&&(!filters.status||(l.reconciliation_status||'PENDING')===filters.status)&&(!filters.route||lotRoute(l)===filters.route)&&(!filters.coverage||(l.actual_cost_coverage||'UNKNOWN')===filters.coverage);
 });
}
export function selectLotPage(selected:number[],pageIds:number[]):number[]{
 const next=pageIds.every(id=>selected.includes(id))?selected.filter(id=>!pageIds.includes(id)):[...new Set([...selected,...pageIds])];
 if(next.length>200)throw Error('Mỗi lần chỉ xử lý tối đa 200 Lot. Bỏ bớt lựa chọn trước khi chọn thêm.');
 return next;
}
