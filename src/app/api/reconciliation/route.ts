import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
export const runtime = "nodejs";
export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const where=["(true_net_cost IS NOT NULL OR reconciliation_status='REVIEW')"];
  const params:unknown[]=[];
  if(q){
    where.push("(tracking LIKE ? OR order_id LIKE ? OR customer LIKE ? OR supplier LIKE ? OR service LIKE ? OR reconciliation_status LIKE ?)");
    const like="%"+q+"%"; params.push(like,like,like,like,like,like);
  }
  const whereSql=" WHERE "+where.join(" AND ");
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders"+whereSql,params)?.c||0;
  const items=queryAll(
    "SELECT tracking,order_id,customer,supplier,service,sub_service,est_net_cost,true_net_cost,reconciliation_delta,reconciliation_status,extra_surcharge,extra_import_tax,total_due,gross_margin_pct,margin_status FROM orders"+whereSql+" ORDER BY CASE reconciliation_status WHEN 'REVIEW' THEN 0 ELSE 1 END,ABS(COALESCE(reconciliation_delta,0)) DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
}
