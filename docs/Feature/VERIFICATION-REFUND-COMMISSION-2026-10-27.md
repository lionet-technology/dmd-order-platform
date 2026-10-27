# Refund / Statement / manual commission continuation — 27/10/2026

Baseline: `65ddc85`, branch main, initially aligned with origin/main. Only pre-existing untracked `Codex/` was present; preserved. This audit records local implementation and verification, not deployment or production acceptance.

## Implemented change

The previous per-Order commission approval queue contradicted the latest Owner decision. It is replaced with a Sales/month report containing Sales Revenue, original GP Base, Refund and GP Base - Refund. Performance uses purchase month; adjustment rows use the month an obligation decision/revision is recorded. Actual Bank/Balance payouts do not count a second time. No automatic commission, payout, fee/tax split or Claim-to-Order monetary allocation is introduced.

Cancelled Orders are separate and excluded from commission consideration. Pending Claims are separate. Shipping incident includes force majeure; reconciliation error is a separate category. New Claim decisions accept the canonical two category values; historical LOST/DELAYED and PARAMETER_ADJUSTMENT are mapped for reporting, while OTHER remains a review item. Claim amount labels now say Refund rather than implying service freight only.

A whole multi-Order Claim with one historical Sales and one purchase month contributes one full refund amount. Multiple Sales, purchase periods, missing sources, unknown reason or conflicting Order categories require explicit manual source review. Original GP is never reduced in storage. The derived report column can be negative. Revenue/GP in the adjustment table are source references and must not be added to the performance table. Changed reason categories surface historical adjustments for review rather than silently moving money between categories.

POST /api/commission-review returns 410 for Admin; other roles are denied. The mutation helper is removed. Existing immutable commission_review_events remain; old approvals no longer restore BOD commission GP. No migration/reset was run.

## Financial audit

| Concern | Evidence / conclusion |
|---|---|
| Approved vs posted | Approval appends CLAIM_DECISION, changing signed Refund obligation only. TO_BALANCE uses one linked Ledger credit plus a negative obligation movement. TO_BANK has no Balance credit. New integration regression verifies all three effects together. |
| Immutable Statements / late changes | Journal posting sequence and per-Client finalized cutoffs carry late events forward. Backdated bank evidence leaves all issued snapshot bytes unchanged. Claim ID is retained in journal detail; Claim links retain original Order/Statement provenance. |
| Duplicate/correction handling | Request-key receipts reject conflicting retries; obligations use new total minus prior total; payouts never re-enter payroll inputs. Immutable source tables and linked Ledger rows retain history. New regression verifies payout replay after finalization and late signed revisions. |
| Multiple Clients | New batch regression leaves one Client in Payment REVIEW while another closes both months. Existing Client snapshots remain byte-identical. Concurrent per-Client finalization and 40 purchase/owner races remain covered. |
| Supplier late cost / GP Net | Existing debt-reconciliation regression confirms cost does not reprice or prematurely finalize GP, incomplete coverage stays pending, and actual mid-mile replaces estimates without double counting. BOD commercial reporting only includes GP Net with COMPLETE/PASS/FINALIZED and non-null finalized GP; pending estimates remain distinct. No new cost accounting engine was added. |
| BOD performance vs cash | Commercial reports remain live purchase cohorts. Statement snapshots are immutable financial period captures. Refund Bank cash uses paid_date; Statement movements use posting/carry-forward. Balance payouts are separate from Bank outflow. These are different bases, not interchangeable totals. |

## Verification executed

- All 36 domain suites PASS on isolated databases, including Refund 62 assertions and Statement V2 86 assertions. The final Sales/month suite was then broadened and rerun: 56 assertions plus 40 concurrent purchases PASS (the preceding full run included its 51-assertion version).
- Monthly HTTP integration: 39 assertions PASS on the final repository build, including role privacy, report shape, retired approval command, historical Sales, monthly closing and concurrent retries.
- Chrome: 24 assertions PASS across Admin/BOD/Finance at 1440px and 390px, including monthly report columns, pending Claim visibility, absence of approval button, existing BOD/Statement screens, no browser errors and no page overflow. Tables scroll horizontally on mobile. Screenshots: [Admin mobile](evidence/sales-monthly-20261027/admin-390.png), [Admin desktop](evidence/sales-monthly-20261027/admin-1440.png); equivalent BOD/Finance images are in the same folder.
- Default `scripts/build-isolated.cjs` (Turbopack) PASS in the requested repository; it explicitly selects a disposable build DB. TypeScript and targeted ESLint PASS. `git diff --check` PASS.
- Initial runtime attempts were corrected: shell had no npm, bundled Node 24 mismatched SQLite ABI, so existing Node 20.20.2 was used. A temporary source copy used webpack because Turbopack rejects its external node_modules symlink; the actual repository default build passed. These were environment constraints, not application regressions.

## Data preservation and remaining limits

No default DB was opened, reset or migrated; every test/build explicitly selected fresh synthetic storage. No backup was needed for a reset because no reset occurred. `Codex/` is preserved and excluded from staging. Project mirror sources are untouched.

- Historical OTHER, legacy Claim decisions and ambiguous attribution require manual review. The report deliberately does not invent source splits. Review-reference amounts are not a second financial total.
- Performance and source-reference figures are live projections, not a frozen payroll close; approval revisions can update the purchase-cohort Refund display while processing events stay in their original months.
- High-volume report performance/pagination is unverified. Historical migration/backup-restore rehearsal, production supplier/cash reconciliation, real-data UAT and deployment acceptance remain separate work.
- Browser checks cover the report and existing monthly BOD/Statement screens. The new canonical Claim category dropdown has domain coverage and build/type checking; its complete operational Claim workflow was not separately exercised through browser in this slice.
