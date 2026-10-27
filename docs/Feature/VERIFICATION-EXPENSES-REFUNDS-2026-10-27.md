# Verification — Refund pool / Internal Expenses — 27/10/2026

## Baseline and scope
Inspected local HEAD `2c0e181` (`main`), then fetched origin: no upstream delta. Existing untracked `Codex/` preserved. Owner explicitly confirms Client aggregate Refund pool, strict outstanding limit for Bank and Balance, separate Balance Adjustment and VND internal expenses managed by both BOD/Finance.

No existing operational/TEST DB reset, migration, opening-balance inference or data deletion. Domain suites use newly created temp DBs. Build uses `scripts/build-isolated.cjs` with its own temp DB. HTTP runner owns synthetic fixtures/localhost servers; new browser/HTTP scenario creates another fresh temp DB independent of operator variables. No deployment performed.

## Delivered behavior
- Refund pool remains Client-level. Actual payments require no Claim attribution. Both payout channels reject amounts above `max(0, signed current outstanding)` inside the existing receipt/immediate transaction; no warning-only acceptance or silent cap.
- Successful identical retries return the original receipt even after subsequent decisions reduce the pool. Distinct competing Bank/Balance payments serialize against the same pool. Reduced approved decisions retain negative exposure; Admin partial/full recovery rules unchanged. No rewrite of actual payments or finalized Statements.
- VND Internal Expenses: [specification and current limits](22-internal-expenses.md). Additive immutable version/payment/receipt tables, stable installment keys, exact schedule total, partial payments, stale-version guards, explicit exceptional overpayment, full compensating reversal and audit. BOD and Finance can both manage; other roles denied in API.
- Monthly overview separates current commitment/remaining/excess, due schedule and net actual cash events; Commission is manually entered within payroll total. No USD/VND mixing with Client GP reports.
- Successful payment clears the form amount to prevent an accidental repeated click. Failed/ambiguous calls retain their idempotency key for identical retry. GET items and totals share a SQLite read snapshot.

## Executed verification
Runtime: existing compatible arm64 Node 20.20.2; no dependency reinstall. Initial attempts with x86 Node22 and bundled Node24 could not load the existing Node20 arm64 SQLite binary; switched runtime without rebuilding or replacing dependencies.

| Check | Result |
|---|---|
| `npm test` | 37 suites PASS, including new expenses suite |
| `node scripts/verify-refunds.cjs` final targeted run | 71 assertions PASS |
| `node scripts/verify-internal-expenses.cjs` final targeted run | 74 assertions PASS |
| `verify-statements-v2` in full run | 86 assertions PASS |
| `verify-bod-finance-report` in full run | 28 assertions PASS |
| `node scripts/verify-owner-http.cjs` | 10 HTTP suites / 491 assertions PASS |
| `node scripts/e2e-expenses-refunds.cjs` final built candidate | 30 combined real HTTP / Chrome assertions PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no warnings |
| `npm run build` | PASS, isolated build database |
| `git diff --check` | PASS |

Final targeted runs followed additional tests for multi-Claim pool aggregation and stale schedule payment, plus the atomic GET snapshot and payment-form reset. Full suite was not needlessly repeated after these focused changes.

Domain coverage includes: no obligation/negative pool rejection, exact outstanding, partial payouts, signed downward corrections, recipient privacy, migration gate, immutable money/audit, all-or-nothing batches after a valid first row, outbox rollback after a valid payment, idempotency payload conflicts and four-connection retries. Distinct requests competing across Bank/Balance cannot exceed one Client pool; multiple Claims add to that pool. Statements test late Claim decisions, Bank/Balance posting in the next open period, immutable prior snapshot bytes and replay without duplicate posting.

Expenses coverage includes: role matrix, invalid/duplicate schedules, invalid dates/currency/fractional VND, bounded Commission, committed/cash separation, stage and total excess, explicit exceptional reason, optimistic plan/payment checks, partial events, immutable versions, one-time full reversal, receipt failure rollback, concurrent distinct stage payments and concurrent same-key retries across independent SQLite connections. Internal payments create no Client Ledger rows; FK/integrity checks pass.

Chrome UAT: BOD creates two-stage IT expense; Finance edits it, records partial cash, sees refreshed totals, and reverses a wrong event. Real HTTP covers forbidden roles, over-limit Refund channels, competing cross-channel payouts, depleted pool, eight exact retries, competing expense stage payments and eight exact expense retries. Desktop and 390px mobile checked, no page overflow or browser runtime errors; Sales has no module navigation. The initial missing exact select label was fixed with explicit accessible names, then UAT rerun. Visual review exposed the retained payment amount; form reset and regression added before the final rerun.

Evidence: [desktop](evidence/expenses-2026-10-27/finance-desktop.png), [mobile](evidence/expenses-2026-10-27/finance-mobile.png).

To reproduce browser tests, supply installed Playwright via `DMD_BROWSER_NODE_MODULES`; optional `DMD_CHROME_PATH` overrides the default macOS Chrome path. All scenarios create fresh DBs and use local synthetic accounts. Screenshots are regenerated in the evidence folder. Temporary browser fixture/log folder is retained for diagnosis; it is not the operational database.

## Remaining limits / release status
This is a tested source increment, not full system/production acceptance. Legacy Client Claim migration still requires reviewed reconciliation; no automatic cutover or reset is introduced. Real bank execution/evidence reconciliation, historical opening review, deployment-target backup/restore rehearsal and Owner pilot remain acceptance work from the existing roadmap. Recovery remains the existing explicit Admin Balance debit; no automatic bank reversal/recovery is implied.

Expenses do not yet support FX (first phase-2 work), automatic Sales Commission, amortization/accounting allocation, multilevel approvals, bank integration, frozen expense monthly closes or large-list pagination. Current plan/category edits can restate scheduled/current-category expense reports; prior versions remain in audit. The new browser flow is representative desktop/mobile acceptance, not a complete every-category/device matrix. No company net-profit certification or physical bank reconciliation is claimed.
