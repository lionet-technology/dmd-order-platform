import {db} from './db';
import {supplierPeriodView,closeSupplierPeriod,supplierPostingCursor,linkSupplierPostings} from './vnd-supplier-periods';
import {supplierImportView,applySupplierImport} from './vnd-supplier-import';
import {applySupplierClaim,supplierClaimView} from './vnd-supplier-claims';
import type {AuthUser} from './auth';
import {canonicalEnumValue} from './enums';
import {vnd,compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay,vndDay} from './vnd-debt';
type Row=Record<string,unknown>;
function access(actor:AuthUser){const u=db.prepare('SELECT role,active FROM users WHERE id=?').get(actor.id) as Row|undefined;if(!u?.active||u.role!==actor.role||!['ADMIN','FINANCE','BOD'].includes(actor.role))throw Error('Không có quyền Supplier VNĐ.');}
function money(value:unknown){if(typeof value!=='string')throw Error('Cần chuỗi VNĐ.');const n=vnd(value);if(compareVnd(n,'0')<0)throw Error('Cost không được âm.');return n;}
function required(value:unknown){const s=typeof value==='string'?value.trim():'';if(!s||s.length>2000)throw Error('Cần lý do/chứng từ.');return s;}
export function approvedVndLot(lotId:number,supplier?:string){
 const currentSupplier=supplier??(db.prepare('SELECT o.supplier FROM order_lots l JOIN orders o ON o.id=l.order_id WHERE l.id=?').get(lotId) as {supplier:string}|undefined)?.supplier;
 if(!currentSupplier)return undefined;
 return db.prepare("SELECT c.* FROM vnd_supplier_costs c JOIN vnd_supplier_ledger l ON l.cost_id=c.id AND l.kind='ACTUAL' WHERE c.lot_id=? AND c.supplier=? ORDER BY l.id DESC LIMIT 1").get(lotId,currentSupplier) as Row|undefined;
}
export function vndLotEstimate(lotId:number){
 const lot=db.prepare('SELECT * FROM order_lots WHERE id=?').get(lotId) as Row|undefined;if(!lot)return null;
 const row=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(lot.order_id) as Row|undefined;if(!row)return null;
 const quote=JSON.parse(String(row.snapshot_json));
 if(Array.isArray(quote.lots)){const q=quote.lots.find((l:Row)=>l.lot_id===lotId);const value=q?.selected?.net_vnd??q?.net_vnd;if(typeof value==='string')return value;}
 const count=(db.prepare('SELECT count(*) n FROM order_lots WHERE order_id=?').get(lot.order_id) as {n:number}).n;
 return count===1&&typeof quote.net_vnd==='string'?quote.net_vnd:null;
}
export function vndSupplierView(actor:AuthUser,supplierRaw:unknown){return db.transaction(()=>readSupplier(actor,supplierRaw)).deferred();}
function readSupplier(actor:AuthUser,supplierRaw:unknown){
 access(actor);const supplier=canonicalEnumValue('SUPPLIER',supplierRaw,'',{allowInactive:true});
 const costs=db.prepare('SELECT c.*,l.order_id,l.lot_number FROM vnd_supplier_costs c JOIN order_lots l ON l.id=c.lot_id WHERE c.supplier=? ORDER BY c.id DESC').all(supplier) as Row[];
 const reviews=db.prepare('SELECT r.* FROM vnd_supplier_reviews r JOIN vnd_supplier_costs c ON c.id=r.cost_id WHERE c.supplier=? ORDER BY r.id').all(supplier);
 const projection=costs.map(c=>({...c,estimated:vndLotEstimate(Number(c.lot_id)),approved_cost_id:approvedVndLot(Number(c.lot_id),supplier)?.id??null}));
 if(actor.role==='ADMIN')return {currency:'VND',supplier,costs:projection,reviews,import_rows:supplierImportView(supplier)};
 const entries=db.prepare('SELECT * FROM vnd_supplier_ledger WHERE supplier=? ORDER BY id').all(supplier) as Row[];
 return {currency:'VND',supplier,costs:projection,reviews,import_rows:supplierImportView(supplier),...supplierClaimView(supplier),...supplierPeriodView(supplier),payable:sumVnd(entries.map(e=>String(e.delta))),entries};
}
export function vndSupplierAction(actor:AuthUser,input:Row){
 return db.transaction(()=>{
 access(actor);const action=String(input.action),key=required(input.request_key),reason=required(input.reason);
 const payload=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
 const prior=db.prepare('SELECT * FROM vnd_commands WHERE request_key=?').get(key) as Row|undefined;
 if(prior){if(prior.actor_id!==actor.id||prior.payload!==payload)throw Error('request_key đã dùng.');return vndSupplierView(actor,input.supplier);}
 const supplier=canonicalEnumValue('SUPPLIER',input.supplier,'',{allowInactive:true});
 const cursor=supplierPostingCursor();
 if(action==='close_period'){
  closeSupplierPeriod(actor,supplier,input,reason);
 }else if(action==='import'||action==='review_import'){
  applySupplierImport(actor,supplier,input,reason);
 }else if(action.startsWith('claim_')){
  applySupplierClaim(actor,supplier,input,reason);
 }else if(action==='submit'){
  let lotId=Number(input.lot_id);
  if(input.tracking){
   if(input.lot_id!==undefined)throw Error('Chọn Tracking hoặc Lot, không đồng thời.');
   const lots=db.prepare("SELECT DISTINCT l.id FROM order_trackings t JOIN order_lots l ON l.order_id=t.order_id AND l.lot_number=t.lot_number JOIN vnd_purchase_requests r ON r.order_id=l.order_id JOIN orders o ON o.id=l.order_id WHERE t.tracking=? AND o.supplier=?").all(required(input.tracking),supplier) as Row[];
   if(lots.length!==1)throw Error('Tracking không ánh xạ duy nhất tới Lot VNĐ.');lotId=Number(lots[0].id);
  }
  const lot=db.prepare('SELECT l.*,o.supplier,r.status FROM order_lots l JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests r ON r.order_id=o.id WHERE l.id=?').get(lotId) as Row|undefined;
  if(!lot||lot.supplier!==supplier||!['CHARGED','CANCELLED'].includes(String(lot.status)))throw Error('Cần Lot VNĐ đã charge của Supplier.');
  // Every documentary total is pending; duplicates never replace/add the current actual automatically.
  db.prepare('INSERT INTO vnd_supplier_costs(lot_id,supplier,amount,reference,reason,actor_id) VALUES (?,?,?,?,?,?)').run(lotId,supplier,money(input.amount),required(input.reference),reason,actor.id);
 }else if(action==='approve'||action==='keep_old'){
  if(action==='approve'&&!['FINANCE','BOD'].includes(actor.role))throw Error('Chốt payable cần Finance/BOD.');
  if(action==='keep_old'&&!['ADMIN','FINANCE'].includes(actor.role))throw Error('Xử lý trùng cần Admin/Finance.');
  const cost=db.prepare('SELECT * FROM vnd_supplier_costs WHERE id=? AND supplier=?').get(Number(input.cost_id),supplier) as Row|undefined;
  if(!cost)throw Error('Không có chứng từ.');
  const old=approvedVndLot(Number(cost.lot_id),supplier);
  if(input.expected_approved_cost_id!==Number(old?.id??0))throw Error('Actual đã thay đổi; tải lại.');
  if(db.prepare('SELECT id FROM vnd_supplier_reviews WHERE cost_id=?').get(cost.id))throw Error('Chứng từ đã xử lý.');
  if(action==='keep_old'&&!old)throw Error('Chưa có Actual cũ để giữ.');
  db.prepare('INSERT INTO vnd_supplier_reviews(cost_id,action,reason,actor_id) VALUES (?,?,?,?)').run(cost.id,action,reason,actor.id);
  if(action==='approve')db.prepare("INSERT INTO vnd_supplier_ledger(supplier,kind,delta,cost_id,reference,reason,actor_id) VALUES (?,'ACTUAL',?,?,?,?,?)").run(supplier,subtractVnd(String(cost.amount),String(old?.amount??'0')),cost.id,cost.reference,reason,actor.id);
 }else if(action==='payment'||action==='adjustment'){
  if(!['FINANCE','BOD'].includes(actor.role))throw Error('Supplier ledger cần Finance/BOD.');
  const reference=required(input.reference);
  if(db.prepare("SELECT id FROM vnd_supplier_ledger WHERE supplier=? AND lower(reference)=lower(?)").get(supplier,reference)||db.prepare('SELECT e.id FROM vnd_supplier_claim_events e JOIN vnd_supplier_claims c ON c.id=e.claim_id WHERE c.supplier=? AND lower(e.reference)=lower(?)').get(supplier,reference)||db.prepare('SELECT id FROM vnd_supplier_claims WHERE supplier=? AND lower(reference)=lower(?)').get(supplier,reference))throw Error('Tham chiếu payment/adjustment trùng.');
  let delta:string,day:string|null=null;
  if(action==='payment'){const n=money(input.amount);if(n==='0')throw Error('Payment phải dương.');delta=subtractVnd('0',n);day=validVndDay(input.executed_day);if(day>vndDay())throw Error('Chỉ ghi tiền đã trả.');}
  else {if(typeof input.amount!=='string')throw Error('Cần chuỗi VNĐ.');delta=vnd(input.amount);}
  db.prepare('INSERT INTO vnd_supplier_ledger(supplier,kind,delta,reference,executed_day,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(supplier,action.toUpperCase(),delta,reference,day,reason,actor.id);
 }else throw Error('Thao tác Supplier chưa hỗ trợ.');
 linkSupplierPostings(actor,supplier,input,reason,cursor);
 const result=vndSupplierView(actor,supplier);
 db.prepare('INSERT INTO vnd_commands(request_key,actor_id,payload,result_json) VALUES (?,?,?,?)').run(key,actor.id,payload,JSON.stringify(result));return result;
 }).immediate();
}
