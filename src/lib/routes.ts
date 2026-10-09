import {db} from './db';
type Row=Record<string,unknown>;
export function resolveRoute(o:Row,active=false):Row{
 const id=Number(o.route_id||0);
 const rows=id?db.prepare('SELECT * FROM service_route_configs WHERE id=?').all(id):db.prepare("SELECT * FROM service_route_configs WHERE lower(trim(service))=lower(trim(?)) AND lower(trim(sub_service))=lower(trim(?)) AND (?='' OR lower(trim(supplier))=lower(trim(?)))"+(active?' AND active=1':'')).all(String(o.service||''),String(o.sub_service||''),String(o.supplier||''),String(o.supplier||''));
 if(rows.length!==1)throw Error(rows.length?'Không xác định duy nhất Route; cần xử lý dữ liệu lịch sử.':'Dịch vụ chưa có Route được cấu hình.');
 const r=rows[0] as Row;if(active&&!r.active)throw Error('Dịch vụ đang ngừng hoạt động.');return r;
}
export function routeReferences(id:number){
 const refs:Record<string,number>={};
 for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'route_lifecycle_audit'").all() as {name:string}[]){
 const cols=db.prepare('PRAGMA table_info("'+row.name.replaceAll('"','""')+'")').all() as {name:string}[];
 for(const col of cols.filter(c=>['route_id','route_config_id','old_route_id','new_route_id'].includes(c.name))){
 const n=(db.prepare('SELECT count(*) n FROM "'+row.name.replaceAll('"','""')+'" WHERE "'+col.name+'"=?').get(id) as {n:number}).n;if(n)refs[row.name]=(refs[row.name]||0)+n;
 }
 }
 const legacy=(db.prepare("SELECT count(*) n FROM orders o JOIN service_route_configs r ON r.id=? WHERE o.route_id IS NULL AND lower(trim(o.service))=lower(trim(r.service)) AND lower(trim(o.sub_service))=lower(trim(r.sub_service)) AND (trim(COALESCE(o.supplier,''))='' OR lower(trim(o.supplier))=lower(trim(r.supplier)))").get(id) as {n:number}).n;
 if(legacy)refs.unresolved_orders=legacy;
 const missing=(db.prepare('SELECT count(*) n FROM orders WHERE route_id=? AND true_net_cost IS NULL').get(id) as {n:number}).n;
 const claims=db.prepare("SELECT name FROM sqlite_master WHERE name='operation_cases'").get()?(db.prepare("SELECT count(DISTINCT c.id) n FROM operation_cases c JOIN operation_case_orders co ON co.case_id=c.id JOIN orders o ON o.id=co.order_id WHERE o.route_id=? AND c.kind='CLAIM' AND c.status NOT IN ('CLOSED','RESOLVED')").get(id) as {n:number}).n:0;
 return {references:refs,can_delete:!Object.keys(refs).length,missing_cost_orders:missing,open_claims:claims};
}
export function routeLifecycle(id:number,status:string,confirmed:boolean,actorId:number){return db.transaction(()=>{
 const r=db.prepare('SELECT * FROM service_route_configs WHERE id=?').get(id) as Row|undefined;if(!r)throw Error('Route không tồn tại.');
 const summary=routeReferences(id);
 if(!['ACTIVE','INACTIVE','ARCHIVED','DELETE'].includes(status))throw Error('Trạng thái Route không hợp lệ.');
 if(['ARCHIVED','DELETE'].includes(status)&&!confirmed)throw Error('Cần xác nhận; '+summary.missing_cost_orders+' đơn thiếu True Net Cost, '+summary.open_claims+' Claim đang mở.');
 if(status==='DELETE'){if(!summary.can_delete)throw Error('Route có tham chiếu nghiệp vụ; hãy Archive.');db.prepare('DELETE FROM service_route_configs WHERE id=?').run(id);}
 else {if(status==='ACTIVE'&&db.prepare('SELECT id FROM service_route_configs WHERE active=1 AND lower(trim(service))=lower(trim(?)) AND lower(trim(sub_service))=lower(trim(?)) AND id<>?').get(r.service,r.sub_service,id))throw Error('Dịch vụ '+r.service+' - '+r.sub_service+' đã có Route đang hoạt động. Vui lòng đổi tên dịch vụ ở Route mới hoặc ngừng kích hoạt Route hiện tại.');db.prepare('UPDATE service_route_configs SET active=?,status=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status==='ACTIVE'?1:0,status,actorId,id);}
 db.prepare('INSERT INTO route_lifecycle_audit(route_id,actor_id,action,before_json,summary_json) VALUES (?,?,?,?,?)').run(id,actorId,status,JSON.stringify(r),JSON.stringify(summary));return summary;
 }).immediate();}
