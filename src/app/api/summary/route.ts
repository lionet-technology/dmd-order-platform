import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req:NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  if(auth.user.role==="WAREHOUSE")return NextResponse.json({orders:0,review:0,unmatched:0,ledger:0,receivable:0});
  if(auth.user.role==="SALES"){
    const scope="client_user_id IN (SELECT id FROM users WHERE role='CLIENT' AND sales_user_id=?)";
    const orders=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders WHERE "+scope,[auth.user.id])?.c||0;
    const receivable=queryOne<{v:number}>("SELECT COALESCE(SUM(total_due),0) v FROM orders WHERE "+scope,[auth.user.id])?.v||0;
    const ledger=queryOne<{balance:number}>("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries WHERE "+scope,[auth.user.id])?.balance||0;
    return NextResponse.json({orders,review:0,unmatched:0,ledger,receivable});
  }
  if(auth.user.role==="CLIENT"){
    const orders=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders WHERE client_user_id=?",[auth.user.id])?.c||0;
    const receivable=queryOne<{v:number}>("SELECT COALESCE(SUM(total_due),0) v FROM orders WHERE client_user_id=?",[auth.user.id])?.v||0;
    const ledger=queryOne<{balance:number}>("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries WHERE client_user_id=?",[auth.user.id])?.balance||0;
    return NextResponse.json({orders,review:0,unmatched:0,ledger,receivable});
  }
  const orders=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders")?.c||0;
  const review=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders WHERE reconciliation_status='REVIEW'")?.c||0;
  const unmatched=queryOne<{c:number}>("SELECT COUNT(*) c FROM supplier_costs sc LEFT JOIN orders o ON o.tracking=sc.tracking WHERE o.id IS NULL")?.c||0;
  const ledger=queryOne<{balance:number}>("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries")?.balance||0;
  const receivable=queryOne<{v:number}>("SELECT COALESCE(SUM(total_due),0) v FROM orders")?.v||0;
  return NextResponse.json({orders,review,unmatched,ledger,receivable});
}
