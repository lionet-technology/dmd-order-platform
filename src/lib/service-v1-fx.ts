import {createHash} from 'node:crypto';
import {db} from './db';
import {serviceV1Key} from './service-v1-config';
type Version={id:number;usd_vnd:number;actor_id:number;request_hash:string};
function admin(actorId:number){
 const actor=db.prepare("SELECT role,active FROM users WHERE id=?").get(actorId) as {role:string;active:number}|undefined;
 if(!actor?.active||actor.role!=='ADMIN')throw Error('Chỉ Admin xác nhận Rate USD–VND.');
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function currentServiceV1Fx(){return db.prepare('SELECT v.* FROM service_v1_fx_confirmations c JOIN service_v1_fx_versions v ON v.id=c.version_id ORDER BY c.id DESC LIMIT 1').get() as Version|undefined;}
export function serviceV1FxWorkspace(actorId:number){admin(actorId);return {current:currentServiceV1Fx()??null,versions:db.prepare('SELECT * FROM service_v1_fx_versions ORDER BY id DESC').all(),confirmations:db.prepare('SELECT * FROM service_v1_fx_confirmations ORDER BY id DESC').all()};}
function replay(table:'service_v1_fx_versions'|'service_v1_fx_confirmations',key:string,fingerprint:string,actorId:number){
 const other=table==='service_v1_fx_versions'?'service_v1_fx_confirmations':'service_v1_fx_versions';
 if(db.prepare('SELECT id FROM '+other+' WHERE request_key=?').get(key))throw Error('Request key đã dùng.');
 const prior=db.prepare('SELECT * FROM '+table+' WHERE request_key=?').get(key) as Version|undefined;
 if(prior&&(prior.actor_id!==actorId||prior.request_hash!==fingerprint))throw Error('Request key đã dùng cho nội dung khác.');return prior;
}
export function saveServiceV1Fx(input:{usd_vnd:number;request_key:string},actorId:number){
 admin(actorId);const key=serviceV1Key(input.request_key);
 if(typeof input.usd_vnd!=='number'||!Number.isFinite(input.usd_vnd)||input.usd_vnd<=0||input.usd_vnd>Number.MAX_SAFE_INTEGER)throw Error('Rate USD–VND phải là số dương hữu hạn.');
 const fingerprint=hash({usd_vnd:input.usd_vnd});
 return db.transaction(()=>{const prior=replay('service_v1_fx_versions',key,fingerprint,actorId);if(prior)return prior;
 const result=db.prepare('INSERT INTO service_v1_fx_versions(usd_vnd,actor_id,request_key,request_hash) VALUES (?,?,?,?)').run(input.usd_vnd,actorId,key,fingerprint);
 return db.prepare('SELECT * FROM service_v1_fx_versions WHERE id=?').get(result.lastInsertRowid) as Version;}).immediate();
}
export function confirmServiceV1Fx(input:{version_id:number;expected_previous_id:number|null;confirmed:boolean;request_key:string},actorId:number){
 admin(actorId);const key=serviceV1Key(input.request_key);
 if(input.confirmed!==true||!Number.isSafeInteger(input.version_id)||input.version_id<1||!(input.expected_previous_id===null||Number.isSafeInteger(input.expected_previous_id)&&Number(input.expected_previous_id)>0))throw Error('Cần xác nhận Rate và version hiện hành.');
 const fingerprint=hash({version_id:input.version_id,expected_previous_id:input.expected_previous_id,confirmed:true});
 return db.transaction(()=>{const prior=replay('service_v1_fx_confirmations',key,fingerprint,actorId);if(prior)return prior;
 if((currentServiceV1Fx()?.id??null)!==input.expected_previous_id)throw Error('Rate đã thay đổi; tải lại để xác nhận.');
 if(!db.prepare('SELECT id FROM service_v1_fx_versions WHERE id=?').get(input.version_id))throw Error('Rate version không tồn tại.');
 const result=db.prepare('INSERT INTO service_v1_fx_confirmations(version_id,expected_previous_id,actor_id,request_key,request_hash) VALUES (?,?,?,?,?)').run(input.version_id,input.expected_previous_id,actorId,key,fingerprint);
 return db.prepare('SELECT * FROM service_v1_fx_confirmations WHERE id=?').get(result.lastInsertRowid);}).immediate();
}
