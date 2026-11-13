import {createHash} from "node:crypto";
import {db} from "./db";
import {assertServiceV1Owner,readServiceV1Config,serviceV1Key} from "./service-v1-config";
import {routeState} from "./route-lifecycle";
import {validateUpsRates,upsAccountNet,type UpsAccount,type UpsAccountPricing} from "./ups-v1-calculator";
import {quoteUpsV1WithConfirmedGlobals} from "./ups-v1-globals";
type AccountBody=Omit<UpsAccountPricing,"zone">;
type Version={id:number;route_id:number;config_id:number;account:UpsAccount;body_json:string;actor_id:number;request_hash:string};
const fingerprint=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function ready(routeId:number,configId:number,actorId:number) {
 const config=readServiceV1Config(routeId,actorId),route=db.prepare("SELECT service,active,warehouse_hold FROM service_route_configs WHERE id=?").get(routeId) as {service:string;active:number;warehouse_hold:number}|undefined;
 if(!config||config.id!==configId||JSON.parse(config.config_json).adapter!=="UPS"||!route?.active||route.warehouse_hold||!/^UPS$/i.test(route.service)||routeState(routeId)!=="ACTIVE")throw Error("Cần cấu hình UPS hiện hành, active và không Hold.");
}
function replay(table:"service_v1_ups_account_versions"|"service_v1_ups_account_events",key:string,hash:string,actorId:number) {
 const row=db.prepare("SELECT * FROM "+table+" WHERE request_key=?").get(key) as {actor_id:number;request_hash:string}|undefined;
 if(row&&(row.actor_id!==actorId||row.request_hash!==hash))throw Error("Request key đã dùng.");
 const other=table==="service_v1_ups_account_versions"?"service_v1_ups_account_events":"service_v1_ups_account_versions";
 if(db.prepare("SELECT id FROM "+other+" WHERE request_key=?").get(key))throw Error("Request key đã dùng.");
 return row;
}
export function publishedUpsV1Account(routeId:number,account:UpsAccount,actorId:number):Version|undefined {
 assertServiceV1Owner(actorId);
 return db.prepare("SELECT v.* FROM service_v1_ups_account_events e JOIN service_v1_ups_account_versions v ON v.id=e.version_id WHERE v.route_id=? AND v.account=? AND e.action='PUBLISH' ORDER BY e.id DESC LIMIT 1").get(routeId,account) as Version|undefined;
}
export function saveUpsV1Account(input:{route_id:number;config_id:number;source_excel:string;pricing:AccountBody;request_key:string},actorId:number):Version {
 assertServiceV1Owner(actorId);
 if(typeof input.source_excel!=="string"||input.source_excel.length>500||! /\.xlsx?$/i.test(input.source_excel.trim()))throw Error("Cần nguồn Excel account.");
 const pricing=input.pricing;
 if(!pricing||!["VTT","SDS","JD"].includes(pricing.account))throw Error("Account không hợp lệ.");
 validateUpsRates(pricing.rates);
 // Normalize all supported fields and validate components using each band's interior point.
 const body:AccountBody={account:pricing.account,rates:pricing.rates.map(r=>({zone:r.zone,min_kg:r.min_kg,max_kg:r.max_kg,min_inclusive:r.min_inclusive,max_inclusive:r.max_inclusive,unit:r.unit,rate_vnd:r.rate_vnd})),net_discount:pricing.net_discount,shipment_surcharge_vnd:pricing.shipment_surcharge_vnd,shipment_discount:pricing.shipment_discount,weight_surcharge_vnd_per_kg:pricing.weight_surcharge_vnd_per_kg,weight_discount:pricing.weight_discount};
 const r=body.rates[0];
 upsAccountNet({...body,zone:r.zone},r.min_kg+(r.max_kg-r.min_kg)/2,{fuel:0,vat:0,us_broker:0,customs_per_kg_vnd:0});
 const key=serviceV1Key(input.request_key),source=input.source_excel.trim(),hash=fingerprint({route_id:input.route_id,config_id:input.config_id,source,body});
 return db.transaction(()=>{
  const existing=replay("service_v1_ups_account_versions",key,hash,actorId);if(existing)return existing as Version;
  ready(input.route_id,input.config_id,actorId);
  const result=db.prepare("INSERT INTO service_v1_ups_account_versions(route_id,config_id,account,source_excel,body_json,actor_id,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?)").run(input.route_id,input.config_id,body.account,source,JSON.stringify(body),actorId,key,hash);
  return db.prepare("SELECT * FROM service_v1_ups_account_versions WHERE id=?").get(result.lastInsertRowid) as Version;
 }).immediate();
}
export function upsV1AccountEvent(input:{version_id:number;action:"REVIEW"|"PUBLISH";expected_previous_id:number|null;request_key:string},actorId:number) {
 assertServiceV1Owner(actorId);
 if(!["REVIEW","PUBLISH"].includes(input.action)||!(input.expected_previous_id===null||(Number.isSafeInteger(input.expected_previous_id)&&Number(input.expected_previous_id)>0)))throw Error("Review/Publish không hợp lệ.");
 const key=serviceV1Key(input.request_key),hash=fingerprint({version_id:input.version_id,action:input.action,expected_previous_id:input.expected_previous_id});
 return db.transaction(()=>{
  const existing=replay("service_v1_ups_account_events",key,hash,actorId);if(existing)return existing;
  const version=db.prepare("SELECT * FROM service_v1_ups_account_versions WHERE id=?").get(input.version_id) as Version|undefined;
  if(!version)throw Error("Account version không tồn tại.");
  ready(version.route_id,version.config_id,actorId);
  if((publishedUpsV1Account(version.route_id,version.account,actorId)?.id??null)!==input.expected_previous_id)throw Error("Account published đã thay đổi.");
  if(input.action==="PUBLISH"){
   const review=db.prepare("SELECT * FROM service_v1_ups_account_events WHERE version_id=? AND action='REVIEW'").get(version.id) as {expected_previous_id:number|null}|undefined;
   if(!review||review.expected_previous_id!==input.expected_previous_id)throw Error("Cần Review trước Publish.");
  }
  const result=db.prepare("INSERT INTO service_v1_ups_account_events(version_id,action,expected_previous_id,actor_id,request_key,request_hash) VALUES (?,?,?,?,?,?)").run(version.id,input.action,input.expected_previous_id,actorId,key,hash);
  return db.prepare("SELECT * FROM service_v1_ups_account_events WHERE id=?").get(result.lastInsertRowid);
 }).immediate();
}
/** Caller supplies explicit, verified account→zone lookup; no geography is guessed here. */
export function quotePublishedUpsV1(routeId:number,zones:Array<{account:UpsAccount;zone:string}>,weightKg:number,actorId:number) {
 assertServiceV1Owner(actorId);
 if(!Array.isArray(zones)||!zones.length)throw Error("Cần zone cho mọi published account.");
 const published=db.prepare("SELECT DISTINCT v.account FROM service_v1_ups_account_events e JOIN service_v1_ups_account_versions v ON v.id=e.version_id WHERE v.route_id=? AND e.action='PUBLISH'").all(routeId) as {account:string}[];
 if(published.length!==zones.length||published.some(v=>!zones.some(z=>z.account===v.account)))throw Error("Không được bỏ sót published account khi tối ưu.");
 const versions=zones.map(entry=>{
  const version=publishedUpsV1Account(routeId,entry.account,actorId);
  if(!version)throw Error("Thiếu published account "+entry.account);
  ready(routeId,version.config_id,actorId);
  return {version,pricing:{...JSON.parse(version.body_json),zone:entry.zone} as UpsAccountPricing};
 });
 const quote=quoteUpsV1WithConfirmedGlobals(versions.map(v=>v.pricing),weightKg,actorId);
 return {...quote,account_versions:versions.map(v=>({account:v.version.account,version_id:v.version.id}))};
}
