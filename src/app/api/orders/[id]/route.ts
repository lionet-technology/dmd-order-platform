import { refreshDraft,safePricing,stripPricingInternals } from "@/lib/route-pricing";
import { NextRequest,NextResponse } from "next/server";
import { canAccessClient,getClientAccount,requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listOrderTrackings,publicOrderTracking } from "@/lib/order-operations";
import { publicNoteText,sanitizePrivateNoteForSales } from "@/lib/order-audit";
import {orderTimeline} from "@/lib/order-timeline";
import { cancellationPolicy } from "@/lib/order-cancellation";

export const runtime="nodejs";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  const found=db.prepare("SELECT id FROM orders WHERE id=?").get(id);
  const order=found?refreshDraft(id):undefined;
  if(!order)return NextResponse.json({error:"Order không tồn tại."},{status:404});
  if(auth.user.role!=="ADMIN"){
    const client=order.client_user_id?getClientAccount(order.client_user_id):undefined;
    if(!client||!canAccessClient(auth.user,client))return NextResponse.json({error:"Không có quyền xem Order này."},{status:403});
  }
  const trackings=listOrderTrackings(id,auth.user.role==="ADMIN"||order.workflow_status==="CANCELLED");
  const events=orderTimeline(id,auth.user.role);
  const payload={...order,pricing:safePricing(order,auth.user.role),cancellation:cancellationPolicy(order as Record<string,unknown>&{id:number}),trackings:auth.user.role==="ADMIN"?trackings:trackings.filter(row=>row.status==="ACTIVE"||(order.workflow_status==="CANCELLED"&&row.status==="CANCELLED")).map(publicOrderTracking),events};
  if(auth.user.role==="ADMIN")return NextResponse.json(payload);
  const safe:Record<string,unknown>=stripPricingInternals({...payload});
  safe.public_note=publicNoteText(id);
  delete safe.note;
  for(const key of ["supplier","est_net_cost","true_net_cost","base_cost","retail","gross_profit_base","gross_profit_net","gross_margin_pct","margin_status","reconciliation_delta"])delete safe[key];
  if(auth.user.role==="CLIENT")for(const key of ["internal_note","discount_note","discount_source"])delete safe[key];
  else safe.internal_note=sanitizePrivateNoteForSales(order.internal_note,order.supplier);
  return NextResponse.json(safe);
}
