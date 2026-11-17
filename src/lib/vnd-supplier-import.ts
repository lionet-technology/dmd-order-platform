import {createHash} from 'node:crypto';
import {db} from './db';
import type {AuthUser} from './auth';
import {vnd,compareVnd,addVnd,subtractVnd,sumVnd} from './vnd-money';
type Row=Record<string,unknown>;
export function installSupplierImportSchema(database:typeof db){
 database.exec(`CREATE TABLE IF NOT EXISTS vnd_supplier_import_rows(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,batch_key TEXT NOT NULL,position INTEGER NOT NULL,data_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(batch_key,position));
 CREATE TABLE IF NOT EXISTS vnd_supplier_import_decisions(id INTEGER PRIMARY KEY,row_id INTEGER NOT NULL UNIQUE REFERENCES vnd_supplier_import_rows(id),decision TEXT NOT NULL,lot_id INTEGER REFERENCES order_lots(id),cost_id INTEGER REFERENCES vnd_supplier_costs(id),snapshot_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 for(const table of ['vnd_supplier_import_rows','vnd_supplier_import_decisions'])for(const op of ['UPDATE','DELETE'])database.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable supplier import'); END;`);
}
function text(value:unknown,optional=false){const s=typeof value==='string'?value.trim():'';if((!optional&&!s)||s.length>2000)throw Error('Thiếu hoặc quá dài dữ liệu chứng từ.');return s;}
function amount(value:unknown){if(typeof value!=='string')throw Error('Số tiền/cân cần chuỗi thập phân.');const n=vnd(value);if(compareVnd(n,'0')<0)throw Error('Số tiền/cân không được âm.');return n;}
function approved(lot:number){return db.prepare("SELECT c.* FROM vnd_supplier_costs c JOIN vnd_supplier_ledger e ON e.cost_id=c.id AND e.kind='ACTUAL' WHERE c.lot_id=? ORDER BY e.id DESC LIMIT 1").get(lot) as Row|undefined;}
function estimate(lot:Row){
 const row=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(lot.order_id) as Row|undefined;if(!row)return null;
 const q=JSON.parse(String(row.snapshot_json));
 if(Array.isArray(q.lots)){const l=q.lots.find((x:Row)=>x.lot_id===lot.id);const value=l?.selected?.net_vnd??l?.net_vnd;if(typeof value==='string')return value;}
 const count=(db.prepare('SELECT count(*) n FROM order_lots WHERE order_id=?').get(lot.order_id) as {n:number}).n;
 return count===1&&typeof q.net_vnd==='string'?q.net_vnd:null;
}
function eligible(lotId:number,supplier:string){
 return db.prepare("SELECT l.*,o.order_id order_code FROM order_lots l JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests p ON p.order_id=o.id WHERE l.id=? AND o.supplier=? AND p.status IN ('CHARGED','CANCELLED')").get(lotId,supplier) as Row|undefined;
}
function matching(data:Row,supplier:string){
 if(data.lot_id)return eligible(Number(data.lot_id),supplier)?[Number(data.lot_id)]:[];
 const rows=data.tracking
 ?db.prepare("SELECT DISTINCT l.id FROM order_trackings t JOIN order_lots l ON l.order_id=t.order_id AND l.lot_number=t.lot_number JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests p ON p.order_id=o.id WHERE t.tracking=? AND o.supplier=? AND p.status IN ('CHARGED','CANCELLED')").all(data.tracking,supplier)
 :db.prepare("SELECT l.id FROM order_lots l JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests p ON p.order_id=o.id WHERE o.order_id=? AND o.supplier=? AND p.status IN ('CHARGED','CANCELLED')").all(data.order_code,supplier);
 return (rows as {id:number}[]).map(r=>r.id);
}
export function supplierImportState(row:Row){
 const data=JSON.parse(String(row.data_json)) as Row,ids=matching(data,String(row.supplier));
 const lot=ids.length===1?eligible(ids[0],String(row.supplier)):undefined,old=lot?approved(Number(lot.id)):undefined;
 const errors:string[]=[];if(!ids.length)errors.push('ORDER_NOT_MATCHED');if(ids.length>1)errors.push('AMBIGUOUS_MATCH');
 let net:string|null=null,weight:string|null=null;
 if(lot){
  net=estimate(lot);
  const cartons=db.prepare('SELECT chargeable_weight FROM order_cartons WHERE order_lot_id=?').all(lot.id) as Row[];
  if(cartons.length&&cartons.every(c=>Number(c.chargeable_weight)>0))weight=sumVnd(cartons.map(c=>String(c.chargeable_weight)));
  const quoteRow=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(lot.order_id) as Row|undefined;
  const quoteLot=quoteRow?JSON.parse(String(quoteRow.snapshot_json)).lots?.find((l:Row)=>l.lot_id===lot.id):null;
  const quotedWeight=quoteLot?.selected?.weight_kg??quoteLot?.weight_kg;
  if(Number(quotedWeight)>0)weight=String(quotedWeight);
  if(!net)errors.push('MISSING_ESTIMATE');
  const proposed=data.kind==='SUPPLEMENT'&&old?addVnd(String(old.amount),String(data.amount)):String(data.amount);
  if(net&&compareVnd(proposed,net)>0)errors.push('NET_ABOVE_ESTIMATE');
  if(data.supplier_weight&&(!weight||compareVnd(String(data.supplier_weight),weight)>0))errors.push(weight?'WEIGHT_ABOVE_DMD':'MISSING_DMD_WEIGHT');
  if(data.kind==='SUPPLEMENT'&&!old)errors.push('MISSING_APPROVED_BASE');
  if(old&&data.kind==='TOTAL')errors.push('DUPLICATE_HISTORY');
  if(db.prepare('SELECT id FROM vnd_supplier_costs WHERE lot_id=?').get(lot.id)&&!old&&data.kind==='TOTAL')errors.push('DUPLICATE_HISTORY');
 }
 const peers=db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE supplier=? AND id<>?').all(row.supplier,row.id) as Row[];
 const identity=(d:Row)=>d.tracking?'tracking:'+d.tracking:d.lot_id?'lot:'+d.lot_id:'order:'+d.order_code;
 const duplicates=peers.filter(p=>{const d=JSON.parse(String(p.data_json));return identity(d)===identity(data)&&(data.kind==='TOTAL'||(d.kind===data.kind&&d.amount===data.amount&&d.reason===data.reason));});
 if(duplicates.some(p=>p.batch_key===row.batch_key))errors.push('DUPLICATE_IN_FILE');
 if(duplicates.some(p=>p.batch_key!==row.batch_key)&&!errors.includes('DUPLICATE_HISTORY'))errors.push('DUPLICATE_HISTORY');
 const state={lot_id:lot?.id??null,order_code:lot?.order_code??null,estimated:net,dmd_weight:weight,approved_cost_id:Number(old?.id??0),approved_amount:old?.amount??null,errors};
 return {...row,data,...state,token:createHash('sha256').update(JSON.stringify(state)).digest('hex')};
}
export function supplierImportView(supplier:string){
 const rows=db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE supplier=? AND (NOT EXISTS(SELECT 1 FROM vnd_supplier_import_decisions d WHERE d.row_id=vnd_supplier_import_rows.id) OR id IN (SELECT row_id FROM vnd_supplier_import_decisions ORDER BY id DESC LIMIT 200)) ORDER BY id DESC').all(supplier) as Row[];
 return rows.map(row=>({...supplierImportState(row),decision:db.prepare('SELECT * FROM vnd_supplier_import_decisions WHERE row_id=?').get(row.id)??null}));
}
export function applySupplierImport(actor:AuthUser,supplier:string,input:Row,reason:string){
 if(input.action==='import'){
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>200)throw Error('Import 1–200 dòng.');
  input.items.forEach((raw:Row,i:number)=>{
   const kind=String(raw.kind??'TOTAL');if(!['TOTAL','SUPPLEMENT'].includes(kind))throw Error('Loại TOTAL hoặc SUPPLEMENT.');
   const tracking=text(raw.tracking,true),order_code=text(raw.order_code,true),lot_id=raw.lot_id===undefined?null:Number(raw.lot_id);
   if([!!tracking,!!order_code,lot_id!==null].filter(Boolean).length!==1|| (lot_id!==null&&(!Number.isSafeInteger(lot_id)||lot_id<1)))throw Error('Mỗi dòng cần một Tracking, Order ID hoặc Lot ID.');
   const data={kind,tracking,order_code,lot_id,amount:amount(raw.amount),supplier_weight:raw.supplier_weight?amount(raw.supplier_weight):null,reference:text(raw.reference),reason:text(raw.reason??reason)};
   db.prepare('INSERT INTO vnd_supplier_import_rows(supplier,batch_key,position,data_json,actor_id) VALUES (?,?,?,?,?)').run(supplier,input.request_key,i+1,JSON.stringify(data),actor.id);
  });return;
 }
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>200)throw Error('Review 1–200 dòng.');
 if(!['accept','skip'].includes(String(input.decision)))throw Error('Chọn accept hoặc skip.');
 if(input.decision==='accept'&&!['FINANCE','BOD'].includes(actor.role))throw Error('Accept Actual cần Finance/BOD.');
 const seen=new Set<number>(),lots=new Set<number>();
 for(const item of input.items as Row[]){
  const id=Number(item.id);if(seen.has(id))throw Error('Trùng dòng review.');seen.add(id);
  const row=db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE id=? AND supplier=?').get(id,supplier) as Row|undefined;
  if(!row||db.prepare('SELECT id FROM vnd_supplier_import_decisions WHERE row_id=?').get(id))throw Error('Dòng không tồn tại hoặc đã xử lý.');
  const state=supplierImportState(row);
  if(item.token!==state.token)throw Error('Dữ liệu đối soát đã thay đổi; tải lại queue.');
  let costId:number|null=null,lotId:number|null=null;
  if(input.decision==='accept'){
   lotId=item.lot_id===undefined?Number(state.lot_id):Number(item.lot_id);
   const lot=eligible(lotId,supplier);if(!lot)throw Error('Cần chọn Lot VNĐ đã charge đúng Supplier.');
   if(lots.has(lotId))throw Error('Một batch chỉ accept một dòng mỗi Lot; review lần lượt để tránh đếm trùng.');lots.add(lotId);
   const old=approved(lotId);if(item.expected_approved_cost_id!==Number(old?.id??0))throw Error('Actual đã thay đổi; tải lại.');
   if(state.data.kind==='SUPPLEMENT'&&!old)throw Error('Phụ phí cần Actual gốc đã chốt.');
   const total=state.data.kind==='SUPPLEMENT'?addVnd(String(old!.amount),String(state.data.amount)):String(state.data.amount);
   costId=Number(db.prepare('INSERT INTO vnd_supplier_costs(lot_id,supplier,amount,reference,reason,actor_id) VALUES (?,?,?,?,?,?)').run(lotId,supplier,total,state.data.reference,reason,actor.id).lastInsertRowid);
   db.prepare("INSERT INTO vnd_supplier_reviews(cost_id,action,reason,actor_id) VALUES (?,'approve',?,?)").run(costId,reason,actor.id);
   db.prepare("INSERT INTO vnd_supplier_ledger(supplier,kind,delta,cost_id,reference,reason,actor_id) VALUES (?,'ACTUAL',?,?,?,?,?)").run(supplier,subtractVnd(total,String(old?.amount??'0')),costId,state.data.reference,reason,actor.id);
  }
  db.prepare('INSERT INTO vnd_supplier_import_decisions(row_id,decision,lot_id,cost_id,snapshot_json,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(id,input.decision,lotId,costId,JSON.stringify(state),reason,actor.id);
 }
}
