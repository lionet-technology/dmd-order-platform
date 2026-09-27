import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const orders = queryOne<{c:number}>("SELECT COUNT(*) c FROM orders")?.c || 0;
  const review = queryOne<{c:number}>("SELECT COUNT(*) c FROM orders WHERE reconciliation_status='REVIEW'")?.c || 0;
  const unmatched = queryOne<{c:number}>("SELECT COUNT(*) c FROM supplier_costs sc LEFT JOIN orders o ON o.tracking=sc.tracking WHERE o.id IS NULL")?.c || 0;
  const ledger = queryOne<{balance:number}>("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries")?.balance || 0;
  const receivable = queryOne<{v:number}>("SELECT COALESCE(SUM(total_due),0) v FROM orders")?.v || 0;
  return NextResponse.json({ orders, review, unmatched, ledger, receivable });
}
