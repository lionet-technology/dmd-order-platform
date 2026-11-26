import {clientVisibleWorkflowStatus} from "@/lib/emergency-hold";
import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { refreshDraft,safePricing,stripPricingInternals } from "@/lib/route-pricing";
import { NextRequest,NextResponse } from "next/server";
import { canAccessClient,getClientAccount,requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listOrderTrackings,publicOrderTracking } from "@/lib/order-operations";
import { publicNoteText,sanitizePrivateNoteForSales } from "@/lib/order-audit";
import {orderTimeline} from "@/lib/order-timeline";
import { sumVnd } from "@/lib/vnd-money";
import { cancellationPolicy } from "@/lib/order-cancellation";

export const runtime="nodejs";

async function handleGET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Order không tồn tại."},{status:404});
  const found=db.prepare("SELECT id,client_user_id FROM orders WHERE id=?").get(id) as {id:number;client_user_id:number|null}|undefined;
  if(!found)return NextResponse.json({error:"Order không tồn tại."},{status:404});
  if(auth.user.role!=="ADMIN"){
    const client=found.client_user_id?getClientAccount(found.client_user_id):undefined;
    if(!client||!canAccessClient(auth.user,client))return NextResponse.json({error:"Không có quyền xem Order này."},{status:403});
  }
  // Draft refresh writes pricing and removes stale charges; authorize before it runs.
  const order=refreshDraft(id);
  const trackings=listOrderTrackings(id,auth.user.role==="ADMIN"||order.workflow_status==="CANCELLED");
  const events=orderTimeline(id,auth.user.role);
  const pricing=safePricing(order,auth.user.role);
  const vndEntries=pricing?.currency==="VND"?db.prepare(`
    SELECT id,kind,delta FROM vnd_ledger
    WHERE order_id=? AND client_id=?
      AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX','CANCELLATION_REFUND')
    ORDER BY id
  `).all(id,found.client_user_id) as {id:number;kind:string;delta:string}[]:null;
  const vndRefund=vndEntries===null?null:sumVnd(vndEntries.filter(e=>e.kind==="CANCELLATION_REFUND").map(e=>e.delta));
  const payload={...order,pricing,vnd_entries:vndEntries,vnd_cancellation_refund:vndRefund,cancellation:cancellationPolicy(order as Record<string,unknown>&{id:number}),trackings:auth.user.role==="ADMIN"?trackings:trackings.filter(row=>row.status==="ACTIVE"||(order.workflow_status==="CANCELLED"&&row.status==="CANCELLED")).map(publicOrderTracking),events};
  if(auth.user.role==="ADMIN")return NextResponse.json(payload);
  const safe:Record<string,unknown>=stripPricingInternals({...payload});
  if(auth.user.role==="CLIENT"||auth.user.role==="SALES")safe.workflow_status=clientVisibleWorkflowStatus(id);
  safe.public_note=publicNoteText(id);
  delete safe.note;
  for(const key of ["supplier","est_net_cost","true_net_cost","base_cost","retail","gross_profit_base","gross_profit_net","gross_margin_pct","margin_status","reconciliation_delta"])delete safe[key];
  if(auth.user.role==="CLIENT")for(const key of ["internal_note","discount_note","discount_source"])delete safe[key];
  else safe.internal_note=sanitizePrivateNoteForSales(order.internal_note,order.supplier);
  return NextResponse.json(safe);
}

export const GET=withFinancialPrivacy(handleGET);
