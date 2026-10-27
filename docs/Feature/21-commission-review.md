# Manual commission inputs — 2026-10-27

## Current Owner policy (supersedes the 26/10 per-Order review MVP)

Report by historical Sales and month with four uniform money columns: Sales Revenue, original GP Base, Refund, GP Base - Refund. Original sales_price and base_cost remain unchanged, excluding surcharge/import tax. The derived column may be negative; no eligibility floor, commission rate, payment or payroll automation is implied.

- Cancelled: no commission. Revenue/GP remain visible as reference in this separate group.
- Shipping incident: shipping problems, including force majeure. New decisions accept SHIPPING_INCIDENT; existing LOST/DELAYED map here.
- Reconciliation error: new decisions accept RECONCILIATION_ERROR; existing PARAMETER_ADJUSTMENT maps here.
- Pending Claim: no decision yet; reported separately without inventing a refund amount.
- Unclassified legacy OTHER, missing attribution, mixed categories, multiple Sales or purchase periods require review. Never infer a split.

No per-Order commission approval is required. The old Admin approval form is removed; POST `/api/commission-review` returns 410 to Admin (other roles remain denied). Historical `commission_review_events` remain untouched, but approvals no longer restore BOD commission GP. Internal legacy review helpers remain for reading historical source evidence; there is no public command path to append decisions.

## Two reporting bases

GET `/api/commission-review?month=YYYY-MM` returns:

1. `performance`: purchased Orders in the requested Vietnam-local month, grouped by historical Sales/category. Original revenue and GP plus latest approved Claim total are visible. This is a live performance projection, not a financial snapshot. Pending/unattributed Claim Orders stay separate. A Claim's total is included only when all its Orders have one known Sales, purchase month and consistent report group.
2. `refund_adjustments`: obligation events recorded in the selected month. Each Claim decision contributes new total minus previous total, including compensation. Same-Sales/same-period multi-Order Claims contribute their full amount once. Revenue/GP are source references, deduplicated within each group. They are **not additional revenue** and must not be added to performance totals or across groups.
3. `attribution_review`: ambiguous sources and changed reason categories, linked to Claim/Order IDs for manual investigation. These amounts are review references, not a second financial total. `legacy_claim_ids` explicitly flags older Claim decisions without inferred obligations.

Cancellation credits use ORDER_CANCELLATION Ledger sources; their original purchase cohort and posting-month adjustment remain separate. Actual TO_BALANCE/TO_BANK events settle existing obligations and are never counted again as commission Refund. Actual cash reporting continues to use Bank paid_date; Statement movement assignment continues to use append-only posting time and carry-forward rules. Backdated Bank evidence does not restate an issued Statement.

No Claim-to-Order refund engine, fee/tax split, or automatic commission is added. Multiple Claims can reference an Order; its revenue/GP is deduplicated per report group. Unknown or changed classification is surfaced for review rather than silently assigned. Whole-Claim totals cannot be treated as service-only refunds.

## Access and UI

Admin, Finance and BOD can read the internal report; Sales, Client, Warehouse cannot. The Admin Action Dashboard shows the monthly selector and both four-column tables, pending Claims and source review references. The BOD commercial view shows original GP and GP of Orders without Claim/Refund as manual inputs, never approved commissions. GP Net privacy is unchanged.

## Sources and verification

- `src/lib/commission-report.ts`, `src/app/commission-review-panel.tsx`, `/api/commission-review`, `src/lib/bod-commercial.ts`.
- Domain: `scripts/verify-sales-monthly-close.cjs` covers original GP, total Claim/compensation, signed revisions, same-Sales multi-Order totals, ambiguous Sales, late corrections, payout deduplication and read-only money behavior.
- HTTP/browser: `scripts/verify-sales-monthly-http.cjs` covers report permissions, retired command and existing monthly close integration. Actual execution results and remaining limits are recorded in the continuation audit.

## Limits

Unknown reasons and legacy data still require manual source review. No automatic allocation or historical migration/reset is performed. This report does not establish payroll amounts or certify production acceptance. It scans purchased Orders and Claim events; pagination and high-volume performance remain unverified.

Verification for this continuation: [27/10 audit, test evidence and limits](VERIFICATION-REFUND-COMMISSION-2026-10-27.md).
