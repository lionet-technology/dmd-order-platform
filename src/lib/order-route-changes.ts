import {db} from './db';
import {orderAccess} from './cases';
import type {AuthUser} from './auth';
import {resolveRoute} from './routes';
import {orderQuote} from './route-pricing';
import {accountFinancials,assertPurchasing} from './credit';
import {logOrderEvent} from './order-audit';
type Row=Record<string,unknown>;
function mutable(user:AuthUser,id:number){
 if(!['ADMIN','SALES','CLIENT'].includes(user.role))throw Error('Không có quyền đổi dịch vụ.');
 const o=orderAccess(user,id);
 if(o.purchase_completed_at||o.tracking||o.label||!['SALES_DRAFT','PENDING_PURCHASE'].includes(String(o.workflow_status))||db.prepare('SELECT id FROM order_trackings WHERE order_id=?').get(id)||db.prepare("SELECT order_id FROM purchase_reserves WHERE order_id=? AND status IN ('CHARGED','CANCELLED')").get(id))throw Error('Không đổi dịch vụ sau khi mua hoặc cấp Tracking/Label.');
 return o;
}
export function proposeRouteChange(user:AuthUser,id:number,routeId:number,reason:string){return db.transaction(()=>{
 if(!['ADMIN','SALES'].includes(user.role))throw Error('Admin/Sales mới được đề xuất đổi dịch vụ.');
 const o=mutable(user,id),r=resolveRoute({route_id:routeId},true);
 if(Number(o.route_id)===routeId)throw Error('Đơn đã dùng dịch vụ này.');
 if(!reason.trim())throw Error('Cần lý do đổi dịch vụ.');
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(o.client_user_id,r.service,r.sub_service,r.sub_service) as Row|undefined;
 if(!setting?.is_enabled)throw Error('Client chưa được cấp dịch vụ này.');
 const q=orderQuote({...o,route_id:r.id,service:r.service,sub_service:r.sub_service,supplier:r.supplier,discount:setting.discount_percent,pricing_snapshot_json:null});
 if(!q||!q.eligible)throw Error(q?.reasons.join(' ')||'Route chưa có bảng giá/validation hỗ trợ.');
 db.prepare("UPDATE order_route_change_proposals SET status='SUPERSEDED' WHERE order_id=? AND status='PENDING'").run(id);
 const old=Math.round(Number(o.total_due)*100),next=Math.round(q.total_charge*100);
 const proposal=Number(db.prepare('INSERT INTO order_route_change_proposals(order_id,old_route_id,new_route_id,old_total_cents,new_total_cents,quote_json,order_before_json,reason,proposed_by) VALUES (?,?,?,?,?,?,?,?,?)').run(id,o.route_id,routeId,old,next,JSON.stringify(q),JSON.stringify(o),reason,user.id).lastInsertRowid);
 logOrderEvent({orderId:id,eventType:'ROUTE_CHANGE_PROPOSED',summary:'Đề xuất đổi dịch vụ; chênh lệch '+(next-old)/100+' USD.',actorId:user.id,before:{route_id:o.route_id,total_cents:old},after:{proposal_id:proposal,route_id:r.id,total_cents:next,reason}});
 return publicProposal(db.prepare('SELECT * FROM order_route_change_proposals WHERE id=?').get(proposal) as Row);
 }).immediate();}
function publicProposal(p:Row){const r=db.prepare('SELECT service,sub_service FROM service_route_configs WHERE id=?').get(p.new_route_id) as Row;return {id:p.id,order_id:p.order_id,status:p.status,old_total_cents:p.old_total_cents,new_total_cents:p.new_total_cents,delta_cents:Number(p.new_total_cents)-Number(p.old_total_cents),service_name:r.service+' - '+r.sub_service,reason:p.reason};}
export function routeChangeProposals(user:AuthUser,id:number){orderAccess(user,id);return (db.prepare("SELECT * FROM order_route_change_proposals WHERE order_id=? AND status='PENDING' ORDER BY id DESC").all(id) as Row[]).map(publicProposal);}
export function confirmRouteChange(user:AuthUser,id:number,proposalId:number){return db.transaction(()=>{
 if(!['ADMIN','SALES','CLIENT'].includes(user.role))throw Error('Không có quyền xác nhận.');
 orderAccess(user,id);
 const p=db.prepare('SELECT * FROM order_route_change_proposals WHERE id=? AND order_id=?').get(proposalId,id) as Row|undefined;
 if(!p)throw Error('Đề xuất không tồn tại.');if(p.status==='CONFIRMED')return publicProposal(p);if(p.status!=='PENDING')throw Error('Đề xuất đã hết hiệu lực.');
 const o=mutable(user,id);
 const before=JSON.parse(String(p.order_before_json)) as Row;
 // Detect any input/price edits since the reviewed proposal.
 if(JSON.stringify(o)!==JSON.stringify(before))throw Error('Đơn đã thay đổi. Hãy tính lại chênh lệch.');
 const r=resolveRoute({route_id:p.new_route_id},true),q=JSON.parse(String(p.quote_json));
 const current=orderQuote({...o,route_id:r.id,service:r.service,sub_service:r.sub_service,supplier:r.supplier,discount:q.discount_percent,pricing_snapshot_json:null});
 if(!current?.eligible||JSON.stringify(current)!==JSON.stringify(q))throw Error('Giá hoặc điều kiện đã thay đổi. Hãy tính lại.');
 const reserve=db.prepare('SELECT * FROM purchase_reserves WHERE order_id=?').get(id) as Row|undefined;
 if(o.service_purchased_at&&!reserve)throw Error('Đơn thiếu khoản giữ tiền; cần đối soát trước khi đổi dịch vụ.');
 const delta=Number(p.new_total_cents)-Number(reserve?reserve.status==='RESERVED'?reserve.amount_cents:0:p.old_total_cents);
 if(o.client_user_id){const f=accountFinancials(Number(o.client_user_id));if(f.purchase_blocked||delta>f.available_to_buy_cents)throw Error('Balance / credit không đủ để xác nhận tăng giá.');if(!reserve&&Number(p.new_total_cents)>Number(p.old_total_cents))assertPurchasing(Number(o.client_user_id),Number(p.new_total_cents)/100);}
 db.prepare("UPDATE order_route_change_proposals SET status='APPLYING',confirmed_by=? WHERE id=?").run(user.id,proposalId);
 db.prepare('UPDATE orders SET route_id=?,service=?,sub_service=?,supplier=?,discount=?,est_net_cost=?,base_cost=?,retail=?,sales_price=?,surcharge=?,total_due=?,chargeable_weight=?,gross_profit_base=?,gross_profit_net=?,commission_amount=?,pricing_snapshot_json=?,pricing_version_id=?,pricing_config_version_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(r.id,r.service,r.sub_service,r.supplier,q.discount_percent,q.net,q.base,q.retail,q.sale_price,q.surcharge,q.total_charge,q.chargeable_weight,q.gross_profit_base,q.gross_profit_net,q.commission,o.pricing_snapshot_json?JSON.stringify(q):null,o.pricing_snapshot_json?q.pricing_version_id:null,o.pricing_snapshot_json?q.pricing_config_version_id:null,id);
 if(reserve)db.prepare("UPDATE purchase_reserves SET amount_cents=?,status='RESERVED',actor_id=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").run(p.new_total_cents,user.id,id);
 db.prepare("UPDATE order_route_change_proposals SET status='CONFIRMED',confirmed_at=CURRENT_TIMESTAMP WHERE id=?").run(proposalId);
 db.prepare('DELETE FROM manual_purchase_drafts WHERE order_id=?').run(id);
 logOrderEvent({orderId:id,eventType:'ROUTE_CHANGE_CONFIRMED',summary:'Đã xác nhận đổi dịch vụ; chênh lệch '+(Number(p.new_total_cents)-Number(p.old_total_cents))/100+' USD.',actorId:user.id,before:{route_id:p.old_route_id,total_cents:p.old_total_cents},after:{route_id:r.id,total_cents:p.new_total_cents,proposal_id:proposalId,confirmed_by:user.id,reason:p.reason}});
 return publicProposal({...p,status:'CONFIRMED'});
 }).immediate();}
