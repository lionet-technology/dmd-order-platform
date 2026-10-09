import {normalizeCountry} from './epacket-pricing';
import { db } from './db';
import { canAccessClient,getClientAccount,type AuthUser } from './auth';
import { CLIENT_FIELDS } from './client-order-import';
import { safePricing,purchaseService } from './route-pricing';
import { upsertOrder } from './finance';
import { logOrderEvent } from './order-audit';
type Row=Record<string,unknown>;
export type DraftView=Row&{draft_state:string;error_group:string|null;reasons:string[];pricing:ReturnType<typeof safePricing>};
function clientFor(actor:AuthUser,id:number){const client=getClientAccount(id,true);if(!client||!canAccessClient(actor,client))throw Error('Không có quyền truy cập Client.');return client;}
function audit(id:number,actor:AuthUser,action:string,detail:unknown){db.prepare('INSERT INTO client_draft_audit(draft_id,actor_id,action,detail_json) VALUES (?,?,?,?)').run(id,actor.id,action,JSON.stringify(detail));}
function rawDraft(id:number){return db.prepare('SELECT * FROM client_order_drafts WHERE id=? AND deleted_at IS NULL').get(id) as Row|undefined;}
export function draftData(d:Row):Row{
 const client=getClientAccount(Number(d.client_id));
 let route=db.prepare('SELECT * FROM service_route_configs WHERE id=?').get(Number(d.route_id)) as Row|undefined;
 if(route&&!route.active&&!d.submitted_order_id)route=(db.prepare('SELECT * FROM service_route_configs WHERE service_identity_id=? AND active=1').get(route.service_identity_id) as Row|undefined)||route;
 if(!route||!client)throw Error('Route hoặc Client không còn hợp lệ.');
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(client.id,String(route.service),String(route.sub_service),String(route.sub_service)) as Row|undefined;
 const input=JSON.parse(String(d.input_json)) as Row;
 return {...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,input[k]])),country:normalizeCountry(input.country),client_user_id:client.id,customer:client.display_name,sales_user_id:client.sales_user_id,route_id:route.id,service:route.service,sub_service:route.sub_service,supplier:route.supplier,discount:setting?.discount_percent??0};
}
export function draftView(d:Row,_role:string):DraftView{
 const data=draftData(d),errors:string[]=[];
 if(d.submitted_order_id){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(d.submitted_order_id) as Row;return {...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,data[k]])),id:-Number(d.id),draft_id:Number(d.id),route_id:data.route_id,client_user_id:d.client_id,submitted_order_id:o.id,system_order_code:o.system_order_code,pricing:safePricing(o,'CLIENT'),readonly:true,draft_state:'submitted',error_group:null,reasons:[]};}
 if(d.legacy_order_id){const old=db.prepare("SELECT workflow_status,system_order_code FROM orders WHERE id=?").get(d.legacy_order_id) as Row|undefined;data.id=d.legacy_order_id;data.workflow_status=old?.workflow_status;data.system_order_code=old?.system_order_code;}
 for(const k of ['order_id','recipient_name','address1','city','state','zip','phone','item','material'])if(!String(data[k]||'').trim())errors.push('Thiếu '+k);
 const pricing=safePricing(data,"CLIENT");
 if(!(Number(data.weight)>0))errors.push('Cân nặng phải >0.');
 if(!Number.isInteger(Number(data.carton_count))||Number(data.carton_count)<1)errors.push('Carton phải là số nguyên >=1.');
 const n=['length','width','height'].filter(k=>Number(data[k])>0).length;
 if(n!==3&&!(n===0&&Number(data.manual_volume)>0))errors.push('Nhập đủ kích thước hoặc thể tích.');
 if(!pricing)errors.push('Route chưa có giá active.');
 if(pricing){pricing.reasons=[...errors,...pricing.reasons];pricing.eligible=!pricing.reasons.length;}
 const duplicate=db.prepare("SELECT id,system_order_code,order_id,tracking FROM orders WHERE client_user_id=? AND trim(order_id)=? AND id<>? AND (service_purchased_at IS NOT NULL OR purchase_completed_at IS NOT NULL OR COALESCE(tracking,'')<>'') LIMIT 1").get(Number(d.client_id),String(data.order_id||'').trim(),Number(d.legacy_order_id)||0) as Row|undefined;
 if(duplicate)errors.push('Trùng đơn: Tracking '+String(duplicate.tracking||'—')+' · Client Order ID '+duplicate.order_id+' · DMD ID '+String(duplicate.system_order_code||duplicate.id));
 const reasons=[...new Set([...errors,...(pricing?.reasons||[]),...(d.failure_reason?[String(d.failure_reason)]:[])])];
 if(pricing){pricing.reasons=reasons;pricing.eligible=!reasons.length;}
 const incomplete=errors.some(r=>r.startsWith('Thiếu ')||r.startsWith('Nhập đủ'))||!String(data.weight??'').trim();
 const state=incomplete?'incomplete':reasons.length?'needs_fix':'ready';
 const errorGroup=reasons.length?(reasons.some(r=>/giá active|cấu hình giá|Lỗi hệ thống|backend|transaction/i.test(r))?'SYSTEM':'DATA'):null;
 const {supplier,...publicData}=data;void supplier;
 return {...publicData,id:-Number(d.id),draft_id:Number(d.id),route_id:data.route_id,created_at:d.created_at,updated_at:d.updated_at,workflow_status:'SALES_DRAFT',draft_state:state,error_group:errorGroup,reasons,failure_reason:d.failure_reason,pricing};
}
export function saveDrafts(actor:AuthUser,clientId:number,routeId:number,rows:Row[]){
 if(!rows.length||rows.length>1000)throw Error("Nhập 1–1000 Draft.");
 clientFor(actor,clientId);
 return db.transaction(()=>rows.map(row=>{
 let id=Number(row.draft_id|| (Number(row.id)<0?-Number(row.id):0));
 if(Number(row.id)>0){
 const legacy=db.prepare('SELECT * FROM orders WHERE id=? AND client_user_id=?').get(Number(row.id),clientId) as Row|undefined;
 if(!legacy||legacy.service_purchased_at||legacy.purchase_completed_at||legacy.pricing_snapshot_json||['CANCELLED','PURCHASED','RECONCILED'].includes(String(legacy.workflow_status)))throw Error('Không được sửa Order này.');
 const link=db.prepare('SELECT id FROM client_order_drafts WHERE legacy_order_id=?').get(legacy.id) as Row|undefined;
 id=Number(link?.id||db.prepare('INSERT INTO client_order_drafts(client_id,route_id,input_json,legacy_order_id,created_by,updated_by) VALUES (?,?,?,?,?,?)').run(clientId,routeId,'{}',legacy.id,actor.id,actor.id).lastInsertRowid);
 }
 const requestKey=String(row.request_key||'');
 if(requestKey.length>200)throw Error('Mã dòng quá dài.');
 if(!id&&requestKey){const match=db.prepare('SELECT id FROM client_order_drafts WHERE client_id=? AND request_key=? AND deleted_at IS NULL').get(clientId,requestKey) as Row|undefined;if(match)id=Number(match.id);}
 const old=id?rawDraft(id):undefined;
 if(id&&(!old||Number(old.client_id)!==clientId))throw Error("Không được sửa Draft này.");
 if(old?.submitted_order_id)return draftView(old,actor.role);
 const route=db.prepare('SELECT * FROM service_route_configs WHERE id=?').get(routeId) as Row|undefined;
 if(!route)throw Error('Route không hợp lệ.');
 const preserved=!!old&&Number(old.route_id)===routeId;
 if(!preserved&&(!route.active||!route.client_self_purchase))throw Error('Route không cho phép đặt đơn mới.');
 const permission=db.prepare("SELECT is_enabled FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(clientId,String(route.service),String(route.sub_service),String(route.sub_service)) as Row|undefined;
 if(!preserved&&!permission?.is_enabled)throw Error('Client chưa được cấp route này.');
 if(id&&(!old||Number(old.client_id)!==clientId||old.submitted_order_id))throw Error('Không được sửa Draft này.');

 const input=JSON.stringify(Object.fromEntries(CLIENT_FIELDS.map(k=>[k,row[k]??''])));
 const draftId=id||Number(db.prepare('INSERT INTO client_order_drafts(client_id,route_id,input_json,created_by,updated_by,request_key) VALUES (?,?,?,?,?,?)').run(clientId,routeId,input,actor.id,actor.id,requestKey||null).lastInsertRowid);
 if(id)db.prepare('UPDATE client_order_drafts SET route_id=?,input_json=?,failure_reason=NULL,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(routeId,input,actor.id,id);
 audit(draftId,actor,'SAVE',{input:JSON.parse(input),route_id:routeId});
 return draftView(rawDraft(draftId)!,actor.role);
 })).immediate();
}
export function listDrafts(actor:AuthUser,clientId?:number):DraftView[]{
 if(!["ADMIN","SALES","CLIENT"].includes(actor.role))throw Error("Không có quyền xem Draft.");
 // Copy legacy Client drafts into the raw draft store; keep original records intact.
 const legacy=db.prepare("SELECT o.*,r.id route_id FROM orders o JOIN users u ON u.id=o.client_user_id AND u.role='CLIENT' JOIN service_route_configs r ON r.id=o.route_id WHERE o.service_purchased_at IS NULL AND o.purchase_completed_at IS NULL AND (o.workflow_status='SALES_DRAFT' OR (o.workflow_status='PENDING_PURCHASE' AND o.created_by_user_id IN (SELECT id FROM users WHERE role='CLIENT'))) AND NOT EXISTS (SELECT 1 FROM client_order_drafts d WHERE d.legacy_order_id=o.id)").all() as Row[];
 db.transaction(()=>{for(const o of legacy)db.prepare('INSERT OR IGNORE INTO client_order_drafts(client_id,route_id,input_json,legacy_order_id,created_by,updated_by,created_at) VALUES (?,?,?,?,?,?,?)').run(o.client_user_id,o.route_id,JSON.stringify(Object.fromEntries(CLIENT_FIELDS.map(k=>[k,o[k]??'']))),o.id,o.created_by_user_id||o.client_user_id,o.updated_by_user_id||o.created_by_user_id||o.client_user_id,o.created_at);}).immediate();

 if(clientId)clientFor(actor,clientId);
 const where=['d.deleted_at IS NULL','d.submitted_order_id IS NULL'],args:unknown[]=[];
 if(actor.role==='CLIENT'){where.push('d.client_id=?');args.push(actor.id)}
 else if(actor.role==='SALES'){where.push('d.client_id IN (SELECT id FROM users WHERE sales_user_id=?)');args.push(actor.id)}
 if(clientId){where.push('d.client_id=?');args.push(clientId)}
 return (db.prepare('SELECT d.* FROM client_order_drafts d WHERE '+where.join(' AND ')+' ORDER BY d.id DESC').all(...args) as Row[]).map(d=>{try{return draftView(d,actor.role)}catch{return {id:-Number(d.id),draft_id:Number(d.id),client_user_id:d.client_id,route_id:d.route_id,created_at:d.created_at,updated_at:d.updated_at,workflow_status:'SALES_DRAFT',draft_state:'needs_fix',error_group:'SYSTEM',reasons:['Route hoặc cấu hình giá không còn hợp lệ.'],failure_reason:'Route hoặc cấu hình giá không còn hợp lệ.',pricing:null}}});
}
export function submitDrafts(actor:AuthUser,ids:number[]){
 ids=[...new Set(ids)];
 if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error("Draft ID không hợp lệ.");
 if(!['CLIENT','SALES','ADMIN'].includes(actor.role))throw Error('Không có quyền đặt Draft.');
 if(!ids.length||ids.length>1000)throw Error("Chọn 1–1000 Draft.");
 const input=ids.map(id=>rawDraft(id));const counts=new Map<string,number>();
 for(const d of input){if(d&&canAccessClient(actor,getClientAccount(Number(d.client_id))!)&&!d.submitted_order_id){try{const key=String(draftData(d).order_id||'').trim();counts.set(String(d.client_id)+':'+key,(counts.get(String(d.client_id)+':'+key)||0)+1)}catch{/* Report invalid drafts independently in the submission loop. */}}}
 const orders:Row[]=[],failures:Row[]=[];
 for(let i=0;i<ids.length;i++){
 const id=ids[i];
 try{const order=db.transaction(()=>{
 const d=rawDraft(id);if(!d||!canAccessClient(actor,getClientAccount(Number(d.client_id))!))throw Error('Không có quyền đặt Draft này.');
 if(d.submitted_order_id){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(d.submitted_order_id) as Row;return {id:o.id,draft_id:id,system_order_code:o.system_order_code,order_id:o.order_id,pricing:safePricing(o,'CLIENT')};}
 const data=draftData(d),key=String(data.order_id||'').trim();
 if((counts.get(String(d.client_id)+':'+key)||0)>1)throw Error('Client Order ID trùng trong batch: '+key);
 const preview=draftView({...d,failure_reason:null},'CLIENT');if(!preview.pricing?.eligible)throw Error(preview.reasons.join(' ')||'Draft chưa đủ điều kiện.');
 const duplicate=db.prepare("SELECT id,system_order_code,order_id,tracking FROM orders WHERE client_user_id=? AND trim(order_id)=? AND (service_purchased_at IS NOT NULL OR purchase_completed_at IS NOT NULL OR (workflow_status<>'SALES_DRAFT' AND (created_by_user_id IS NULL OR created_by_user_id NOT IN (SELECT id FROM users WHERE role='CLIENT')))) LIMIT 1").get(Number(d.client_id),key) as Row|undefined;
 if(duplicate)throw Error('Trùng đơn: Tracking '+String(duplicate.tracking||'—')+' · Client Order ID '+duplicate.order_id+' · DMD ID '+String(duplicate.system_order_code||duplicate.id));
 if(d.legacy_order_id){const legacy=db.prepare('SELECT * FROM orders WHERE id=?').get(d.legacy_order_id) as Row;if(legacy.route_id!==data.route_id&&!legacy.service_purchased_at&&!legacy.pricing_snapshot_json&&!legacy.tracking&&!legacy.purchase_completed_at){db.prepare('UPDATE orders SET route_id=?,service=?,sub_service=?,supplier=? WHERE id=?').run(data.route_id,data.service,data.sub_service,data.supplier,legacy.id);audit(id,actor,'ACTIVE_ROUTE_REPLACEMENT',{old_route_id:legacy.route_id,new_route_id:data.route_id});}}
 const saved=upsertOrder({...data,...(d.legacy_order_id?{id:Number(d.legacy_order_id)}:{create_new:true})}) as Row;
 db.prepare('UPDATE orders SET created_by_user_id=?,updated_by_user_id=?,sales_user_id=? WHERE id=?').run(actor.id,actor.id,getClientAccount(Number(d.client_id))?.sales_user_id,saved.id);
 const o=purchaseService(Number(saved.id),actor,true,true);
 db.prepare('UPDATE client_order_drafts SET submitted_order_id=?,route_id=?,failure_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(o.id,o.route_id,id);audit(id,actor,'SUBMIT',{order_id:o.id});
 logOrderEvent({orderId:Number(o.id),eventType:'ORDER_CREATED',summary:actor.role==='CLIENT'?'Client xác nhận đặt đơn từ Draft.':'Nhân viên xác nhận đặt đơn từ Draft cho Client.',actorId:actor.id});
 return {id:o.id,draft_id:id,system_order_code:o.system_order_code,order_id:o.order_id,pricing:safePricing(o,'CLIENT')};
 }).immediate();orders.push(order);
 }catch(e){const raw=(e as Error).message;const reason=/Thiếu|Trùng|trùng|Cân|Carton|kích|Balance|credit|điều kiện|Route|route|quyền|Hold|huỷ|Draft|dịch vụ|Đơn/.test(raw)?raw:'Lỗi hệ thống khi xử lý giao dịch. Vui lòng thử lại.';failures.push({id:-id,draft_id:id,error:reason,error_group:/giá active|cấu hình giá|Lỗi hệ thống/i.test(reason)?'SYSTEM':'DATA'});const d=rawDraft(id);if(d&&canAccessClient(actor,getClientAccount(Number(d.client_id))!)&&!d.submitted_order_id)db.transaction(()=>{db.prepare('UPDATE client_order_drafts SET failure_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(reason,id);audit(id,actor,'SUBMIT_FAILED',{reason})}).immediate();}
 }
 return {orders,failures};
}
export function deleteDrafts(actor:AuthUser,clientId:number,ids:number[]|null){
 clientFor(actor,clientId);if(!clientId)throw Error('Chọn một Client cụ thể trước khi xóa Draft.');
 return db.transaction(()=>{const drafts=db.prepare('SELECT * FROM client_order_drafts WHERE client_id=? AND deleted_at IS NULL AND submitted_order_id IS NULL').all(clientId) as Row[];let deleted=0;
 for(const d of drafts){if(ids&&!ids.includes(Number(d.id)))continue;db.prepare('UPDATE client_order_drafts SET deleted_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?').run(actor.id,d.id);audit(Number(d.id),actor,'DELETE',{});deleted++;}return {deleted};}).immediate();
}
