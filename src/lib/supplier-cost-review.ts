import type {AuthUser} from "./auth";
import {db} from "./db";
import {logAdminEvent} from "./order-audit";
import {findTrackingOwner,linkSupplierCostsForOrder,normalizeTracking} from "./order-operations";
import {reconcileLots} from "./reconciliation";
import {moneyCommand} from "./money-command";

type Row=Record<string,unknown>;
type Adjustment={trackingId:number;lotId:number;amountCents:number;reason:string};

function requireCostReviewer(user:AuthUser){
  if(user.role!=="ADMIN"&&user.role!=="FINANCE")throw Error("Chỉ Admin/Finance được xử lý Supplier Cost.");
}

export function reviewSupplierCost(user:AuthUser,input:Row){
  requireCostReviewer(user);
  const {id,decision,previous_ids}=input;
  if(!Number.isSafeInteger(id)||(decision!=="KEEP_OLD"&&decision!=="ACCEPT_NEW")||typeof previous_ids!=="string"){
    throw Error("Quyết định xử lý Supplier Cost không hợp lệ.");
  }
  return db.transaction(()=>{
    const candidate=db.prepare("SELECT * FROM supplier_costs WHERE id=?").get(id) as Row|undefined;
    if(!candidate)throw Error("Không tìm thấy Supplier Cost.");
    const status=decision==="KEEP_OLD"?"DISCARDED":"ACTIVE";
    if(candidate.import_status!=="PENDING"){
      const resolvedStatus=candidate.import_status==="REPLACED"?"ACTIVE":candidate.import_status;
      if(candidate.resolved_at&&resolvedStatus===status)return {id,import_status:candidate.import_status};
      throw Error("Dòng này đã được xử lý.");
    }
    const previous=db.prepare("SELECT * FROM supplier_costs WHERE normalized_tracking=? AND import_status='ACTIVE' ORDER BY id").all(candidate.normalized_tracking) as Row[];
    if(previous.map(row=>row.id).join(",")!==previous_ids)throw Error("Giá hiện tại đã đổi. Tải lại danh sách trước khi xử lý.");
    const owner=findTrackingOwner(candidate.tracking);
    if(decision==="ACCEPT_NEW"){
      if(owner&&db.prepare("SELECT 1 FROM lot_cost_components c JOIN order_lots l ON l.id=c.lot_id WHERE l.order_id=? LIMIT 1").get(owner.order_id)){
        throw Error("Order dùng component; cần mapping supplier component trước khi thay giá.");
      }
      db.prepare(`UPDATE supplier_costs SET import_status='REPLACED',replaced_by_cost_id=?
        WHERE normalized_tracking=? AND import_status='ACTIVE'`).run(id,candidate.normalized_tracking);
    }
    db.prepare("UPDATE supplier_costs SET import_status=?,resolved_by_user_id=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?").run(status,user.id,id);
    if(owner){
      if(decision==="ACCEPT_NEW"){
        linkSupplierCostsForOrder(owner.order_id);
        reconcileLots(owner.order_id);
      }
      logAdminEvent({orderId:owner.order_id,actorId:user.id,eventType:"SUPPLIER_COST_DUPLICATE_RESOLVED",
        summary:`Tracking ${candidate.tracking}: ${decision==="KEEP_OLD"?"Giữ giá cũ":"Nhận giá mới"}.`,
        before:previous,after:{...candidate,import_status:status}});
    }
    return {id,import_status:status};
  }).immediate();
}

function locateAdjustment(row:Row):Adjustment{
  const tracking=normalizeTracking(typeof row.tracking==="string"?row.tracking:"");
  const reason=typeof row.reason==="string"?row.reason.trim().replace(/\s+/g," "):"";
  const raw=typeof row.amount==="number"||typeof row.amount==="string"?String(row.amount).trim():"";
  const amountCents=Math.round(Number(raw)*100);
  if(!tracking||!reason||reason.length>1000||!/^\d+(\.\d{1,2})?$/.test(raw)||amountCents<1||amountCents>1e11){
    throw Error("Cần Tracking, Cost bổ sung USD > 0 (tối đa hai số lẻ) và Lý do.");
  }
  const owner=findTrackingOwner(tracking);
  if(!owner)throw Error("Không tìm thấy Tracking.");
  const lot=db.prepare(`SELECT l.id FROM order_trackings t LEFT JOIN order_cartons c ON c.id=t.carton_id
    JOIN order_lots l ON l.order_id=t.order_id AND l.id=COALESCE(c.order_lot_id,
      (SELECT id FROM order_lots WHERE order_id=t.order_id AND lot_number=t.lot_number))
    WHERE t.id=?`).get(owner.id) as {id:number}|undefined;
  if(!lot)throw Error("Tracking chưa được ghép Lot.");
  return {trackingId:owner.id,lotId:lot.id,amountCents,reason};
}

function recordAdjustment(user:AuthUser,adjustment:Adjustment,duplicateOf?:number){
  const {lotId,trackingId,amountCents,reason}=adjustment;
  const owner=db.prepare("SELECT t.tracking,l.order_id FROM order_trackings t JOIN order_lots l ON l.order_id=t.order_id WHERE t.id=? AND l.id=?").get(trackingId,lotId) as {tracking:string;order_id:number}|undefined;
  if(!owner||locateAdjustment({tracking:owner.tracking,amount:amountCents/100,reason}).lotId!==lotId)throw Error("Lot của Tracking đã thay đổi. Nhập lại phụ phí.");
  const before=reconcileLots(owner.order_id).find(lot=>lot.id===lotId);
  if(before?.actual_cents==null)throw Error("Lot chưa có Actual Cost để cộng phụ phí.");
  const id=Number(db.prepare("INSERT INTO lot_cost_adjustments(lot_id,tracking_id,delta_cents,reason,actor_id) VALUES (?,?,?,?,?)").run(lotId,trackingId,amountCents,reason,user.id).lastInsertRowid);
  const after=reconcileLots(owner.order_id).find(lot=>lot.id===lotId);
  logAdminEvent({orderId:owner.order_id,actorId:user.id,eventType:"SUPPLIER_COST_ADJUSTMENT",
    summary:`Ghi phụ phí Supplier theo Tracking ${owner.tracking}.`,
    before:{actual_cents:before.actual_cents},after:{id,trackingId,lotId,amountCents,reason,duplicateOf,actual_cents:after?.actual_cents}});
  return id;
}

export function submitSupplierAdjustments(user:AuthUser,key:unknown,items:unknown){
  requireCostReviewer(user);
  if(typeof key!=="string"||!key.trim())throw Error("Cần request_key cho batch phụ phí.");
  if(!Array.isArray(items)||items.length<1||items.length>200)throw Error("Nhập từ 1 đến 200 dòng phụ phí.");
  return moneyCommand("supplier-cost-adjustments",key,{actor_id:user.id,items},()=>{
    const results=items.map((row,index)=>{
      try{
        const adjustment=locateAdjustment(row);
        const {trackingId,lotId,amountCents,reason}=adjustment;
        const duplicate=db.prepare("SELECT id FROM lot_cost_adjustments WHERE tracking_id=? AND delta_cents=? AND reason=? ORDER BY id LIMIT 1").get(trackingId,amountCents,reason) as {id:number}|undefined;
        if(!duplicate)return {status:"RECORDED",id:recordAdjustment(user,adjustment)};
        const id=Number(db.prepare(`INSERT INTO supplier_cost_adjustment_pending
          (tracking_id,lot_id,amount_cents,reason,duplicate_of,created_by_user_id) VALUES (?,?,?,?,?,?)`)
          .run(trackingId,lotId,amountCents,reason,duplicate.id,user.id).lastInsertRowid);
        return {status:"PENDING",id};
      }catch(error){
        throw Error(`Dòng ${index+1}: ${error instanceof Error?error.message:"Không thể ghi phụ phí."}`);
      }
    });
    return {results};
  });
}

export function resolveSupplierAdjustment(user:AuthUser,input:Row){
  requireCostReviewer(user);
  const {id,decision}=input;
  if(!Number.isSafeInteger(id)||(decision!=="RECORD_AGAIN"&&decision!=="SKIP"))throw Error("Quyết định phụ phí không hợp lệ.");
  return db.transaction(()=>{
    const pending=db.prepare(`SELECT tracking_id trackingId,lot_id lotId,amount_cents amountCents,
      reason,duplicate_of,resolved_at,recorded_adjustment_id FROM supplier_cost_adjustment_pending WHERE id=?`).get(id) as
      (Adjustment&{duplicate_of:number;resolved_at:string|null;recorded_adjustment_id:number|null})|undefined;
    if(!pending)throw Error("Không tìm thấy phụ phí chờ xác nhận.");
    const record=decision==="RECORD_AGAIN";
    if(pending.resolved_at){
      if(record!==Boolean(pending.recorded_adjustment_id))throw Error("Dòng này đã được xử lý.");
      return {id,recorded_adjustment_id:pending.recorded_adjustment_id};
    }
    const recordedId=record?recordAdjustment(user,pending,pending.duplicate_of):null;
    db.prepare("UPDATE supplier_cost_adjustment_pending SET resolved_at=CURRENT_TIMESTAMP,resolved_by_user_id=?,recorded_adjustment_id=? WHERE id=?").run(user.id,recordedId,id);
    return {id,recorded_adjustment_id:recordedId};
  }).immediate();
}
