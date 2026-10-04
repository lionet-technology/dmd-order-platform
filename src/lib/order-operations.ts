import { assertConfiguredPurchase,orderQuote,purchaseService } from "./route-pricing";
import { db } from "./db";
import { trackingReplacementReason } from "./order-rules";
import { logAdminEvent,publishPublicNote } from "./order-audit";
import { syncLotCostsForOrder } from "./order-shipments";

const text=(value:unknown)=>String(value??"").trim();
const money=(value:number)=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

export type TrackingStatus = "ACTIVE" | "REPLACED" | "CANCELLED";
export type CostMatchType = "UNKNOWN" | "DIRECT" | "INCLUDED_IN_PARENT" | "NOT_BILLED" | "MISSING";

export type OrderTracking = {
  id:number; order_id:number; lot_number:number; tracking:string; normalized_tracking:string;
  carton_id:number|null;
  label_url:string|null; status:TrackingStatus; is_primary:number; cost_match_type:CostMatchType;
  cost_parent_tracking_id:number|null; replaced_by_tracking_id:number|null;
  shipment_status:string;etd_at:string|null;delivered_at:string|null;
  status_updated_at:string|null;status_updated_by_user_id:number|null;
  created_at:string; updated_at:string;
};

export function assertOrderOpen(orderId:number){
  const order=db.prepare("SELECT workflow_status FROM orders WHERE id=?").get(orderId) as {workflow_status:string}|undefined;
  if(!order)throw new Error("Order không tồn tại.");
  if(order.workflow_status==="CANCELLED")throw new Error("Đơn đã huỷ; không thể sửa hoặc trả Tracking/Label.");
}

export function normalizeTracking(value:unknown){
  return text(value).toUpperCase().replace(/[\s-]+/g,"");
}

export function listOrderTrackings(orderId:number, includeInactive=true){
  return db.prepare(`SELECT * FROM order_trackings WHERE order_id=? ${includeInactive?"":"AND status='ACTIVE'"} ORDER BY lot_number,is_primary DESC,id`).all(orderId) as OrderTracking[];
}

export function publicOrderTracking(row:OrderTracking){
  const {normalized_tracking,cost_match_type,cost_parent_tracking_id,replaced_by_tracking_id,...visible}=row;
  void normalized_tracking;void cost_match_type;void cost_parent_tracking_id;void replaced_by_tracking_id;
  return visible;
}

export function appendOrderNote(orderId:number, message:string, internal=false){
  const clean=text(message); if(!clean)return;
  if(!internal)throw new Error("Note công khai phải dùng publishPublicNote() và event type trong allowlist.");
  const column="internal_note";
  const stamp=new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date());
  db.prepare(`UPDATE orders SET ${column}=CASE WHEN COALESCE(${column},'')='' THEN ? ELSE ${column}||char(10)||char(10)||? END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(`[${stamp}] ${clean}`,`[${stamp}] ${clean}`,orderId);
}

function syncLegacyPrimary(orderId:number){
  const primary=db.prepare("SELECT tracking,label_url FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY is_primary DESC,lot_number,id LIMIT 1").get(orderId) as {tracking:string;label_url:string|null}|undefined;
  db.prepare("UPDATE orders SET tracking=?,label=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(primary?.tracking||null,primary?.label_url||null,orderId);
}

function addOrderTrackingRaw(input:{orderId:number;tracking:unknown;labelUrl?:unknown;lotNumber?:unknown;cartonId?:number|null;actorId?:number|null;isPrimary?:boolean;costMatchType?:CostMatchType;costParentTrackingId?:number|null}){
  assertOrderOpen(input.orderId);
  const tracking=text(input.tracking); const normalized=normalizeTracking(tracking);
  if(!normalized)throw new Error("Tracking là bắt buộc.");
  const duplicate=db.prepare("SELECT order_id FROM order_trackings WHERE normalized_tracking=?").get(normalized) as {order_id:number}|undefined;
  if(duplicate)throw new Error(duplicate.order_id===input.orderId?"Tracking đã có trong Order này.":"Tracking đã thuộc một Order khác.");
  const carton=input.cartonId?db.prepare("SELECT c.id,l.lot_number FROM order_cartons c LEFT JOIN order_lots l ON l.id=c.order_lot_id WHERE c.id=? AND c.order_id=?").get(input.cartonId,input.orderId) as {id:number;lot_number:number|null}|undefined:undefined;
  if(input.cartonId&&!carton)throw new Error("Carton không thuộc Order này.");
  const lot=Math.max(1,Math.trunc(Number(carton?.lot_number||input.lotNumber||1))||1);
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(input.orderId) as Record<string,unknown>;
  assertConfiguredPurchase(order);
  if(!order.pricing_snapshot_json&&orderQuote(order))purchaseService(input.orderId,{id:input.actorId||0,role:"ADMIN"},false);
  const hasPrimary=(db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=? AND status='ACTIVE' AND is_primary=1").get(input.orderId) as {c:number}).c>0;
  const result=db.prepare(`INSERT INTO order_trackings(order_id,lot_number,carton_id,tracking,normalized_tracking,label_url,is_primary,cost_match_type,cost_parent_tracking_id,created_by_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(input.orderId,lot,carton?.id||null,tracking,normalized,text(input.labelUrl)||null,input.isPrimary||!hasPrimary?1:0,input.costMatchType||"UNKNOWN",input.costParentTrackingId||null,input.actorId||null);
  syncLegacyPrimary(input.orderId);
  matchSupplierCostsForOrder(input.orderId);
  return db.prepare("SELECT * FROM order_trackings WHERE id=?").get(result.lastInsertRowid) as OrderTracking;
}

export function addOrderTracking(input:Parameters<typeof addOrderTrackingRaw>[0]){
  return db.transaction(()=>addOrderTrackingRaw(input)).immediate();
}

export function updateOrderTracking(input:{orderId:number;id:number;labelUrl?:unknown;lotNumber?:unknown;cartonId?:number|null;costMatchType?:CostMatchType;costParentTrackingId?:number|null;isPrimary?:boolean}){
  assertOrderOpen(input.orderId);
  const row=db.prepare("SELECT * FROM order_trackings WHERE id=? AND order_id=?").get(input.id,input.orderId) as OrderTracking|undefined;
  if(!row)throw new Error("Tracking không thuộc Order này.");
  const carton=input.cartonId?db.prepare("SELECT c.id,l.lot_number FROM order_cartons c LEFT JOIN order_lots l ON l.id=c.order_lot_id WHERE c.id=? AND c.order_id=?").get(input.cartonId,input.orderId) as {id:number;lot_number:number|null}|undefined:undefined;
  if(input.cartonId&&!carton)throw new Error("Carton không thuộc Order này.");
  const lot=carton?.lot_number||(
    input.lotNumber===undefined?row.lot_number:Math.max(1,Math.trunc(Number(input.lotNumber)||1))
  );
  const match=input.costMatchType||row.cost_match_type;
  const parent=match==="INCLUDED_IN_PARENT"?Number(input.costParentTrackingId||0)||null:null;
  if(parent){
    const valid=db.prepare("SELECT id FROM order_trackings WHERE id=? AND order_id=?").get(parent,input.orderId);
    if(!valid)throw new Error("Tracking gánh chi phí không thuộc Order này.");
  }
  if(input.isPrimary)db.prepare("UPDATE order_trackings SET is_primary=0 WHERE order_id=?").run(input.orderId);
  db.prepare("UPDATE order_trackings SET lot_number=?,carton_id=?,label_url=?,cost_match_type=?,cost_parent_tracking_id=?,is_primary=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(lot,input.cartonId===undefined?row.carton_id:carton?.id||null,input.labelUrl===undefined?row.label_url:text(input.labelUrl)||null,match,parent,input.isPrimary?1:row.is_primary,row.id);
  syncLegacyPrimary(input.orderId);
  recomputeOrderFinancials(input.orderId);
}

export function replaceOrderTracking(input:{orderId:number;oldTrackingId:number;newTracking:unknown;newLabelUrl?:unknown;reason?:unknown;actorId?:number|null}){
  assertOrderOpen(input.orderId);
  const old=db.prepare("SELECT * FROM order_trackings WHERE id=? AND order_id=? AND status='ACTIVE'").get(input.oldTrackingId,input.orderId) as OrderTracking|undefined;
  if(!old)throw new Error("Tracking cũ không hợp lệ hoặc đã được thay thế.");
  trackingReplacementReason(input.reason);
  const created=addOrderTracking({orderId:input.orderId,tracking:input.newTracking,labelUrl:input.newLabelUrl,lotNumber:old.lot_number,cartonId:old.carton_id,actorId:input.actorId,isPrimary:Boolean(old.is_primary),costMatchType:old.cost_match_type,costParentTrackingId:old.cost_parent_tracking_id});
  db.prepare("UPDATE order_trackings SET status='REPLACED',is_primary=0,replaced_by_tracking_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(created.id,old.id);
  db.prepare("UPDATE order_trackings SET cost_parent_tracking_id=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND cost_parent_tracking_id=?").run(created.id,input.orderId,old.id);
  syncLegacyPrimary(input.orderId);
  publishPublicNote({orderId:input.orderId,eventType:"TRACKING_LABEL_CHANGED",summary:`Tracking ${old.tracking} đã được thay thế bằng ${created.tracking}. Label đã được cập nhật.`,actorId:input.actorId,publicData:{old_tracking:old.tracking,new_tracking:created.tracking,label_updated:Boolean(text(input.newLabelUrl))}});
  matchSupplierCostsForOrder(input.orderId);
  return created;
}

export function matchSupplierCostsForOrder(orderId:number){
  db.prepare(`UPDATE supplier_costs SET
    matched_order_id=?,
    matched_order_tracking_id=(SELECT ot.id FROM order_trackings ot WHERE ot.order_id=? AND ot.normalized_tracking=supplier_costs.normalized_tracking LIMIT 1)
    WHERE normalized_tracking IN (SELECT normalized_tracking FROM order_trackings WHERE order_id=?)`).run(orderId,orderId,orderId);
  const unaudited=db.prepare(`SELECT id,tracking,occurred_at,created_at,total_net_cost,extra_surcharge,import_tax,surcharge_type,note,supplier,service,sub_service
    FROM supplier_costs WHERE matched_order_id=? AND audit_recorded_at IS NULL ORDER BY id`).all(orderId) as Array<Record<string,unknown>>;
  for(const cost of unaudited){
    logAdminEvent({orderId,eventType:"SUPPLIER_COST_MATCHED",summary:`Supplier Cost đã khớp Tracking ${String(cost.tracking)}.`,after:cost});
    db.prepare("UPDATE supplier_costs SET audit_recorded_at=CURRENT_TIMESTAMP WHERE id=?").run(cost.id);
  }
  const pending=db.prepare(`SELECT id,tracking,occurred_at,created_at,total_net_cost,extra_surcharge,import_tax,surcharge_type,note
    FROM supplier_costs WHERE matched_order_id=? AND public_note_recorded_at IS NULL AND (extra_surcharge<>0 OR import_tax<>0) ORDER BY id`).all(orderId) as Array<Record<string,unknown>>;
  for(const cost of pending){
    const raw=String(cost.occurred_at||cost.created_at||"");
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date=match?`${match[3]}/${match[2]}/${match[1]}`:new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
    const parts:string[]=[];
    if(Number(cost.import_tax||0))parts.push(`phát sinh thuế nhập khẩu ${money(Number(cost.import_tax))} USD`);
    if(Number(cost.extra_surcharge||0))parts.push(`phát sinh phụ phí ${money(Number(cost.extra_surcharge))} USD (${String(cost.surcharge_type||"phụ phí bổ sung").trim()})`);
    if(Number(cost.import_tax||0))publishPublicNote({orderId,eventType:"TAX_NOTICE",summary:`Ngày ${date}, Tracking ${String(cost.tracking)} phát sinh thuế nhập khẩu ${money(Number(cost.import_tax))} USD.`,publicData:{tracking:String(cost.tracking),amount:money(Number(cost.import_tax)),currency:"USD"}});
    if(Number(cost.extra_surcharge||0))publishPublicNote({orderId,eventType:"SURCHARGE_NOTICE",summary:`Ngày ${date}, Tracking ${String(cost.tracking)} phát sinh phụ phí ${money(Number(cost.extra_surcharge))} USD (${String(cost.surcharge_type||"phụ phí bổ sung").trim()}).`,publicData:{tracking:String(cost.tracking),amount:money(Number(cost.extra_surcharge)),currency:"USD",surcharge_type:String(cost.surcharge_type||"phụ phí bổ sung")}});
    db.prepare("UPDATE supplier_costs SET public_note_recorded_at=CURRENT_TIMESTAMP WHERE id=?").run(cost.id);
  }
  syncLotCostsForOrder(orderId);
  return recomputeOrderFinancials(orderId);
}

export function findTrackingOwner(tracking:unknown){
  return db.prepare("SELECT ot.*,o.client_user_id FROM order_trackings ot JOIN orders o ON o.id=ot.order_id WHERE ot.normalized_tracking=? LIMIT 1").get(normalizeTracking(tracking)) as (OrderTracking&{client_user_id:number|null})|undefined;
}

export function recomputeOrderFinancials(orderId:number){
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Record<string,unknown>|undefined;
  if(!order)return null;
  // Reconciliation for versioned purchases is deferred; keep their snapshot/charge intact.
  if(order.pricing_snapshot_json || (order.pricing_eligibility_json && !order.service_purchased_at))return order;
  const totals=db.prepare(`SELECT COUNT(*) rows_count,COALESCE(SUM(total_net_cost),0) true_net_cost,COALESCE(SUM(extra_surcharge),0) extra_surcharge,COALESCE(SUM(import_tax),0) import_tax
    FROM supplier_costs WHERE matched_order_id=?`).get(orderId) as {rows_count:number;true_net_cost:number;extra_surcharge:number;import_tax:number};
  const salesPrice=Number(order.sales_price||0); const baseSurcharge=Number(order.surcharge||0); const baseTax=Number(order.import_tax||0);
  const cancelled=order.workflow_status==="CANCELLED";
  const totalDue=cancelled?Number(order.total_due||0):money(salesPrice+baseSurcharge+totals.extra_surcharge+baseTax+totals.import_tax);
  const est=Number(order.est_net_cost||0); const trueNet=money(totals.true_net_cost); const delta=money(trueNet-est);
  const revenue=cancelled?totalDue:salesPrice;
  const gross=money(revenue-trueNet); const margin=revenue>0?money((gross/revenue)*100):0;
  db.prepare(`UPDATE orders SET true_net_cost=?,extra_surcharge=?,extra_import_tax=?,total_due=?,gross_profit_net=?,gross_margin_pct=?,margin_status=?,reconciliation_delta=?,reconciliation_status=?,charge_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(totals.rows_count?trueNet:null,money(totals.extra_surcharge),money(totals.import_tax),totalDue,gross,margin,salesPrice>0&&margin<15?"LOW_MARGIN":"OK",totals.rows_count?delta:null,totals.rows_count?(trueNet<=est?"PASS":"REVIEW"):"PENDING",totals.rows_count?"IMPORTED":"PENDING",orderId);
  const ref=String(orderId);
  if(!cancelled&&totalDue>0)db.prepare(`INSERT INTO ledger_entries(occurred_at,entry_type,direction,amount,customer,client_user_id,reference_type,reference_id,note)
    VALUES (?,'ORDER_CHARGE','DEBIT',?,?,?,'ORDER',?,'Auto from Order total')
    ON CONFLICT(entry_type,reference_type,reference_id) WHERE reference_id IS NOT NULL AND entry_type='ORDER_CHARGE'
    DO UPDATE SET occurred_at=excluded.occurred_at,amount=excluded.amount,customer=excluded.customer,client_user_id=excluded.client_user_id`).run(order.created_at||null,totalDue,order.customer||null,order.client_user_id||null,ref);
  return db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
}
