import {createHash} from 'node:crypto';
import {vndSupplierExposure} from './vnd-supplier-exposure';
import {db} from './db';
import {approvedFulfillment,hasPostedSupplierReference,hasSupplierReferenceOutsideActual,lotFulfillments,resolveFulfillment} from './vnd-fulfillment';
import {installSupplierTemplateSchema,mappedSupplierRows} from './vnd-supplier-templates';
import {compareSupplierComponents, supplierTags, type FinalComponent, type QuotedComponent} from './vnd-supplier-components';
import type {AuthUser} from './auth';
import {vnd,compareVnd,addVnd,subtractVnd,sumVnd,multiplyVnd} from './vnd-money';
type Row=Record<string,unknown>;
export type SupplierWorkbook = {name:string; bytes:Buffer; sha256:string};

export function storeSupplierWorkbook(actor:AuthUser,supplier:string,input:Row,file:SupplierWorkbook){
 db.prepare(`INSERT INTO vnd_supplier_import_files(batch_key,supplier,file_name,workbook,sha256,document,template_id,actor_id)
  VALUES (?,?,?,?,?,?,?,?)`).run(input.request_key,supplier,file.name,file.bytes,file.sha256,input.document??null,input.template_id??null,actor.id);
}

export function supplierImportBatches(supplier:string,pendingStates:Map<number,string[]>){
 const files=db.prepare(`SELECT batch_key,file_name,sha256,document,template_id,actor_id,created_at,
  date(datetime(created_at,'+7 hours')) posting_day FROM vnd_supplier_import_files WHERE supplier=? ORDER BY rowid DESC LIMIT 200`).all(supplier) as Row[];
 const rows=db.prepare(`SELECT r.id,r.position,d.decision,
  json_array_length(json_extract(r.data_json,'$.parse_errors')) parse_errors,
  coalesce(json_array_length(json_extract(d.snapshot_json,'$.errors')),0) review_errors,
  r.batch_key source_batch,l.delta,l.id ledger_id,date(datetime(l.created_at,'+7 hours')) posting_day,
  p.id period_id
  FROM vnd_supplier_import_rows r
  LEFT JOIN vnd_supplier_import_decisions d ON d.row_id=r.id
  LEFT JOIN vnd_supplier_ledger l ON l.cost_id=d.cost_id AND l.kind='ACTUAL' AND r.batch_key=@batch
  LEFT JOIN vnd_supplier_periods p ON p.supplier=r.supplier AND date(datetime(l.created_at,'+7 hours')) BETWEEN p.period_start AND p.period_end
  WHERE r.supplier=@supplier AND (r.batch_key=@batch OR EXISTS(SELECT 1 FROM vnd_supplier_import_revisions v WHERE v.row_id=r.id AND v.batch_key=@batch)) ORDER BY r.position`);
 return files.map(file=>{
  const lines=rows.all({batch:file.batch_key,supplier}) as Row[];
  return {...file,lines,accepted:lines.filter(row=>row.decision==='accept').length,
   skipped:lines.filter(row=>row.decision==='skip').length,pending:lines.filter(row=>row.decision===null).length,
   errors:lines.filter(row=>Number(row.parse_errors)>0||Number(row.review_errors)>0||Boolean(pendingStates.get(Number(row.id))?.length)).length,
   payable_delta:sumVnd(lines.map(row=>String(row.delta??'0')))};
 });
}
export function installSupplierImportSchema(database:typeof db){
 database.exec(`CREATE TABLE IF NOT EXISTS vnd_supplier_import_rows(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,batch_key TEXT NOT NULL,position INTEGER NOT NULL,data_json TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(batch_key,position));
 CREATE TABLE IF NOT EXISTS vnd_supplier_import_files(
  batch_key TEXT PRIMARY KEY,supplier TEXT NOT NULL,file_name TEXT NOT NULL,workbook BLOB NOT NULL,
  sha256 TEXT NOT NULL,document TEXT,template_id INTEGER,actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS vnd_supplier_import_files_supplier ON vnd_supplier_import_files(supplier);
 CREATE TABLE IF NOT EXISTS vnd_supplier_import_revisions(
  id INTEGER PRIMARY KEY,row_id INTEGER NOT NULL REFERENCES vnd_supplier_import_rows(id),values_json TEXT NOT NULL,
  batch_key TEXT NOT NULL REFERENCES vnd_supplier_import_files(batch_key), actor_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS vnd_supplier_import_revisions_row ON vnd_supplier_import_revisions(row_id,id);
 CREATE TABLE IF NOT EXISTS vnd_supplier_import_decisions(id INTEGER PRIMARY KEY,row_id INTEGER NOT NULL UNIQUE REFERENCES vnd_supplier_import_rows(id),decision TEXT NOT NULL,lot_id INTEGER REFERENCES order_lots(id),cost_id INTEGER REFERENCES vnd_supplier_costs(id),snapshot_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 installSupplierTemplateSchema(database);
 for(const table of ['vnd_supplier_import_rows','vnd_supplier_import_decisions','vnd_supplier_import_files','vnd_supplier_import_revisions'])for(const op of ['UPDATE','DELETE'])database.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable supplier import'); END;`);
}
function text(value:unknown,optional=false){const s=typeof value==='string'?value.trim():'';if((!optional&&!s)||s.length>2000)throw Error('Thiếu hoặc quá dài dữ liệu chứng từ.');return s;}
function amount(value:unknown){if(typeof value!=='string')throw Error('Số tiền/cân cần chuỗi thập phân.');const n=vnd(value);if(compareVnd(n,'0')<0)throw Error('Số tiền/cân không được âm.');return n;}
function estimate(lot:Row){
 const row=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(lot.order_id) as Row|undefined;if(!row)return null;
 const q=JSON.parse(String(row.snapshot_json));
 if(Array.isArray(q.lots)){const l=q.lots.find((x:Row)=>x.lot_id===lot.id);const value=l?.selected?.net_vnd??l?.net_vnd;if(typeof value==='string')return value;}
 const count=(db.prepare('SELECT count(*) n FROM order_lots WHERE order_id=?').get(lot.order_id) as {n:number}).n;
 return count===1&&typeof q.net_vnd==='string'?q.net_vnd:null;
}
function normalizeTracking(value:unknown){return String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');}
function matchesRoute(lot:Row|undefined,source:Row|undefined){
 return !source||(lot?.service===source.service&&lot?.sub_service===source.sub_service);
}
function supplierImportVoid(orderId:number,lotId:number,epoch:number,supplier:string){
 const cases=db.prepare('SELECT id,snapshot_json FROM supplier_void_cases WHERE order_id=? AND supplier=? ORDER BY id DESC').all(orderId,supplier) as {id:number;snapshot_json:string}[];
 const matched=cases.flatMap(row=>{
  const snapshot=JSON.parse(row.snapshot_json);
  const lot=(snapshot.lots as Row[]).find(lot=>lot.id===lotId&&lot.fulfillment_epoch===epoch);
  return lot?[{id:row.id,lot,policy:snapshot.policy as Row|null}]:[];
 });
 const caseInfo=matched.length===1?matched[0]:undefined;
 const policy=caseInfo?.policy;
 let cap:string|null=null;
 if(policy?.refund_percent===100)cap='0';
 if(policy?.refund_percent===90&&typeof caseInfo?.lot.basis==='string')cap=multiplyVnd(caseInfo.lot.basis,'0.1');
 if(policy?.refund_percent==null&&typeof policy?.fee_vnd==='string')cap=policy.fee_vnd;
 const cancellation=Boolean(db.prepare('SELECT 1 FROM supplier_cancellations WHERE order_id=? AND supplier=?').get(orderId,supplier));
 return {requested:cases.length>0||cancellation,case_id:caseInfo?.id??null,cap,needs_review:matched.length>1||matched.length===1&&cap===null};
}

type Revision={id:number;batch_key:string;values_json:string};
export function supplierImportState(row:Row,proposal?:Record<string,string|null>){
 const revision=db.prepare('SELECT id,batch_key,values_json FROM vnd_supplier_import_revisions WHERE row_id=? ORDER BY id DESC LIMIT 1').get(row.id) as Revision|undefined;
 const data=JSON.parse(String(row.data_json)) as Row;
 const source=data.source as Row|undefined;
 const parseErrors=(data.parse_errors??[]) as string[];
 const supplier=String(row.supplier);
 const resolution=parseErrors.length?undefined:resolveFulfillment(data,supplier,source);
 const attempt=resolution?.attempt;
 const actual=attempt?approvedFulfillment(attempt.lot_id,supplier,attempt.id):undefined;
 const lot=attempt?lotFulfillments(attempt.lot_id)?.lot:undefined,old=actual?.approved;
 const errors=[...parseErrors];
 const edits=proposal??(revision?JSON.parse(revision.values_json) as Record<string,string|null>:undefined);
 const supplierComponents=data.components as QuotedComponent[]|undefined;
 const components=supplierComponents?.map(component=>edits&&Object.hasOwn(edits,component.id)?{...component,amount:edits[component.id]}:component);
 if(components)data.components=components;
 const priorDecision=old?db.prepare('SELECT snapshot_json FROM vnd_supplier_import_decisions WHERE cost_id=?').get(old.id) as {snapshot_json:string}|undefined:undefined;
 const previous=priorDecision?(JSON.parse(priorDecision.snapshot_json).comparison?.current as FinalComponent[]|undefined):undefined;
 const comparison=components?compareSupplierComponents(previous??[],components):null;
 const componentBlocked=!!(old&&(components ? !previous||components.some(component=>previous.some(existing=>existing.id===component.id&&existing.group!==component.group)) : previous));
 if(componentBlocked)errors.push('COMPONENT_BASE_REVIEW_REQUIRED');
 if(previous&&comparison){
  if(comparison.lines.some(line=>line.old===null))errors.push('ADDITIONAL_FEE');
  if(comparison.lines.some(line=>line.old!==null&&line.delta!=='0'))errors.push('FEE_ADJUSTMENT');
 }
 if(resolution?.requiresReview||actual?.uncertain)errors.push('FULFILLMENT_REVIEW_REQUIRED');
 else if(resolution&&!resolution.ids.length)errors.push('ORDER_NOT_MATCHED');
 if(resolution&&resolution.ids.length>1)errors.push('AMBIGUOUS_MATCH');
 let voidPolicy:ReturnType<typeof supplierImportVoid>|null=null;
 let net:string|null=null,weight:string|null=null,revenue:string|null=null,orderObligation:string|null=null;
 if(lot){
  net=estimate(lot);
  const cartons=db.prepare('SELECT weight,chargeable_weight FROM order_cartons WHERE order_lot_id=?').all(lot.id) as Row[];
  const weightField=components?'weight':'chargeable_weight';
  if(cartons.length&&cartons.every(c=>Number(c[weightField])>0))weight=sumVnd(cartons.map(c=>String(c[weightField])));
  if(comparison){
   const exposure=vndSupplierExposure(lot.order_id,subtractVnd(comparison.total,String(old?.amount??'0')));
   revenue=exposure.revenue;
   orderObligation=exposure.obligation;
  }
  const quoteRow=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(lot.order_id) as Row|undefined;
  const quoteLot=quoteRow?JSON.parse(String(quoteRow.snapshot_json)).lots?.find((l:Row)=>l.lot_id===lot.id):null;
  const quotedWeight=quoteLot?.selected?.weight_kg??quoteLot?.weight_kg;
  if(!components&&Number(quotedWeight)>0)weight=String(quotedWeight);
  voidPolicy=supplierImportVoid(lot.order_id,lot.id,attempt!.id,supplier);
  const proposedTotal=comparison?.total??(data.kind==='SUPPLEMENT'&&old?addVnd(String(old.amount),String(data.amount)):String(data.amount));
  if(voidPolicy.needs_review)errors.push('VOID_POLICY_REVIEW_REQUIRED');
  if(voidPolicy.cap!==null&&compareVnd(proposedTotal,voidPolicy.cap)>0)errors.push('CANCEL_FEE_ABOVE_POLICY');
  if(!net)errors.push('MISSING_ESTIMATE');
  const proposed=comparison?.groups[0].current??(data.kind==='SUPPLEMENT'&&old?addVnd(String(old.amount),String(data.amount)):String(data.amount));
  if(net&&compareVnd(proposed,net)>0)errors.push('NET_ABOVE_ESTIMATE');
  if(data.supplier_weight&&(!weight||compareVnd(String(data.supplier_weight),weight)>0))errors.push(weight?'WEIGHT_ABOVE_DMD':'MISSING_DMD_WEIGHT');
  if(data.kind==='SUPPLEMENT'&&!old)errors.push('MISSING_APPROVED_BASE');
  if(old&&data.kind==='TOTAL')errors.push('DUPLICATE_HISTORY');
  if(!components&&db.prepare('SELECT id FROM vnd_supplier_costs WHERE lot_id=? AND supplier=? AND fulfillment_epoch IS ?').get(lot.id,row.supplier,attempt!.id)&&!old&&data.kind==='TOTAL')errors.push('DUPLICATE_HISTORY');
 }
 const peers=source?db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE batch_key=? AND supplier=? AND id<>?').all(row.batch_key,row.supplier,row.id) as Row[]:db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE supplier=? AND id<>?').all(row.supplier,row.id) as Row[];
 const identity=(d:Row)=>JSON.stringify([d.tracking||null,d.label_url||null,d.lot_id??null,d.order_code||null]);
 const duplicates=peers.filter(p=>{const d=JSON.parse(String(p.data_json));return (source ? !!data.tracking && normalizeTracking(d.tracking)===normalizeTracking(data.tracking) : identity(d)===identity(data))&&(data.kind==='TOTAL'||(d.kind===data.kind&&d.amount===data.amount&&d.reason===data.reason));});
 if(duplicates.some(p=>p.batch_key===row.batch_key))errors.push('DUPLICATE_IN_FILE');
 if(duplicates.some(p=>p.batch_key!==row.batch_key)&&!errors.includes('DUPLICATE_HISTORY'))errors.push('DUPLICATE_HISTORY');
 if(components&&!errors.includes('DUPLICATE_HISTORY')){
  const acceptedTracking=normalizeTracking(data.tracking);
  const matchingHistory=acceptedTracking&&db.prepare(`SELECT 1 FROM vnd_supplier_import_decisions d
   JOIN vnd_supplier_import_rows r ON r.id=d.row_id WHERE d.decision='accept' AND r.supplier=? AND r.id<>?
   AND upper(replace(replace(replace(replace(replace(json_extract(r.data_json,'$.tracking'),'-',''),' ',''),char(9),''),char(10),''),char(13),''))=? LIMIT 1`)
   .get(supplier,row.id,acceptedTracking);
  if(matchingHistory||lot&&hasPostedSupplierReference(supplier,lot.id,data.reference))errors.push('DUPLICATE_HISTORY');
 }
 if(hasSupplierReferenceOutsideActual(String(row.supplier),data.reference))errors.push('SUPPLIER_REFERENCE_IN_USE');
 const state={revision_id:revision?.id??null, revision_batch:revision?.batch_key??null,lot_id:lot?.id??null,order_code:lot?.order_code??null,fulfillment_epoch:attempt?.id??null,
  fulfillment_candidates:resolution?.ids??[],estimated:net,dmd_weight:weight,approved_cost_id:Number(old?.id??0),approved_amount:old?.amount??null,comparison,void_policy:voidPolicy,revenue,order_obligation:orderObligation,revenue_below_obligation:revenue!==null&&orderObligation!==null&&compareVnd(revenue,orderObligation)<0,component_blocked:componentBlocked,tags:supplierTags(errors),errors};
 return {...row,id:Number(row.id),batch_key:String(row.batch_key),data,supplier_components:supplierComponents,...state,token:createHash('sha256').update(JSON.stringify(state)).digest('hex')};
}
export function supplierImportView(supplier:string){
 const rows=db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE supplier=? AND (NOT EXISTS(SELECT 1 FROM vnd_supplier_import_decisions d WHERE d.row_id=vnd_supplier_import_rows.id) OR id IN (SELECT row_id FROM vnd_supplier_import_decisions ORDER BY id DESC LIMIT 200)) ORDER BY id DESC').all(supplier) as Row[];
 const findDecision=db.prepare('SELECT * FROM vnd_supplier_import_decisions WHERE row_id=?');
 return rows.map(row=>{
  const decision=findDecision.get(row.id) as {snapshot_json:string}|undefined;
  return {...(decision?JSON.parse(decision.snapshot_json) as ReturnType<typeof supplierImportState>:supplierImportState(row)),decision:decision??null};
 });
}
export function previewSupplierAdjustments(supplier:string,input:unknown){
 if(!Array.isArray(input)||!input.length||input.length>200)throw Error('Chọn 1–200 dòng điều chỉnh.');
 const lookup=db.prepare(`SELECT * FROM vnd_supplier_import_rows r WHERE supplier=? AND id=?
  AND NOT EXISTS (SELECT 1 FROM vnd_supplier_import_decisions d WHERE d.row_id=r.id)`);
 const seen=new Set<number>();
 return input.map((item:Row)=>{
  const id=Number(item.id);
  if(!Number.isSafeInteger(id)||id<1||seen.has(id))throw Error('Mã dòng điều chỉnh không hợp lệ hoặc trùng.');
  seen.add(id);
  const row=lookup.get(supplier,id) as Row|undefined;
  if(!row||item.batch!==row.batch_key)throw Error('Dòng đã xử lý hoặc sai batch gốc.');
  const old=supplierImportState(row);
  const components=old.data.components as QuotedComponent[]|undefined;
  if(!components?.length||old.data.parse_errors instanceof Array&&old.data.parse_errors.length||item.token!==old.token)
   throw Error('Dòng Excel lỗi hoặc đã thay đổi. Tải bản xuất mới để đối soát.');
  if(item.tracking!==String(old.data.tracking??''))throw Error('Tracking không khớp dòng gốc.');
  if(!item.values||typeof item.values!=='object'||Array.isArray(item.values))throw Error('Thiếu số tiền thành phần.');
  const raw=item.values as Row;
  const groups=item.groups as Row|undefined;
  if(!groups||Object.keys(raw).length!==components.length||components.some(component=>!Object.hasOwn(raw,component.id)||groups[component.id]!==component.group))throw Error('Component ID không khớp template gốc.');
  const values=Object.fromEntries(components.map(({id})=>[id,raw[id]===null?null:amount(raw[id])]));
  const proposed=supplierImportState(row,values);
  return {id,values,old:old.comparison,proposed:proposed.comparison,tags:proposed.tags,errors:proposed.errors};
 });
}

export function applySupplierImport(actor:AuthUser,supplier:string,input:Row,reason:string){
 if(input.action==='stage_import_adjustments'){
  const changes=previewSupplierAdjustments(supplier,input.adjustments);
  const append=db.prepare('INSERT INTO vnd_supplier_import_revisions(row_id,values_json,batch_key,actor_id,reason) VALUES (?,?,?,?,?)');
  for(const {id,values} of changes)append.run(id,JSON.stringify(values),input.request_key,actor.id,reason);
  return;
 }
 if(input.action==='import_workbook'){
  const seen=new Set<string>();
  const insertRow=db.prepare('INSERT INTO vnd_supplier_import_rows(supplier,batch_key,position,data_json,actor_id) VALUES (?,?,?,?,?)');
  const insertLine=db.prepare('INSERT INTO vnd_supplier_document_lines(row_id,supplier,document,line,template_id,fingerprint) VALUES (?,?,?,?,?,?)');
  const previous=db.prepare(`SELECT l.*,d.decision FROM vnd_supplier_document_lines l
    LEFT JOIN vnd_supplier_import_decisions d ON d.row_id=l.row_id
    WHERE l.supplier=? AND l.document=? AND l.line=? ORDER BY l.row_id DESC LIMIT 1`);
  for(const row of mappedSupplierRows(supplier,input)){
   const {source}=row;
   const line=JSON.stringify(source.line===null?['invalid',source.excel_row]:['source',source.line]);
   if(seen.has(line))throw Error('Mã dòng trùng trong chứng từ: '+source.line);
   seen.add(line);
   const fingerprint=createHash('sha256').update(JSON.stringify([source.headers,source.cells])).digest('hex');
   const prior=previous.get(supplier,source.document,line) as Row|undefined;
   if(prior?.decision==='accept'||(prior&&!prior.decision)){
    if(prior.fingerprint===fingerprint)continue;
    throw Error('Dòng '+source.line+' đã tồn tại. Bỏ qua bản chờ để map lại, hoặc dùng chứng từ điều chỉnh riêng nếu đã Accept.');
   }
   if(prior?.decision==='skip'&&prior.fingerprint===fingerprint&&prior.template_id===source.template_id)continue;
   const {lastInsertRowid}=insertRow.run(supplier,input.request_key,source.excel_row,JSON.stringify({...row,reason}),actor.id);
   insertLine.run(lastInsertRowid,supplier,source.document,line,source.template_id,fingerprint);
  }
  return;
 }
 if(input.action==='import'){
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>200)throw Error('Import 1–200 dòng.');
  input.items.forEach((raw:Row,i:number)=>{
   const kind=String(raw.kind??'TOTAL');if(!['TOTAL','SUPPLEMENT'].includes(kind))throw Error('Loại TOTAL hoặc SUPPLEMENT.');
   const label_url=text(raw.label_url,true);
   const tracking=text(raw.tracking,true),order_code=text(raw.order_code,true),lot_id=raw.lot_id===undefined?null:Number(raw.lot_id);
   if([!!tracking,!!order_code,lot_id!==null].filter(Boolean).length!==1|| (lot_id!==null&&(!Number.isSafeInteger(lot_id)||lot_id<1)))throw Error('Mỗi dòng cần một Tracking, Order ID hoặc Lot ID.');
   if(label_url&&!tracking)throw Error('Label cần Tracking trên chứng từ.');
   const data={kind,tracking,label_url,order_code,lot_id,amount:amount(raw.amount),supplier_weight:raw.supplier_weight?amount(raw.supplier_weight):null,reference:text(raw.reference),reason:text(raw.reason??reason)};
   db.prepare('INSERT INTO vnd_supplier_import_rows(supplier,batch_key,position,data_json,actor_id) VALUES (?,?,?,?,?)').run(supplier,input.request_key, Array.isArray(input.excel_rows)?input.excel_rows[i]:i+1,JSON.stringify(data),actor.id);
  });return;
 }
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>200)throw Error('Review 1–200 dòng.');
 if(!['accept','skip'].includes(String(input.decision)))throw Error('Chọn accept hoặc skip.');
 if(input.decision==='accept'&&!['FINANCE','BOD'].includes(actor.role))throw Error('Accept Actual cần Finance/BOD.');
 const seen=new Set<number>(),attempts=new Set<string>();
 const reviewed=(input.items as Row[]).map(item=>{
  const row=db.prepare('SELECT * FROM vnd_supplier_import_rows WHERE id=? AND supplier=?').get(Number(item.id),supplier) as Row|undefined;
  if(!row||db.prepare('SELECT id FROM vnd_supplier_import_decisions WHERE row_id=?').get(row.id))throw Error('Dòng không tồn tại hoặc đã xử lý.');
  const state=supplierImportState(row);
  if(item.token!==state.token)throw Error('Dữ liệu đối soát đã thay đổi; tải lại queue.');
  return {item,state};
 });
 for(const {item,state} of reviewed){
  const id=Number(item.id);if(seen.has(id))throw Error('Trùng dòng review.');seen.add(id);
  let costId:number|null=null,lotId:number|null=null;
  if(input.decision==='accept'){
   lotId=item.lot_id===undefined?Number(state.lot_id):Number(item.lot_id);
   if(Array.isArray(state.data.parse_errors)&&state.data.parse_errors.length)throw Error('Dòng lỗi Excel cần sửa hoặc map lại trước khi Accept.');
   if(state.component_blocked || (state.comparison && !state.lot_id)) throw Error('Cần xác minh dữ liệu thành phần hoặc lượt fulfillment trước khi Accept.');
   if(state.errors.includes('FULFILLMENT_REVIEW_REQUIRED')||state.errors.includes('AMBIGUOUS_MATCH'))
    throw Error('Cần đối soát đúng lượt fulfillment trước khi ghi Actual/payable.');
   const history=lotFulfillments(lotId);
   const manual=item.lot_id!==undefined && state.lot_id!==lotId;
   if(manual && (history?.incomplete || history && history.attempts.length>1 || state.fulfillment_epoch!==null ||
     (state.fulfillment_candidates.length>0 && !state.fulfillment_candidates.includes(lotId))))
    throw Error('Cần đối soát đúng lượt fulfillment trước khi ghi Actual/payable.');
   const attempt=history?.attempts.find(a=>a.id===(state.fulfillment_epoch??0)&&a.supplier===supplier);
   if(!attempt||!matchesRoute(attempt,state.data.source as Row|undefined))
    throw Error('Cần chọn Lot VNĐ đã charge đúng Supplier và tuyến của template.');
   const scope=JSON.stringify([lotId,attempt.id]);
   if(attempts.has(scope))throw Error('Một batch chỉ accept một dòng mỗi lượt fulfillment.');
   attempts.add(scope);
   const actual=approvedFulfillment(lotId,supplier,attempt.id),old=actual.approved;
   if(old&&!state.comparison&&db.prepare("SELECT 1 FROM vnd_supplier_import_decisions WHERE cost_id=? AND json_type(snapshot_json,'$.comparison.current')='array'").get(old.id))throw Error('Actual thành phần cần chứng từ thành phần.');
   if(actual.uncertain)throw Error('Cần đối soát đúng lượt fulfillment của Actual cũ.');
   if(item.expected_approved_cost_id!==Number(old?.id??0))throw Error('Actual đã thay đổi; tải lại.');
   if(state.errors.includes('SUPPLIER_REFERENCE_IN_USE'))
    throw Error('Tham chiếu đã dùng trong sổ hoặc Claim Supplier; đối chiếu chứng từ trước khi duyệt Actual.');
   if(hasPostedSupplierReference(supplier,lotId,state.data.reference))
    throw Error('Tham chiếu chứng từ đã ghi Actual cho Lot này.');
   if(state.data.kind==='SUPPLEMENT'&&!old)throw Error('Phụ phí cần Actual gốc đã chốt.');
   const total=state.comparison?.total??(state.data.kind==='SUPPLEMENT'?addVnd(String(old!.amount),String(state.data.amount)):String(state.data.amount));
   if(state.comparison&&old&&compareVnd(total,String(old.amount))===0&&state.comparison.lines.every(line=>line.old!==null&&line.delta==='0')) {
    db.prepare('INSERT INTO vnd_supplier_import_decisions(row_id,decision,lot_id,cost_id,snapshot_json,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(id,input.decision,lotId,null,JSON.stringify(state),reason,actor.id);
    continue;
   }
   costId=Number(db.prepare('INSERT INTO vnd_supplier_costs(lot_id,supplier,amount,reference,reason,actor_id,fulfillment_epoch) VALUES (?,?,?,?,?,?,?)').run(lotId,supplier,total,state.data.reference,reason,actor.id,attempt.id).lastInsertRowid);
   db.prepare("INSERT INTO vnd_supplier_reviews(cost_id,action,reason,actor_id) VALUES (?,'approve',?,?)").run(costId,reason,actor.id);
   db.prepare("INSERT INTO vnd_supplier_ledger(supplier,kind,delta,cost_id,reference,reason,actor_id) VALUES (?,'ACTUAL',?,?,?,?,?)").run(supplier,subtractVnd(total,String(old?.amount??'0')),costId,state.data.reference,reason,actor.id);
  }
  db.prepare('INSERT INTO vnd_supplier_import_decisions(row_id,decision,lot_id,cost_id,snapshot_json,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(id,input.decision,lotId,costId,JSON.stringify(state),reason,actor.id);
 }
}
