# BOD commercial reporting MVP — 2026-10-25

## Owner decisions
Read-only commercial reporting by month, by Sales, by Client, and by Service–Sub-Service–Supplier. First KPIs are Sales Revenue, GP Base (sales_price − base_cost), and GP Net. Supplier Add-on BUY/SELL remains a separate report so revenue and cost are not double-counted.

## Implemented
- API `GET /api/bod-finance-report?month=YYYY-MM`, Finance/BOD only; use the month in Asia/Bangkok (UTC+7) based on the original service_purchased_at, falling back to purchase_completed_at.
- Groupings: total monthly, by Sales using current Client Sales ownership (fallback Order Sales), by Client, by Service/Sub-Service/Supplier. Exclude cancelled Orders, drafts and unpurchased Orders.
- Show month Sales as sum of order.sales_price, GP Base as sum of (sales_price−base_cost).
- GP Net is **only** finalized_gp with margin_status FINALIZED, actual_cost_coverage COMPLETE and reconciliation_status PASS. Pending Orders have a separate count and are not counted as zero GP.
- Existing BOD financial/cash/receivable reporting is unchanged. Read-only queries do not create ledger postings.

## Important limitations requiring owner review before using commission
1. Sales ownership is currently resolved from current Client-to-Sales assignment, rather than historical immutable Sales attribution. Reassigning a Client can move historical monthly sales between Sales users. Do not calculate approved commission without historical owner snapshot.
2. Monthly grouping follows original purchase date; later approved Cost/refunds can update the report retrospectively. This is not an immutable finalized monthly accounting period.
3. GP Base uses sales_price and excludes surcharge/tax by design. Existing finalized_gp is based on the broader actual financial reconciliation of the Order. The two should not be compared as if they have identical revenue coverage until surcharge commission treatment is finalized.
4. Supplier Add-on performance is not included in Order tables. Manual Customer/Order attribution and cases with missing sales_price/base_cost need explicit review before production.
5. Automatic Statement batch scheduling/finalization is NOT implemented in this slice. Existing statementPreview and finalizeStatement enforce contiguous periods, immutable snapshots, and fail closed on exceptions. Recommendation: automatic preview and exception alert; auto-finalize only after reconciled close gates, not on mutable ledger reads.

## Verification
- BOD domain script 28 assertions (including grouped month totals, pending GP, cancelled exclusion, role denial and invalid month).
- Full domain suite 35/35 PASS.
- TypeScript, lint, isolated production build PASS; no operational DB reset.
