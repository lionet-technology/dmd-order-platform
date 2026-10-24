import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { NextRequest, NextResponse } from "next/server";
import { requireFinance } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { reconciliationAction } from "@/lib/reconciliation";
export const runtime = "nodejs";
async function handleGET(req:NextRequest) {
  const auth=requireFinance(req); if(auth.error)return auth.error;
  if(req.nextUrl.searchParams.has("history_lot_id")){
    const id=Number(req.nextUrl.searchParams.get("history_lot_id"));if(!Number.isInteger(id)||id<1)return NextResponse.json({error:"Lot ID không hợp lệ"},{status:400});
    return NextResponse.json({items:db.prepare("SELECT * FROM lot_reconciliation_versions WHERE lot_id=? ORDER BY id DESC").all(id)});
  }
  if(req.nextUrl.searchParams.get("granularity")==="lot"){
    return NextResponse.json({items:db.prepare(`SELECT l.*,o.order_id order_reference,o.system_order_code,o.service,o.sub_service,o.supplier,o.customer,o.actual_cost_coverage,o.effective_net_cost,v.cost_snapshot_json,v.estimated_cents,v.actual_cents,v.status reconciliation_status,v.decision,v.reason,v.id reconciliation_version,(SELECT json_group_array(DISTINCT sc.supplier) FROM supplier_costs sc WHERE sc.order_lot_id=l.id) cost_suppliers_json,(SELECT json_group_array(DISTINCT ep.old_supplier) FROM emergency_switch_cost_pending ep WHERE ep.order_id=o.id AND ep.lot_number=l.lot_number) old_suppliers_json,(SELECT json_group_array(DISTINCT json_extract(eh.snapshot_json,'$.supplier')) FROM emergency_hold_orders eh WHERE eh.order_id=o.id AND eh.resolved_at IS NOT NULL) historical_suppliers_json FROM order_lots l JOIN orders o ON o.id=l.order_id LEFT JOIN lot_reconciliation_versions v ON v.id=(SELECT MAX(id) FROM lot_reconciliation_versions WHERE lot_id=l.id) ORDER BY o.id,l.lot_number`).all()});
  }
  const {page,pageSize,q,offset}=pageParams(req);
  const where=["(true_net_cost IS NOT NULL OR reconciliation_status='REVIEW' OR EXISTS(SELECT 1 FROM emergency_switch_cost_pending ep WHERE ep.order_id=orders.id) OR EXISTS(SELECT 1 FROM emergency_route_only_cost_pending ep WHERE ep.order_id=orders.id))"];
  const params:unknown[]=[];
  if(q){
    where.push("(tracking LIKE ? OR order_id LIKE ? OR customer LIKE ? OR supplier LIKE ? OR service LIKE ? OR reconciliation_status LIKE ?)");
    const like="%"+q+"%"; params.push(like,like,like,like,like,like);
  }
  if(req.nextUrl.searchParams.get("supplier")){where.push("(supplier=? COLLATE NOCASE OR EXISTS(SELECT 1 FROM supplier_costs sc JOIN order_lots sl ON sl.id=sc.order_lot_id WHERE sl.order_id=orders.id AND sc.supplier=? COLLATE NOCASE) OR EXISTS(SELECT 1 FROM emergency_switch_cost_pending ep WHERE ep.order_id=orders.id AND ep.old_supplier=? COLLATE NOCASE) OR EXISTS(SELECT 1 FROM emergency_hold_orders eh WHERE eh.order_id=orders.id AND json_extract(eh.snapshot_json,'$.supplier')=? COLLATE NOCASE))");const supplier=req.nextUrl.searchParams.get("supplier");params.push(supplier,supplier,supplier,supplier);}
  if(req.nextUrl.searchParams.get("loss_only")==="1")where.push("actual_gp<0");
  if(req.nextUrl.searchParams.get("emergency_only")==="1")where.push("(EXISTS(SELECT 1 FROM emergency_switch_cost_pending ep WHERE ep.order_id=orders.id) OR EXISTS(SELECT 1 FROM emergency_route_only_cost_pending ep WHERE ep.order_id=orders.id))");
  const whereSql=" WHERE "+where.join(" AND ");
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders"+whereSql,params)?.c||0;
  const items=queryAll(
    "SELECT tracking,order_id,customer,supplier,service,sub_service,est_net_cost,true_net_cost,reconciliation_delta,reconciliation_status,extra_surcharge,extra_import_tax,total_due,actual_gp,estimated_gp,estimated_margin_pct,finalized_gp,finalized_margin_pct AS gross_margin_pct,margin_status,actual_cost_coverage,effective_net_cost,cost_coverage_json FROM orders"+whereSql+" ORDER BY CASE reconciliation_status WHEN 'REVIEW' THEN 0 ELSE 1 END,ABS(COALESCE(reconciliation_delta,0)) DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
}

async function handlePOST(req:NextRequest){
 const auth=requireFinance(req);if(auth.error)return auth.error;
 try{return NextResponse.json({items:reconciliationAction(auth.user,await req.json())});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể đối soát"},{status:400});}
}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
