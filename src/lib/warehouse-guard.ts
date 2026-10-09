import {resolveRoute} from "./routes";
import {canWarehouseOutbound} from "./order-transition-guards";
import {hasCaseHold} from "./cases";
import {db} from "./db";
type Row=Record<string,unknown>;
export type WarehouseReason="ROUTE_MISMATCH"|"ORDER_CANCELLED"|"ORDER_HOLD"|"ROUTE_HOLD"|"SEGMENT_MISMATCH"|"ADMIN_VIOLATION"|"RULE_UNAVAILABLE";
export type GuardResult={decision:"ALLOW"}|{decision:"BLOCK";reason_code:WarehouseReason;message:string};
export type SegmentEvaluator=(order:Row,config:Row)=>string|null;
const evaluators=new Map<string,SegmentEvaluator>();
export function registerWarehouseSegmentEvaluator(key:string,evaluate:SegmentEvaluator){evaluators.set(key,evaluate)}
export class WarehouseBlock extends Error {
  constructor(public reason_code:WarehouseReason,message:string){super(message)}
}
export function warehouseGuard(order:Row,carton:Row):GuardResult {
 const block=(reason_code:WarehouseReason,message:string):GuardResult=>({decision:"BLOCK",reason_code,message});
 if(!carton.route_config_id)return block("ROUTE_MISMATCH","Thùng chưa gắn full route.");
 const current=db.prepare("SELECT * FROM orders WHERE id=?").get(order.order_id) as Row|undefined;
 if(!current)return block("ROUTE_MISMATCH","Không tìm thấy Order.");
 const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(carton.route_config_id) as Row|undefined;
 let orderRoute:Row;try{orderRoute=resolveRoute(current)}catch{return block("ROUTE_MISMATCH","Route lịch sử chưa được xác định duy nhất.")}
 if(!route||Number(route.id)!==Number(orderRoute.id))return block("ROUTE_MISMATCH","Thùng chỉ nhận đúng Service / Sub-Service / Supplier của route.");
 if(current.workflow_status==="CANCELLED")return block("ORDER_CANCELLED","Order đã hủy.");
 if(hasCaseHold(Number(order.order_id))||current.workflow_status==="HOLD"||db.prepare("SELECT id FROM warehouse_order_holds WHERE order_id=? AND released_at IS NULL").get(order.order_id))return block("ORDER_HOLD","Order đang bị hold từ Client / Sales / Admin.");
 const state=canWarehouseOutbound(current);if(!state.allowed)return block("ADMIN_VIOLATION",state.reason);
 if(route.warehouse_hold)return block("ROUTE_HOLD","Admin đang hold toàn route.");
 if(route.segmentation_enabled){
  const rules=db.prepare("SELECT * FROM warehouse_routing_rules WHERE route_config_id=? AND active=1 ORDER BY priority DESC,id").all(route.id) as Row[];
  for(const rule of rules){
   const evaluate=evaluators.get(String(rule.evaluator_key));
   if(!evaluate)continue;
   let config:Row;
   try{config=JSON.parse(String(rule.config_json));}catch{continue}
   if(!config||typeof config!=="object"||Array.isArray(config))continue;
   const segment=evaluate({...order,...current,order_id:order.order_id},config);
   // First concrete result wins; unimplemented or unresolved rules never require a segment.
   if(typeof segment!=="string"||!segment.trim())continue;
   if(carton.segment_key&&segment!==carton.segment_key)return block("SEGMENT_MISMATCH","Đơn không thuộc phân vùng của thùng.");
   break;
  }
 }
 return {decision:"ALLOW"};
}
export function enforceWarehouseGuard(order:Row,carton:Row){const result=warehouseGuard(order,carton);if(result.decision==="BLOCK")throw new WarehouseBlock(result.reason_code,result.message)}
