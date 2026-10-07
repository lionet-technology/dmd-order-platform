import {createHash} from 'node:crypto';
import {db} from './db';
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='request_key').sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
/** Runs receipt persistence and money changes in the same SQLite write transaction.
 * Authorization must be checked before calling; a key cannot bypass access checks. */
export function moneyCommand<T>(scope:string,key:unknown,payload:unknown,execute:()=>T):T {
 return db.transaction(()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS money_command_receipts(scope TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(scope,request_key))`);
  if(key===undefined||key===null||key==='')return execute(); // Existing domain uniqueness remains valid for legacy commands.
  if(typeof key!=='string'||key.length>200||!key.trim())throw Error('Request key không hợp lệ.');
  const hash=createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
  const prior=db.prepare('SELECT payload_hash,result_json FROM money_command_receipts WHERE scope=? AND request_key=?').get(scope,key) as {payload_hash:string;result_json:string}|undefined;
  if(prior){if(prior.payload_hash!==hash)throw Error('Request key đã dùng cho nội dung khác.');return JSON.parse(prior.result_json) as T;}
  const result=execute();
  db.prepare('INSERT INTO money_command_receipts(scope,request_key,payload_hash,result_json) VALUES (?,?,?,?)').run(scope,key,hash,JSON.stringify(result));
  return result;
 }).immediate();
}
