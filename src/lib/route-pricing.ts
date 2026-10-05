import {hasCaseHold} from "./cases";
import { assertPurchasing, reservePurchase, accountFinancials } from "./credit";
import { db } from "./db";
import { DEFAULT_SURCHARGES,isEPacket,quote,usd,validateRules,validateTiers } from "./epacket-pricing";
import { logOrderEvent,publishPublicNote } from "./order-audit";
type Row=Record<string,unknown>;
export function activePricing(routeId:number,at=new Date().toISOString()){
 return db.prepare("SELECT a.*,p.tiers_json,c.base_markup,c.retail_markup,c.currency,c.surcharges_json FROM route_pricing_activations a JOIN route_price_versions p ON p.id=a.price_version_id JOIN route_pricing_configs c ON c.id=a.config_version_id WHERE a.route_id=? AND a.effective_at<=? ORDER BY a.effective_at DESC,a.id DESC LIMIT 1").get(routeId,at) as Row|undefined;
}
export function pricingAdmin(routeId:number){
 return {active:activePricing(routeId),versions:db.prepare("SELECT * FROM route_price_versions WHERE route_id=? ORDER BY version_number DESC").all(routeId),configs:db.prepare("SELECT * FROM route_pricing_configs WHERE route_id=? ORDER BY id DESC").all(routeId),activations:db.prepare("SELECT * FROM route_pricing_activations WHERE route_id=? ORDER BY effective_at DESC,id DESC").all(routeId)};
}
export function createPriceVersion(routeId:number,tiers:unknown,actorId:number){
 const validated=validateTiers(tiers);
 return db.transaction(()=>{
 const n=(db.prepare("SELECT COALESCE(MAX(version_number),0)+1 n FROM route_price_versions WHERE route_id=?").get(routeId) as {n:number}).n;
 const id=Number(db.prepare("INSERT INTO route_price_versions(route_id,version_number,tiers_json,created_by_user_id) VALUES (?,?,?,?)").run(routeId,n,JSON.stringify(validated),actorId).lastInsertRowid);
 return db.prepare("SELECT * FROM route_price_versions WHERE id=?").get(id) as Row;
 }).immediate();
}
export function activatePricing(routeId:number,body:Row,actorId:number){
 return db.transaction(()=>{
 const price=db.prepare("SELECT * FROM route_price_versions WHERE id=? AND route_id=?").get(Number(body.price_version_id),routeId) as Row|undefined;
 if(!price)throw Error("Version bảng giá không thuộc route.");
 const base=Number(body.base_markup??6),retail=Number(body.retail_markup??16);
 if(!Number.isFinite(base)||!Number.isFinite(retail)||base<0||base>1000||retail<base||retail>1000)throw Error("Markup không hợp lệ; Retail phải >= Base.");
 if(body.currency&&body.currency!=="USD")throw Error("Phase 1 chỉ dùng USD.");
 const rules=validateRules(body.surcharges??DEFAULT_SURCHARGES);
 const when=body.effective_at?new Date(String(body.effective_at)):new Date();
 if(!Number.isFinite(when.getTime()))throw Error("Thời điểm kích hoạt không hợp lệ.");
 const config=Number(db.prepare("INSERT INTO route_pricing_configs(route_id,base_markup,retail_markup,currency,surcharges_json,created_by_user_id) VALUES (?,?,?,'USD',?,?)").run(routeId,base,retail,JSON.stringify(rules),actorId).lastInsertRowid);
 db.prepare("INSERT INTO route_pricing_activations(route_id,price_version_id,config_version_id,effective_at,actor_user_id) VALUES (?,?,?,?,?)").run(routeId,price.id,config,when.toISOString(),actorId);
 return pricingAdmin(routeId);
 }).immediate();
}
export function routeFor(o:Row){
 return db.prepare("SELECT * FROM service_route_configs WHERE lower(service)=lower(?) AND lower(sub_service)=lower(?) AND lower(supplier)=lower(?)").get(String(o.service||""),String(o.sub_service||""),String(o.supplier||"")) as Row|undefined;
}
export function orderQuote(o:Row){
 if(!o.pricing_snapshot_json&&(o.purchase_completed_at||["PURCHASED","RECONCILED"].includes(String(o.workflow_status))))return null;
 const route=routeFor(o);if(!route||!isEPacket(o))return null;
 const active=activePricing(Number(route.id));if(!active)return null;
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(Number(o.client_user_id||0),String(o.service),String(o.sub_service),String(o.sub_service)) as Row|undefined;
 let measurement=o;
 if(o.measurement_mode==="CARTON"&&o.id){const cartons=db.prepare("SELECT * FROM order_cartons WHERE order_id=?").all(Number(o.id)) as Row[];measurement={...o,...cartons[0],id:o.id,carton_count:cartons.length,country:o.country,state:o.state,city:o.city,zip:o.zip}}
 const result=o.pricing_snapshot_json?JSON.parse(String(o.pricing_snapshot_json)) as ReturnType<typeof quote>:quote(measurement,JSON.parse(String(active.tiers_json)),Number(active.base_markup),Number(active.retail_markup),Number(o.discount??setting?.discount_percent??0),JSON.parse(String(active.surcharges_json)));
 if(!route.active)result.reasons.push("Route đang ngừng hoạt động.");
 if(o.client_user_id&&(!setting||!setting.is_enabled))result.reasons.push("Client chưa được phép sử dụng dịch vụ.");
 if(o.workflow_status==="CANCELLED")result.reasons.push("Đơn đã huỷ.");
 if((o.id&&hasCaseHold(Number(o.id)))||o.workflow_status==="HOLD"||route.warehouse_hold||(o.id&&db.prepare("SELECT id FROM warehouse_order_holds WHERE order_id=? AND released_at IS NULL").get(Number(o.id))))result.reasons.push("Đơn hoặc route đang Hold.");
 result.eligible=!result.reasons.length;
 return {...result,route_id:Number(route.id),pricing_version_id:Number(o.pricing_snapshot_json?o.pricing_version_id:active.price_version_id),pricing_config_version_id:Number(o.pricing_snapshot_json?o.pricing_config_version_id:active.config_version_id)};
}
export function refreshDraft(id:number){
 const o=db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Row;
 if(!o)throw Error("Order không tồn tại.");
 if(o.pricing_snapshot_json||o.purchase_completed_at||["PURCHASED","RECONCILED","CANCELLED"].includes(String(o.workflow_status)))return o;
 const q=orderQuote(o);if(!q)return o;
 db.prepare("UPDATE orders SET est_net_cost=?,base_cost=?,retail=?,sales_price=?,surcharge=?,total_due=?,chargeable_weight=?,dimensional_divisor=5000,gross_profit_base=?,gross_profit_net=?,commission_amount=?,auto_pricing=1,pricing_eligibility_json=? WHERE id=?")
 .run(q.net,q.base,q.retail,q.sale_price,q.surcharge,q.total_charge,q.chargeable_weight,q.gross_profit_base,q.gross_profit_net,q.commission,JSON.stringify({eligible:q.eligible,reasons:q.reasons,volumetric_weight:q.volumetric_weight,tier:q.tier}),id);
 // Draft previews never debit Balance.
 db.prepare("DELETE FROM ledger_entries WHERE entry_type='ORDER_CHARGE' AND reference_type='ORDER' AND reference_id=?").run(String(id));
 return db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Row;
}
export function purchaseService(id:number,actor:{id:number;role:string},requireBalance=true){
 return db.transaction(()=>{
 const o=refreshDraft(id);
 if((actor.role==="CLIENT"&&Number(o.client_user_id)!==actor.id)||(actor.role==="SALES"&&!db.prepare("SELECT id FROM users WHERE id=? AND sales_user_id=?").get(Number(o.client_user_id),actor.id)))throw Error("Không có quyền mua Order này.");
 if(!["CLIENT","ADMIN","SALES"].includes(actor.role))throw Error("Không có quyền mua dịch vụ.");
 if(o.workflow_status==="CANCELLED")throw Error("Đơn đã huỷ.");
 if(o.pricing_snapshot_json)return o; // Idempotent retries do not debit twice.
 if(o.workflow_status==="CANCELLED"||o.purchase_completed_at||["PURCHASED","RECONCILED"].includes(String(o.workflow_status)))throw Error("Đơn đã hoàn tất hoặc đã huỷ.");
 const q=orderQuote(o),route=routeFor(o);
 if(!q)throw Error("Route chưa có bảng giá active.");
 if(actor.role==="CLIENT"&&!route?.client_self_purchase)throw Error("Route chưa cho phép Client tự đặt mua.");
 if(!q.eligible)throw Error("Không đủ điều kiện mua dịch vụ: "+q.reasons.join(" "));
 for(const k of ["order_id","recipient_name","address1","city","state","zip","phone","item","material"])if(!String(o[k]||"").trim())throw Error("Thiếu thông tin bắt buộc: "+k);
 if(requireBalance)assertPurchasing(Number(o.client_user_id),q.total_charge);
 reservePurchase(id,Number(o.client_user_id),q.total_charge,actor.id);
 const stamp=new Date().toISOString();
 db.prepare("UPDATE orders SET pricing_snapshot_json=?,pricing_version_id=?,pricing_config_version_id=?,service_purchased_at=?,workflow_status='PENDING_PURCHASE',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(q),q.pricing_version_id,q.pricing_config_version_id,stamp,id);

 logOrderEvent({orderId:id,eventType:"SERVICE_PURCHASED",summary:"Đặt mua dịch vụ; giá USD đã được khóa.",actorId:actor.id,after:q});
 for(const s of q.surcharge_breakdown)publishPublicNote({orderId:id,eventType:"SURCHARGE_NOTICE",summary:s.note,actorId:actor.id,publicData:{amount:s.amount,currency:"USD",surcharge_type:s.code}});
 return db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Row;
 }).immediate();
}
export function safePricing(o:Row,role:string){
 const q=o.pricing_snapshot_json?JSON.parse(String(o.pricing_snapshot_json)):orderQuote(o);
 if(!q)return null;
 if(o.workflow_status==="CANCELLED"){q.eligible=false;q.reasons=["Đơn đã huỷ."]}
 if(role==="ADMIN")return q;
 if(role==="CLIENT"&&!o.pricing_snapshot_json){
   const route=routeFor(o);
   if(!route?.client_self_purchase)q.reasons.push("Route chưa cho phép Client tự đặt mua.");
   const financial=accountFinancials(Number(o.client_user_id));
   if(financial.purchase_blocked)q.reasons.push(...financial.reasons);
   if(financial.available_to_buy_cents<Math.round(q.total_charge*100))q.reasons.push("Balance / credit không đủ.");
   q.eligible=!q.reasons.length;
 }
 return {eligible:q.eligible,reasons:q.reasons,currency:q.currency,volumetric_weight:q.volumetric_weight,chargeable_weight:q.chargeable_weight,tier:q.tier,discount_percent:q.discount_percent,service_price:usd(q.sale_price),surcharge_breakdown:q.surcharge_breakdown,surcharge:usd(q.surcharge),total_charge:q.total_charge,...(role==="SALES"?{guidance:q.guidance}:{})};
}
export function stripPricingInternals(o:Row){for(const k of ["pricing_snapshot_json","commission_amount","pricing_version_id","pricing_config_version_id"])delete o[k];return o}

export function clientDraftAwaitingPurchase(o:Row){
 return !o.service_purchased_at&&db.prepare("SELECT id FROM users WHERE id=? AND role='CLIENT'").get(Number(o.created_by_user_id||0));
}
export function assertConfiguredPurchase(o:Row){
 if(clientDraftAwaitingPurchase(o))throw Error("Client chưa đặt mua dịch vụ cho Draft này.");
 const q=orderQuote(o);if(q&&!q.eligible)throw Error("Không đủ điều kiện mua dịch vụ: "+q.reasons.join(" "));
}
