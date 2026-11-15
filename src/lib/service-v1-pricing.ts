import {currentServiceV1Fx} from './service-v1-fx';
import {createHash} from "node:crypto";
import {db} from "./db";
import {assertServiceV1Owner,readServiceV1Config,serviceV1Key} from "./service-v1-config";
import {routeState} from "./route-lifecycle";
type Row={id:number;route_id:number;kind:"NET"|"PROPOSAL";config_id:number;source_net_id:number|null;body_json:string;actor_id:number;request_key:string;request_hash:string};
type NetRow={key:string;net_vnd:number;net_usd?:number};
const fingerprint=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function routeReady(routeId:number,actorId:number) {
 const config=readServiceV1Config(routeId,actorId);
 const route=db.prepare("SELECT active,warehouse_hold FROM service_route_configs WHERE id=?").get(routeId) as {active:number;warehouse_hold:number}|undefined;
 if(!config||!route?.active||route.warehouse_hold||routeState(routeId)!=="ACTIVE")throw Error("Cần route active, không Hold và cấu hình V1.");
 return config;
}
export function publishedServiceV1Price(routeId:number,kind:"NET"|"PROPOSAL",actorId:number):Row|undefined {
 assertServiceV1Owner(actorId);
 return db.prepare("SELECT d.* FROM service_v1_price_events e JOIN service_v1_price_documents d ON d.id=e.document_id WHERE d.route_id=? AND d.kind=? AND e.action='PUBLISH' ORDER BY e.id DESC LIMIT 1").get(routeId,kind) as Row|undefined;
}
function replay(table:"service_v1_price_documents"|"service_v1_price_events",key:string,hash:string,actorId:number) {
 const row=db.prepare("SELECT * FROM "+table+" WHERE request_key=?").get(key) as {actor_id:number;request_hash:string}|undefined;
 if(row&&(row.actor_id!==actorId||row.request_hash!==hash))throw Error("Request key đã dùng cho thay đổi khác.");
 // Request keys are unique across this workflow, not only within each table.
 const other=table==="service_v1_price_documents"?"service_v1_price_events":"service_v1_price_documents";
 if(db.prepare("SELECT id FROM "+other+" WHERE request_key=?").get(key))throw Error("Request key đã dùng cho tác vụ khác.");
 return row;
}
export function createServiceV1Net(input:{route_id:number;config_id:number;source_excel:string;source_currency?:"USD"|"VND";rows:Array<{key:string;net_vnd?:number;net_usd?:number}>;request_key:string},actorId:number):Row {
 assertServiceV1Owner(actorId);
 if(!input||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>10000)throw Error("Cần dòng Net.");
 if(typeof input.source_excel!=="string"||!input.source_excel.trim()||input.source_excel.length>500||! /\.xlsx?$/i.test(input.source_excel))throw Error("Cần tham chiếu Excel Net chuẩn.");
 const sourceCurrency=input.source_currency??'VND';
 if(!['USD','VND'].includes(sourceCurrency))throw Error('Source currency không hợp lệ.');
 // Resolve the rate inside the same transaction as the document write below.
 const rawRows=input.rows.map(row=>{
  const value=sourceCurrency==='USD'?row?.net_usd:row?.net_vnd;
  if(!row||typeof row.key!=='string'||!row.key.trim()||row.key.length>120||typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Dòng Net không hợp lệ.');
  if(sourceCurrency==='USD'&&row.net_vnd!==undefined||sourceCurrency==='VND'&&row.net_usd!==undefined)throw Error('Dòng Net chứa hai đơn vị tiền.');
  return {key:row.key.trim(),value};
 });
 if(new Set(rawRows.map(row=>row.key)).size!==rawRows.length)throw Error('Trùng key Net.');
 const key=serviceV1Key(input.request_key);
 const hash=sourceCurrency==='VND'?fingerprint({route_id:input.route_id,config_id:input.config_id,body:{currency:'VND',source_excel:input.source_excel.trim(),rows:rawRows.map(row=>({key:row.key,net_vnd:row.value}))}}):fingerprint({route_id:input.route_id,config_id:input.config_id,source_excel:input.source_excel.trim(),sourceCurrency,rawRows});
 return db.transaction(()=>{
  const existing=replay("service_v1_price_documents",key,hash,actorId);if(existing)return existing as Row;
  const config=routeReady(input.route_id,actorId);
  if(config.id!==input.config_id)throw Error("Cấu hình V1 đã thay đổi.");
  const fx=sourceCurrency==='USD'?currentServiceV1Fx():undefined;
  if(sourceCurrency==='USD'&&JSON.parse(config.config_json).adapter!=='EPACKET')throw Error('Net USD chỉ hỗ trợ ePacket.');
  if(sourceCurrency==='USD'&&!fx)throw Error('Chưa xác nhận Rate USD–VND.');
  const rows=rawRows.map(row=>{const net_vnd=row.value*(fx?.usd_vnd??1);if(!Number.isFinite(net_vnd)||net_vnd>Number.MAX_SAFE_INTEGER)throw Error('Net vượt độ chính xác.');return {key:row.key,net_vnd,...(fx?{net_usd:row.value}:{})};});
  const body={currency:'VND',source_currency:sourceCurrency,source_excel:input.source_excel.trim(),...(fx?{fx_version_id:fx.id,usd_vnd:fx.usd_vnd}:{}),rows};
  const result=db.prepare("INSERT INTO service_v1_price_documents(route_id,kind,config_id,body_json,actor_id,request_key,request_hash) VALUES (?,'NET',?,?,?,?,?)").run(input.route_id,config.id,JSON.stringify(body),actorId,key,hash);
  return db.prepare("SELECT * FROM service_v1_price_documents WHERE id=?").get(result.lastInsertRowid) as Row;
 }).immediate();
}
export function createServiceV1Proposal(input:{route_id:number;config_id:number;net_id:number;net_markup:number;base_markup:number;request_key:string},actorId:number):Row {
 assertServiceV1Owner(actorId);
 for(const value of [input.net_markup,input.base_markup])if(typeof value!=="number"||!Number.isFinite(value)||value<0)throw Error("Markup phải là tỷ lệ không âm.");
 const key=serviceV1Key(input.request_key),hash=fingerprint({route_id:input.route_id,config_id:input.config_id,net_id:input.net_id,net_markup:input.net_markup,base_markup:input.base_markup});
 return db.transaction(()=>{
  const existing=replay("service_v1_price_documents",key,hash,actorId);if(existing)return existing as Row;
  const config=routeReady(input.route_id,actorId),net=publishedServiceV1Price(input.route_id,"NET",actorId);
  if(config.id!==input.config_id||!net||net.id!==input.net_id||net.config_id!==config.id)throw Error("Net/cấu hình published đã thay đổi hoặc chưa có.");
  const source=JSON.parse(net.body_json),fx=source.source_currency==='USD'?currentServiceV1Fx():undefined;
  if(source.source_currency==='USD'&&!fx)throw Error('Chưa xác nhận Rate USD–VND.');
  const body={currency:"VND",net_markup:input.net_markup,base_markup:input.base_markup,...(fx?{fx_version_id:fx.id,usd_vnd:fx.usd_vnd}:{}),
   // Owner 14/11: keep fractional VND without monetary rounding; operational posting is still gated.
   rows:(source.rows as NetRow[]).map(row=>{
    const net_vnd=fx?Number(row.net_usd)*fx.usd_vnd:row.net_vnd;
    const base_vnd=net_vnd*(1+input.net_markup),retail_vnd=base_vnd*(1+input.base_markup);
    if(!Number.isFinite(base_vnd)||!Number.isFinite(retail_vnd)||retail_vnd>Number.MAX_SAFE_INTEGER)throw Error("Giá vượt độ chính xác tính toán.");
    return {...row,net_vnd,base_vnd,retail_vnd};
   })};
  const result=db.prepare("INSERT INTO service_v1_price_documents(route_id,kind,config_id,source_net_id,body_json,actor_id,request_key,request_hash) VALUES (?,'PROPOSAL',?,?,?,?,?,?)").run(input.route_id,config.id,net.id,JSON.stringify(body),actorId,key,hash);
  return db.prepare("SELECT * FROM service_v1_price_documents WHERE id=?").get(result.lastInsertRowid) as Row;
 }).immediate();
}
export function serviceV1PriceEvent(input:{document_id:number;action:"REVIEW"|"PUBLISH";expected_published_id:number|null;request_key:string},actorId:number) {
 assertServiceV1Owner(actorId);
 if(!input||!["REVIEW","PUBLISH"].includes(input.action)||!(input.expected_published_id===null||(Number.isSafeInteger(input.expected_published_id)&&Number(input.expected_published_id)>0)))throw Error("Review/Publish không hợp lệ.");
 const key=serviceV1Key(input.request_key),hash=fingerprint({document_id:input.document_id,action:input.action,expected_published_id:input.expected_published_id});
 return db.transaction(()=>{
  const existing=replay("service_v1_price_events",key,hash,actorId);if(existing)return existing;
  const document=db.prepare("SELECT * FROM service_v1_price_documents WHERE id=?").get(input.document_id) as Row|undefined;
  if(!document)throw Error("Document không tồn tại.");
  const config=routeReady(document.route_id,actorId);
  if(config.id!==document.config_id)throw Error("Cấu hình đã thay đổi; cần tạo phiên bản mới.");
  const published=publishedServiceV1Price(document.route_id,document.kind,actorId);
  if((published?.id??null)!==input.expected_published_id)throw Error("Published version đã thay đổi; cần review lại.");
  if(input.action==="PUBLISH") {
   const review=db.prepare("SELECT * FROM service_v1_price_events WHERE document_id=? AND action='REVIEW'").get(document.id) as {expected_published_id:number|null}|undefined;
   if(!review||review.expected_published_id!==input.expected_published_id)throw Error("Cần Review trước Publish.");
   if(document.kind==="PROPOSAL"&&publishedServiceV1Price(document.route_id,"NET",actorId)?.id!==document.source_net_id)throw Error("Net đã thay đổi; cần Proposal mới.");
  }
  const result=db.prepare("INSERT INTO service_v1_price_events(document_id,action,expected_published_id,actor_id,request_key,request_hash) VALUES (?,?,?,?,?,?)").run(document.id,input.action,input.expected_published_id,actorId,key,hash);
  return db.prepare("SELECT * FROM service_v1_price_events WHERE id=?").get(result.lastInsertRowid);
 }).immediate();
}
export function serviceV1PriceWorkspace(routeId:number,actorId:number) {
 assertServiceV1Owner(actorId);
 return {staged:true,operational_cutover:false,rounding:"NONE",net:publishedServiceV1Price(routeId,"NET",actorId)??null,selling:publishedServiceV1Price(routeId,"PROPOSAL",actorId)??null,
 documents:db.prepare("SELECT * FROM service_v1_price_documents WHERE route_id=? ORDER BY id DESC").all(routeId),
 events:db.prepare("SELECT e.* FROM service_v1_price_events e JOIN service_v1_price_documents d ON d.id=e.document_id WHERE d.route_id=? ORDER BY e.id DESC").all(routeId)};
}
