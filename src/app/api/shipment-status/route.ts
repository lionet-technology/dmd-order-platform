import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeDateInput } from "@/lib/finance";
import { logOrderEvent } from "@/lib/order-audit";

export const runtime="nodejs";
const STATUSES=new Set(["WAITING_HANDOVER","RECEIVED","IN_TRANSIT","DELIVERED","ALERT","EXCEPTION"]);

export async function GET(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const view=String(req.nextUrl.searchParams.get("view")||"active");
  const q=String(req.nextUrl.searchParams.get("q")||"").trim();
  const service=String(req.nextUrl.searchParams.get("service")||"").trim();
  const where=["ot.status='ACTIVE'","ot.etd_at IS NOT NULL","TRIM(ot.etd_at)<>''"];
  const params:unknown[]=[];
  if(view==="delivered")where.push("ot.shipment_status='DELIVERED'");
  else if(view==="alerts")where.push("ot.shipment_status='ALERT'");
  else if(view==="exceptions")where.push("ot.shipment_status='EXCEPTION'");
  else where.push("ot.shipment_status NOT IN ('DELIVERED','ALERT','EXCEPTION')");
  if(q){const like="%"+q+"%";where.push("(ot.tracking LIKE ? OR o.order_id LIKE ? OR o.system_order_code LIKE ? OR o.customer LIKE ? OR o.recipient_name LIKE ?)");params.push(like,like,like,like,like)}
  if(service){where.push("o.service=?");params.push(service)}
  const sql="SELECT ot.id tracking_id,ot.tracking,ot.label_url,ot.shipment_status,ot.etd_at,ot.delivered_at,"+
    "ot.status_updated_at,o.id order_pk,o.system_order_code,o.order_id,o.service,o.sub_service,o.customer,o.recipient_name "+
    "FROM order_trackings ot JOIN orders o ON o.id=ot.order_id WHERE "+where.join(" AND ")+
    " ORDER BY date(ot.etd_at) ASC,ot.id ASC LIMIT 1000";
  const items=db.prepare(sql).all(...params);
  return NextResponse.json({items,total:items.length,page:1,pageSize:1000,totalPages:1});
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const updates=Array.isArray(body.updates)?body.updates:[body];
    let updated=0;
    const tx=db.transaction(()=>{
      for(const raw of updates){
        const id=Number(raw.tracking_id||0);
        const tracking=String(raw.tracking||"").trim();
        const current=(id
          ? db.prepare("SELECT * FROM order_trackings WHERE id=? AND status='ACTIVE'").get(id)
          : db.prepare("SELECT * FROM order_trackings WHERE normalized_tracking=UPPER(REPLACE(REPLACE(?,' ',''),'-','')) AND status='ACTIVE'").get(tracking)) as Record<string,unknown>|undefined;
        if(!current)throw new Error("Tracking không tồn tại hoặc không còn active.");
        const status=String(raw.shipment_status||current.shipment_status||"WAITING_HANDOVER").toUpperCase();
        if(!STATUSES.has(status))throw new Error("Shipment status không hợp lệ.");
        const etd=raw.etd_at===undefined?current.etd_at:normalizeDateInput(raw.etd_at,"ETD");
        if(!etd)throw new Error("ETD là bắt buộc để đưa Tracking vào màn theo dõi.");
        const delivered=status==="DELIVERED"
          ? (raw.delivered_at?normalizeDateInput(raw.delivered_at,"Ngày Delivered"):String(current.delivered_at||new Date().toISOString().slice(0,10)))
          : null;
        if(delivered&&String(delivered)<String(etd))throw new Error("Ngày Delivered không được trước ETD.");
        db.prepare("UPDATE order_trackings SET shipment_status=?,etd_at=?,delivered_at=?,status_updated_at=CURRENT_TIMESTAMP,status_updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(status,etd,delivered,auth.user.id,Number(current.id));
        logOrderEvent({orderId:Number(current.order_id),eventType:"SHIPMENT_STATUS_UPDATED",summary:"Cập nhật Tracking "+String(current.tracking)+": "+String(current.shipment_status||"WAITING_HANDOVER")+" → "+status+", ETD "+etd+".",actorId:auth.user.id,before:current,after:{shipment_status:status,etd_at:etd,delivered_at:delivered}});
        updated++;
      }
    });
    tx();
    return NextResponse.json({updated});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể cập nhật shipment status"},{status:400})}
}
