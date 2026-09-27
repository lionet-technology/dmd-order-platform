import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryAll } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  return NextResponse.json(queryAll(
    "SELECT tracking,order_id,customer,supplier,service,sub_service,est_net_cost,true_net_cost,reconciliation_delta,reconciliation_status,extra_surcharge,extra_import_tax,total_due FROM orders WHERE true_net_cost IS NOT NULL OR reconciliation_status='REVIEW' ORDER BY CASE reconciliation_status WHEN 'REVIEW' THEN 0 ELSE 1 END,ABS(COALESCE(reconciliation_delta,0)) DESC LIMIT 200"
  ));
}
