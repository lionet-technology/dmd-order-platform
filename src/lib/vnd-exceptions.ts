import {vndSupplierExposure} from './vnd-supplier-exposure';
import {db} from './db';
import {approvedVndLot} from './vnd-supplier';
import type {AuthUser} from './auth';
import {vndBalance} from './vnd-operational';
import {compareVnd} from './vnd-money';
import {supplierImportView} from './vnd-supplier-import';
type Row=Record<string,unknown>;
export function vndExceptions(actor:AuthUser){return db.transaction(()=>read(actor)).deferred();}
function read(actor:AuthUser){
 const u=db.prepare('SELECT role,active FROM users WHERE id=?').get(actor.id) as Row|undefined;
 if(!u?.active||u.role!==actor.role||!['ADMIN','FINANCE','BOD','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền xem ngoại lệ VNĐ.');
 const internal=['ADMIN','FINANCE','BOD'].includes(actor.role);
 const clients=db.prepare("SELECT a.client_id FROM vnd_accounts a JOIN users u ON u.id=a.client_id WHERE ?=1 OR (?='CLIENT' AND u.id=?) OR (?='SALES' AND u.sales_user_id=?)").all(internal?1:0,actor.role,actor.id,actor.role,actor.id) as {client_id:number}[];
 const purchase:Row[]=[],financial:Row[]=[],pricing:Row[]=[],missing:Row[]=[],supplierLosses:Row[]=[];
 for(const c of clients){
  const b=vndBalance(c.client_id);if(compareVnd(b.available,'0')<0)financial.push({client_id:c.client_id,status:'NEGATIVE_HEADROOM',balance:b.balance,reserved:b.reserved,available:b.available});
  const rows=db.prepare('SELECT r.*,o.order_id order_code,o.supplier FROM vnd_purchase_requests r JOIN orders o ON o.id=r.order_id WHERE r.client_id=?').all(c.client_id) as Row[];
  for(const r of rows){
   const q=db.prepare('SELECT snapshot_json,pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(r.order_id) as Row|undefined;
   if(['AWAITING_QUOTE','PRICE_CONFIRMATION_REQUIRED','AWAITING_FUNDS'].includes(String(r.status))||q?.pricing_error)purchase.push({order_id:r.order_id,order_code:r.order_code,client_id:c.client_id,status:r.status,pricing_error:!!q?.pricing_error});
   if(q&&['ADMIN','BOD','SALES'].includes(actor.role)){const quote=JSON.parse(String(q.snapshot_json));if(typeof quote.base_vnd==='string'&&typeof r.offer==='string'&&compareVnd(r.offer,quote.base_vnd)<=0)pricing.push({order_id:r.order_id,client_id:c.client_id,status:'SELLING_AT_OR_BELOW_BASE'});}
   if(internal&&['CHARGED','CANCELLED'].includes(String(r.status))){
    const exposure=vndSupplierExposure(Number(r.order_id));
    if(exposure.loss)supplierLosses.push({order_id:r.order_id,order_code:r.order_code,client_id:c.client_id,
     status:'SUPPLIER_ORDER_LOSS',revenue:exposure.revenue,obligation:exposure.obligation});
   }
   if(internal&&r.status==='CHARGED'){
    const lots=(db.prepare('SELECT id FROM order_lots WHERE order_id=?').all(r.order_id) as {id:number}[])
     .filter(lot=>!approvedVndLot(lot.id));
    if(lots.length)missing.push({order_id:r.order_id,client_id:c.client_id,supplier:r.supplier,status:'MISSING_APPROVED_ACTUAL',lots:lots.length});
   }
  }
 }
 const imports=internal?(db.prepare('SELECT DISTINCT supplier FROM vnd_supplier_import_rows').all() as {supplier:string}[]).flatMap(s=>supplierImportView(s.supplier).filter(r=>!r.decision).map(r=>({id:(r as unknown as Row).id,supplier:s.supplier,lot_id:r.lot_id,status:r.errors.length?'REVIEW_ERRORS':'AWAITING_REVIEW',errors:r.tags}))):[];
 const queues={purchasing:purchase,financial_flags:financial,pricing_flags:pricing,missing_actual:missing,supplier_import:imports,supplier_order_losses:supplierLosses};
 return {currency:'VND',queues,counts:Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,v.length])),read_only:true};
}
