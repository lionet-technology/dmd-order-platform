import {createHash} from "node:crypto";
import {db} from "./db";
import {assertServiceV1Owner,serviceV1Key} from "./service-v1-config";
import {optimizeUpsAccounts,validateUpsGlobals,type UpsGlobals,type UpsAccountPricing} from "./ups-v1-calculator";
type Version={id:number;variables_json:string;actor_id:number;request_hash:string};
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function confirmedUpsV1Globals(actorId:number):Version|undefined {
 assertServiceV1Owner(actorId);
 return db.prepare("SELECT v.* FROM service_v1_ups_global_confirmations c JOIN service_v1_ups_global_versions v ON v.id=c.version_id ORDER BY c.id DESC LIMIT 1").get() as Version|undefined;
}
/** Staged calculation with the latest confirmed globals; no operational repricing. */
export function quoteUpsV1WithConfirmedGlobals(accounts:UpsAccountPricing[],weightKg:number,actorId:number) {
 const version=confirmedUpsV1Globals(actorId);
 if(!version)throw Error("Chưa xác nhận UPS globals.");
 return {global_version_id:version.id,...optimizeUpsAccounts(accounts,weightKg,JSON.parse(version.variables_json) as UpsGlobals)};
}
export function saveUpsV1Globals(input:{variables:UpsGlobals;request_key:string},actorId:number) {
 assertServiceV1Owner(actorId);
 const key=serviceV1Key(input.request_key),variables=validateUpsGlobals(input.variables),fingerprint=hash(variables);
 return db.transaction(()=>{
  const existing=db.prepare("SELECT * FROM service_v1_ups_global_versions WHERE request_key=?").get(key) as Version|undefined;
  if(existing){if(existing.actor_id!==actorId||existing.request_hash!==fingerprint)throw Error("Request key đã dùng.");return existing;}
  if(db.prepare("SELECT id FROM service_v1_ups_global_confirmations WHERE request_key=?").get(key))throw Error("Request key đã dùng.");
  const result=db.prepare("INSERT INTO service_v1_ups_global_versions(variables_json,actor_id,request_key,request_hash) VALUES (?,?,?,?)").run(JSON.stringify(variables),actorId,key,fingerprint);
  return db.prepare("SELECT * FROM service_v1_ups_global_versions WHERE id=?").get(result.lastInsertRowid) as Version;
 }).immediate();
}
export function confirmUpsV1Globals(input:{version_id:number;expected_previous_id:number|null;confirmed:boolean;request_key:string},actorId:number) {
 assertServiceV1Owner(actorId);
 if(input.confirmed!==true||!Number.isSafeInteger(input.version_id)||input.version_id<1||!(input.expected_previous_id===null||(Number.isSafeInteger(input.expected_previous_id)&&Number(input.expected_previous_id)>0)))throw Error("Cần xác nhận rõ version global và version hiện hành.");
 const key=serviceV1Key(input.request_key),fingerprint=hash({version_id:input.version_id,expected_previous_id:input.expected_previous_id,confirmed:true});
 return db.transaction(()=>{
  const existing=db.prepare("SELECT * FROM service_v1_ups_global_confirmations WHERE request_key=?").get(key) as {actor_id:number;request_hash:string}|undefined;
  if(existing){if(existing.actor_id!==actorId||existing.request_hash!==fingerprint)throw Error("Request key đã dùng.");return existing;}
  if(db.prepare("SELECT id FROM service_v1_ups_global_versions WHERE request_key=?").get(key))throw Error("Request key đã dùng.");
  if((confirmedUpsV1Globals(actorId)?.id??null)!==input.expected_previous_id)throw Error("Global đã thay đổi; tải lại để xác nhận.");
  if(!db.prepare("SELECT id FROM service_v1_ups_global_versions WHERE id=?").get(input.version_id))throw Error("Global version không tồn tại.");
  const result=db.prepare("INSERT INTO service_v1_ups_global_confirmations(version_id,expected_previous_id,actor_id,request_key,request_hash) VALUES (?,?,?,?,?)").run(input.version_id,input.expected_previous_id,actorId,key,fingerprint);
  return db.prepare("SELECT * FROM service_v1_ups_global_confirmations WHERE id=?").get(result.lastInsertRowid);
 }).immediate();
}
