import { db } from './db';
import { cents, localDay, audit } from './credit';
import type { AuthUser } from './auth';
import { moneyCommand } from './money-command';
import { logAdminEvent, publishPublicNote } from './order-audit';
import { ensureOrderShipmentStructure } from './order-shipments';
type Row=Record<string,unknown>;
// Next.js may evaluate API modules in parallel build workers. Serialize the
// check-and-ALTER sequence across SQLite connections to avoid migration races.
export function reconciliationSchema(){
 db.transaction(() => {
 for(const name of ['finalized_gp','finalized_margin_pct','estimated_gp','estimated_margin_pct'])if(!(db.prepare('PRAGMA table_info(orders)').all() as Row[]).some(r=>r.name===name))db.exec(`ALTER TABLE orders ADD COLUMN ${name} REAL`);
 for(const [name,type] of Object.entries({actual_cost_coverage:"TEXT NOT NULL DEFAULT 'UNKNOWN'",effective_net_cost:'REAL',cost_coverage_json:'TEXT'}))if(!(db.prepare('PRAGMA table_info(orders)').all() as Row[]).some(r=>r.name===name))db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
 db.exec(`CREATE TABLE IF NOT EXISTS lot_cost_components(lot_id INTEGER NOT NULL REFERENCES order_lots(id),component TEXT NOT NULL CHECK(component IN ('LAST_MILE','MID_MILE','WAREHOUSE','OTHER')),estimated_cents INTEGER NOT NULL CHECK(estimated_cents>=0),actual_cents INTEGER CHECK(actual_cents>=0),reference TEXT NOT NULL,PRIMARY KEY(lot_id,component));
 CREATE TABLE IF NOT EXISTS lot_reconciliation_versions(id INTEGER PRIMARY KEY,lot_id INTEGER NOT NULL REFERENCES order_lots(id),estimated_cents INTEGER,actual_cents INTEGER,status TEXT NOT NULL,decision TEXT,reason TEXT,actor_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS lot_cost_adjustments(id INTEGER PRIMARY KEY,lot_id INTEGER NOT NULL REFERENCES order_lots(id),delta_cents INTEGER NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS lot_reconciliation_settings(lot_id INTEGER PRIMARY KEY REFERENCES order_lots(id),estimated_cents INTEGER,replacement_cents INTEGER,replacement_reason TEXT);
 CREATE TRIGGER IF NOT EXISTS immutable_lot_adjustment_update BEFORE UPDATE ON lot_cost_adjustments BEGIN SELECT RAISE(ABORT,'Cost adjustment history is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_lot_adjustment_delete BEFORE DELETE ON lot_cost_adjustments BEGIN SELECT RAISE(ABORT,'Cost adjustment history is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_lot_version_update BEFORE UPDATE ON lot_reconciliation_versions BEGIN SELECT RAISE(ABORT,'Reconciliation history is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_lot_version_delete BEFORE DELETE ON lot_reconciliation_versions BEGIN SELECT RAISE(ABORT,'Reconciliation history is immutable'); END;`);
 if(!(db.prepare('PRAGMA table_info(lot_reconciliation_versions)').all() as Row[]).some(r=>r.name==='cost_snapshot_json'))db.exec('ALTER TABLE lot_reconciliation_versions ADD COLUMN cost_snapshot_json TEXT');
 }).immediate();
}
reconciliationSchema();
export function reconcileLots(orderId:number){
 ensureOrderShipmentStructure(orderId);
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as Row;
 const lots=db.prepare('SELECT * FROM order_lots WHERE order_id=? ORDER BY lot_number').all(orderId) as Row[];
 const results=lots.map(lot=>{
 const settings=db.prepare('SELECT * FROM lot_reconciliation_settings WHERE lot_id=?').get(lot.id) as Row|undefined;
 const cost=db.prepare('SELECT COUNT(*) n,SUM(ROUND(total_net_cost*100)) actual FROM supplier_costs WHERE order_lot_id=?').get(lot.id) as {n:number;actual:number|null};
 const estimated=settings?.estimated_cents??(lots.length===1&&order.est_net_cost!=null?cents(order.est_net_cost):null);
 const components=db.prepare('SELECT * FROM lot_cost_components WHERE lot_id=? ORDER BY component').all(lot.id) as Row[];
 if(components.length&&cost.n)throw Error('Aggregate supplier cost không được trộn với component cost.');
 // Explicit components replace the aggregate envelope; never add both representations.
 const baseActual=components.length?components.every(c=>c.actual_cents!==null)?components.reduce((n,c)=>n+Number(c.actual_cents),0):null:cost.n?cost.actual:settings?.replacement_cents??null;
 const epacket=/epacket/i.test([order.service,order.sub_service].join(' '));
 const coverage=components.length?(components.every(c=>c.actual_cents!==null)?'COMPLETE':'PARTIAL'):epacket?'UNKNOWN':baseActual===null?'UNKNOWN':'COMPLETE';
 const effective=components.length?components.reduce((n,c)=>n+Number(c.actual_cents??c.estimated_cents),0):coverage==='COMPLETE'?baseActual:null;
 const adjustment=Number((db.prepare('SELECT COALESCE(SUM(delta_cents),0) n FROM lot_cost_adjustments WHERE lot_id=?').get(lot.id) as {n:number}).n);
 const actual=baseActual===null?null:Number(baseActual)+adjustment;
 if(actual!==null&&actual<0)throw Error('Cost điều chỉnh không được âm.');
 const previous=db.prepare('SELECT * FROM lot_reconciliation_versions WHERE lot_id=? ORDER BY id DESC LIMIT 1').get(lot.id) as Row|undefined;
 const snapshot=JSON.stringify({coverage,components});
 const same=previous&&previous.actual_cents===actual&&previous.estimated_cents===estimated&&previous.cost_snapshot_json===snapshot;
 const status=same?String(previous.status):actual===null?'PENDING':estimated===null||Number(actual)>Number(estimated)?'REVIEW':'PASS';
 if(!same)db.prepare('INSERT INTO lot_reconciliation_versions(lot_id,estimated_cents,actual_cents,status,cost_snapshot_json) VALUES (?,?,?,?,?)').run(lot.id,estimated,actual,status,snapshot);
 db.prepare('UPDATE order_lots SET net_cost=?,cost_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(actual===null?null:Number(actual)/100,status==='PASS'?'MATCHED':status,lot.id);
 return {...lot,id:lot.id,actual_cost_coverage:coverage,effective_cents:effective===null?null:Number(effective)+adjustment,cost_snapshot_json:snapshot,estimated_cents:estimated,actual_cents:actual,reconciliation_status:status,decision:same?previous.decision:null};
 });
 const clean=results.every(l=>l.reconciliation_status==='PASS');
 const hasReview=results.some(l=>l.reconciliation_status==='REVIEW');
 const complete=results.every(l=>l.actual_cents!==null);
 const actual=complete?results.reduce((n,l)=>n+Number(l.actual_cents),0):null;
 const status=clean?'PASS':hasReview?'REVIEW':'PENDING';
 db.prepare('UPDATE orders SET true_net_cost=?,reconciliation_delta=?,reconciliation_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(actual===null?null:actual/100,actual===null||order.est_net_cost==null?null:actual/100-Number(order.est_net_cost),status,orderId);
 const surcharge=Number((db.prepare("SELECT COALESCE(SUM(ROUND(e.amount*100)),0) n FROM ledger_entries e WHERE e.entry_type='ADDITIONAL_FEE' AND e.direction='DEBIT' AND e.reference_type='LOT_RECONCILIATION' AND e.reference_id IN (SELECT CAST(id AS TEXT) FROM order_lots WHERE order_id=?)").get(orderId) as {n:number}).n);
 const weightSurcharge=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weight_adjustments'").get()?Number((db.prepare("SELECT COALESCE(SUM(ROUND(e.amount*100)),0) n FROM ledger_entries e JOIN weight_adjustments a ON e.reference_id=CAST(a.id AS TEXT) WHERE a.order_id=? AND e.reference_type='WEIGHT_ADJUSTMENT' AND e.entry_type='WEIGHT_ADJUSTMENT' AND e.direction='DEBIT'").get(orderId) as {n:number}).n):0;
 const revenue=order.workflow_status==='CANCELLED'?Math.max(0,cents(order.total_due||0)-cents(order.import_tax||0)):cents(order.sales_price||0)+cents(order.surcharge||0)+surcharge+weightSurcharge;
 const estimatedCost=results.every(l=>l.estimated_cents!==null)?results.reduce((n,l)=>n+Number(l.estimated_cents),0):order.est_net_cost==null?null:cents(order.est_net_cost);
 const estimatedGP=estimatedCost===null?null:(revenue-estimatedCost)/100;
 const estimatedMargin=estimatedGP===null||!revenue?null:Math.round(estimatedGP*10000/revenue*100)/100;
 const covered=results.every(l=>l.actual_cost_coverage==='COMPLETE');
 const effectiveCost=results.every(l=>l.effective_cents!==null)?results.reduce((n,l)=>n+Number(l.effective_cents),0):null;
 db.prepare('UPDATE orders SET actual_cost_coverage=?,effective_net_cost=?,cost_coverage_json=? WHERE id=?').run(covered?'COMPLETE':results.some(l=>l.actual_cost_coverage==='PARTIAL')?'PARTIAL':'UNKNOWN',effectiveCost===null?null:effectiveCost/100,JSON.stringify(results.map(l=>({lot_id:l.id,...JSON.parse(l.cost_snapshot_json)}))),orderId);
 const gp=clean&&covered&&actual!==null?(revenue-actual)/100:null;
 const margin=gp===null||!revenue?null:Math.round(gp*10000/revenue*100)/100;
 db.prepare('UPDATE orders SET finalized_gp=?,finalized_margin_pct=?,estimated_gp=?,estimated_margin_pct=?,gross_profit_net=?,gross_margin_pct=?,margin_status=? WHERE id=?').run(gp,margin,estimatedGP,estimatedMargin,gp??estimatedGP??0,margin??estimatedMargin??0,clean&&covered?'FINALIZED':clean?'PROVISIONAL':'PENDING',orderId);
 return results;
}
export function reconciliationAction(user:AuthUser,input:Row){
 if(!["ADMIN","BOD","FINANCE"].includes(user.role))throw Error("Chỉ BOD/Finance được đối soát.");
 return moneyCommand('reconciliation:'+user.id,input.request_key,input,()=>db.transaction(()=>{
 const rows=Array.isArray(input.items)?input.items as Row[]:[input];
 if(!rows.length||rows.length>200)throw Error('Batch từ 1 đến 200 Lot.');
 const seen=new Set<number>();
 const results=rows.map(row=>{
 const orderId=Number(row.order_id),number=Number(row.lot_number);
 if(!Number.isInteger(orderId)||!Number.isInteger(number)||number<1)throw Error('Cần Order ID và số Lot.');
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as Row|undefined;
 if(!order)throw Error('Order không tồn tại.');
 ensureOrderShipmentStructure(orderId);
 const lot=db.prepare('SELECT id FROM order_lots WHERE order_id=? AND lot_number=?').get(orderId,number) as {id:number}|undefined;
 if(!lot||seen.has(lot.id))throw Error('Lot không hợp lệ hoặc trùng trong batch.');seen.add(lot.id);
 const reason=String(row.reason||'').trim();if(!reason)throw Error('Cần lý do để audit.');
 const before=reconcileLots(orderId).find(l=>Number(l.id)===lot.id)!;
 const action=String(row.action);
 if(action==='cost_components'){
 if(!input.request_key||!Array.isArray(row.components)||row.components.length!==4)throw Error('Cần request_key và đủ bốn component.');
 if(db.prepare('SELECT id FROM supplier_costs WHERE order_lot_id=? LIMIT 1').get(lot.id)||db.prepare('SELECT id FROM lot_cost_adjustments WHERE lot_id=? LIMIT 1').get(lot.id)||db.prepare('SELECT replacement_cents FROM lot_reconciliation_settings WHERE lot_id=? AND replacement_cents IS NOT NULL').get(lot.id))throw Error('Lot đã có aggregate cost; cần mapping supplier trước khi chuyển component.');
 const names=new Set<string>();let total=0;
 for(const item of row.components as Row[]){
 const component=String(item.component),reference=String(item.reference||'').trim();
 if(!['LAST_MILE','MID_MILE','WAREHOUSE','OTHER'].includes(component)||names.has(component)||!reference)throw Error('Component/reference không hợp lệ.');names.add(component);
 if(item.estimated===null||item.estimated===undefined||item.estimated===''||item.actual===undefined||item.actual===''||!Number.isFinite(Number(item.estimated))||(item.actual!==null&&!Number.isFinite(Number(item.actual))))throw Error('Cần estimate hợp lệ và actual hợp lệ hoặc null.');
 const estimated=cents(item.estimated),actual=item.actual===null?null:cents(item.actual);total+=estimated;
 db.prepare('INSERT INTO lot_cost_components(lot_id,component,estimated_cents,actual_cents,reference) VALUES (?,?,?,?,?) ON CONFLICT(lot_id,component) DO UPDATE SET estimated_cents=excluded.estimated_cents,actual_cents=excluded.actual_cents,reference=excluded.reference').run(lot.id,component,estimated,actual,reference);
 }
 if(before.estimated_cents===null||total!==before.estimated_cents)throw Error('Tổng estimate component phải bằng estimate Lot.');
 }else if(action==='estimate'||action==='replacement_cost'){
 if(db.prepare('SELECT lot_id FROM lot_cost_components WHERE lot_id=?').get(lot.id))throw Error('Lot dùng component; cập nhật qua cost_components.');
 const amount=cents(row.amount);
 db.prepare('INSERT OR IGNORE INTO lot_reconciliation_settings(lot_id) VALUES (?)').run(lot.id);
 if(action==='estimate')db.prepare('UPDATE lot_reconciliation_settings SET estimated_cents=? WHERE lot_id=?').run(amount,lot.id);
 else {if(db.prepare('SELECT id FROM supplier_costs WHERE order_lot_id=? LIMIT 1').get(lot.id))throw Error('Cost thay thế chỉ dùng khi thiếu giá supplier.');db.prepare('UPDATE lot_reconciliation_settings SET replacement_cents=?,replacement_reason=? WHERE lot_id=?').run(amount,reason,lot.id);}
 }else if(action==='cost_adjustment'){
 const value=Number(row.amount);if(!Number.isFinite(value)||!value||!input.request_key||before.actual_cents===null)throw Error('Điều chỉnh cần amount có dấu, cost hiện tại và request_key.');
 const delta=cents(Math.abs(value))*Math.sign(value);if(!delta||Number(before.actual_cents)+delta<0)throw Error('Cost sau điều chỉnh không được âm.');
 db.prepare('INSERT INTO lot_cost_adjustments(lot_id,delta_cents,reason,actor_id) VALUES (?,?,?,?)').run(lot.id,delta,reason,user.id);
 }else if(action==='absorb_loss'||action==='customer_surcharge'){
 if(before.actual_cents===null)throw Error('Cần cost thực tế hoặc cost thay thế trước khi duyệt.');
 if(action==='customer_surcharge'){
 const amount=cents(row.amount),note=String(row.public_note||'').trim();
 if(!amount||!note||!order.client_user_id||order.workflow_status==='CANCELLED')throw Error('Cần Client, phụ phí >0, public note và Order chưa hủy.');
 if(!input.request_key)throw Error('Phụ phí cần request_key để chống ghi trùng.');
 db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'ADDITIONAL_FEE','DEBIT',?,?,'LOT_RECONCILIATION',?,?,?)").run(order.client_user_id,localDay(),amount/100,order.customer,String(lot.id),note,user.id);
 publishPublicNote({orderId,eventType:'SURCHARGE_NOTICE',summary:note,actorId:user.id,publicData:{lot_number:number,amount:amount/100,currency:'USD'}});
 }
 db.prepare('INSERT INTO lot_reconciliation_versions(lot_id,estimated_cents,actual_cents,status,decision,reason,actor_id,cost_snapshot_json) VALUES (?,?,?,\'PASS\',?,?,?,?)').run(lot.id,before.estimated_cents,before.actual_cents,action,reason,user.id,before.cost_snapshot_json);
 }else throw Error('Action không hỗ trợ.');
 const after=reconcileLots(orderId).find(l=>Number(l.id)===lot.id);
 logAdminEvent({orderId,eventType:'LOT_RECONCILIATION',summary:'Lot '+number+': '+action,actorId:user.id,before,after:{...after,reason}});
 if(order.client_user_id)audit(Number(order.client_user_id),user.id,'LOT_RECONCILIATION',{order_id:orderId,lot_number:number,action,reason,before,after});
 return after;
 });return results;
 }).immediate());
}
