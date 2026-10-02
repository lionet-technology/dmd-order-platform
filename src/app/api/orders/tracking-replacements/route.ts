import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findTrackingOwner,replaceOrderTracking } from "@/lib/order-operations";
import { logOrderEvent } from "@/lib/order-audit";

export const runtime="nodejs";

function inspect(raw:Record<string,unknown>){
  const oldTracking=String(raw.old_tracking||"").trim();
  const owner=oldTracking?findTrackingOwner(oldTracking):undefined;
  if(!oldTracking)return {...raw,error:"Thiếu Tracking cũ."};
  if(!owner)return {...raw,error:"Không tìm thấy Tracking cũ."};
  if(owner.status!=="ACTIVE")return {...raw,error:"Tracking cũ không còn active."};
  const order=db.prepare("SELECT system_order_code,order_id,customer,recipient_name,service,sub_service FROM orders WHERE id=?").get(owner.order_id) as Record<string,unknown>;
  return {...raw,tracking_id:owner.id,order_pk:owner.order_id,...order,error:""};
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const rows=(Array.isArray(body.rows)?body.rows:[]).map((row:Record<string,unknown>)=>inspect(row));
    if(body.preview)return NextResponse.json({rows});
    const errors=rows.filter((row:Record<string,unknown>)=>row.error||!String(row.new_tracking||"").trim());
    if(errors.length)return NextResponse.json({error:"Có dòng chưa hợp lệ.",rows},{status:400});
    let updated=0;
    const apply=db.transaction(()=>{
    for(const row of rows as Array<Record<string,unknown>>){
      const before=db.prepare("SELECT * FROM order_trackings WHERE id=?").get(Number(row.tracking_id));
      const replacement=replaceOrderTracking({orderId:Number(row.order_pk),oldTrackingId:Number(row.tracking_id),newTracking:row.new_tracking,newLabelUrl:row.new_label_url,reason:row.reason,actorId:auth.user.id});
      const reason=String(row.reason||"").trim();
      logOrderEvent({orderId:Number(row.order_pk),eventType:"TRACKING_REPLACED",summary:"Đổi Tracking "+String(row.old_tracking)+" thành "+replacement.tracking+"."+(reason?" Lý do: "+reason+".":""),actorId:auth.user.id,before,after:replacement,source:"BULK"});
      updated++;
    }
    });
    apply();
    return NextResponse.json({updated});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể đổi Tracking"},{status:400})}
}
