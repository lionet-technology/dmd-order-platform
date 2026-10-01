import { NextRequest,NextResponse } from "next/server";
import { canAccessClient,getClientAccount,requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listOrderTrackings,publicOrderTracking } from "@/lib/order-operations";
import { listOrderEvents } from "@/lib/order-audit";

export const runtime="nodejs";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Record<string,unknown>|undefined;
  if(!order)return NextResponse.json({error:"Order không tồn tại."},{status:404});
  if(auth.user.role!=="ADMIN"){
    const client=order.client_user_id?getClientAccount(order.client_user_id):undefined;
    if(!client||!canAccessClient(auth.user,client))return NextResponse.json({error:"Không có quyền xem Order này."},{status:403});
  }
  const trackings=listOrderTrackings(id,auth.user.role==="ADMIN");
  const events=(listOrderEvents(id,auth.user.role==="ADMIN") as Array<Record<string,unknown>>).map(row=>{
    if(auth.user.role==="ADMIN")return row;
    const {before_json,after_json,...safe}=row;void before_json;void after_json;return safe;
  });
  const payload={...order,trackings:auth.user.role==="ADMIN"?trackings:trackings.filter(row=>row.status==="ACTIVE").map(publicOrderTracking),events};
  if(auth.user.role==="ADMIN")return NextResponse.json(payload);
  const safe:Record<string,unknown>={...payload};
  for(const key of ["supplier","est_net_cost","true_net_cost","base_cost","retail","gross_profit_base","gross_profit_net","gross_margin_pct","margin_status","reconciliation_delta","internal_note"])delete safe[key];
  return NextResponse.json(safe);
}
