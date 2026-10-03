import { NextRequest, NextResponse } from "next/server";
import { canAccessClient, getClientAccount, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addOrderTracking, assertOrderOpen, listOrderTrackings, replaceOrderTracking, updateOrderTracking } from "@/lib/order-operations";
import { canonicalEnumValue } from "@/lib/enums";
import { logOrderEvent } from "@/lib/order-audit";
import { ensureOrderShipmentStructure } from "@/lib/order-shipments";

export const runtime="nodejs";

function accessible(user:{id:number;role:string},orderId:number){
  const order=db.prepare("SELECT id,client_user_id,supplier,internal_note,workflow_status,purchase_completed_at,expected_lot_count,carton_count FROM orders WHERE id=?").get(orderId) as {id:number;client_user_id:number|null;supplier:string|null;internal_note:string|null;workflow_status:string;purchase_completed_at:string|null;expected_lot_count:number;carton_count:number}|undefined;
  if(!order)return {error:NextResponse.json({error:"Order không tồn tại."},{status:404})};
  if(user.role!=="ADMIN"){
    const client=order.client_user_id?getClientAccount(order.client_user_id):undefined;
    if(!client||!canAccessClient(user as never,client))return {error:NextResponse.json({error:"Không có quyền xem Order này."},{status:403})};
  }
  return {order};
}

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);const access=accessible(auth.user,id);if(access.error)return access.error;
  const rows=listOrderTrackings(id,auth.user.role==="ADMIN");
  const publicOrder=auth.user.role==="ADMIN"?access.order:{id:access.order?.id,workflow_status:access.order?.workflow_status,purchase_completed_at:access.order?.purchase_completed_at};
  return NextResponse.json({order:publicOrder,trackings:auth.user.role==="ADMIN"?rows:rows.filter(x=>x.status==="ACTIVE").map(({normalized_tracking,cost_match_type,cost_parent_tracking_id,replaced_by_tracking_id,...row})=>row)});
}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const id=Number((await params).id);const access=accessible(auth.user,id);if(access.error)return access.error;
  try{
    const body=await req.json();const action=String(body.action||"save");
    const apply=db.transaction(()=>{
    assertOrderOpen(id);
    if(action==="replace"){
      const old=db.prepare("SELECT tracking,label_url FROM order_trackings WHERE id=? AND order_id=?").get(Number(body.old_tracking_id),id) as {tracking:string;label_url:string|null}|undefined;
      const replacement=replaceOrderTracking({orderId:id,oldTrackingId:Number(body.old_tracking_id),newTracking:body.new_tracking,newLabelUrl:body.new_label_url,reason:body.reason,actorId:auth.user.id});
      const reason=String(body.reason||"").trim();
      logOrderEvent({orderId:id,eventType:"TRACKING_REPLACED",summary:"Đổi Tracking "+String(old?.tracking||"")+" thành "+replacement.tracking+"."+ (reason?" Lý do: "+reason+".":""),actorId:auth.user.id,before:old,after:replacement});
    }else{
      const supplier=body.supplier?canonicalEnumValue("SUPPLIER",String(body.supplier)):String(access.order?.supplier||"");
      const expectedLotCount=Math.max(1,Math.trunc(Number(body.expected_lot_count||access.order?.expected_lot_count||1)));
      db.prepare("UPDATE orders SET supplier=?,internal_note=?,expected_lot_count=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(supplier||null,String(body.internal_note||""),expectedLotCount,auth.user.id,id);
      ensureOrderShipmentStructure(id);
      const cartons=db.prepare("SELECT id FROM order_cartons WHERE order_id=? ORDER BY carton_number").all(id) as Array<{id:number}>;
      const trackingRows=Array.isArray(body.trackings)?body.trackings:[];
      for(let index=0;index<trackingRows.length;index++){
        const raw=trackingRows[index];
        if(!String(raw.tracking||"").trim())continue;
        const cartonId=Number(raw.carton_id||cartons[index]?.id||0)||null;
        if(raw.id)updateOrderTracking({orderId:id,id:Number(raw.id),labelUrl:raw.label_url,lotNumber:raw.lot_number,cartonId,costMatchType:raw.cost_match_type,costParentTrackingId:raw.cost_parent_tracking_id,isPrimary:Boolean(raw.is_primary)});
        else addOrderTracking({orderId:id,tracking:raw.tracking,labelUrl:raw.label_url,lotNumber:raw.lot_number,cartonId,actorId:auth.user.id,costMatchType:raw.cost_match_type,costParentTrackingId:raw.cost_parent_tracking_id});
      }
      const active=(db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=? AND status='ACTIVE'").get(id) as {c:number}).c;
      const complete=Boolean(body.complete);
      const labelled=(db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=? AND status='ACTIVE' AND TRIM(COALESCE(label_url,''))<>''").get(id) as {c:number}).c;
      const cartonCount=Math.max(1,Number(access.order?.carton_count||1));
      if(complete&&(active<cartonCount||labelled<cartonCount))throw new Error("Cần đủ Tracking và Label cho tất cả carton trước khi hoàn tất mua đơn.");
      db.prepare("UPDATE orders SET workflow_status=?,purchase_completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(complete&&active?"PURCHASED":active?"PURCHASING":"PENDING_PURCHASE",complete&&active?new Date().toISOString():null,id);
      logOrderEvent({orderId:id,eventType:"TRACKINGS_UPDATED",summary:"Cập nhật Tracking/Label: "+active+" Tracking active.",actorId:auth.user.id,after:{supplier,active,complete}});
    }
    });
    apply();
    return NextResponse.json({order:db.prepare("SELECT * FROM orders WHERE id=?").get(id),trackings:listOrderTrackings(id,true)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể cập nhật Tracking"},{status:400})}
}
