# Verification — Sales ownership, BOD monthly overview, Statement close
Date: 2026-10-25, Asia/Ho_Chi_Minh. Base: 8cccd35. No deployment or production acceptance claimed.

## Implemented
- Client owner transfer no longer rewrites Order history. SQLite snapshots the owner at the first purchase write, validates active Sales, and protects purchased Client/Sales/time. A separate append-only snapshot records actor where supplied.
- Owner audit with Admin retrieval; optional optimistic owner comparison is used by the account UI. Current Sales authorization still follows current Client owner. Purchased Order edits preserve historical attribution.
- BOD four drilldowns use historical Sales, 6/12-month revenue bars/tables, MoM, pending estimate/missing estimate, finalized GP and eligible commission GP Base. Current Refund obligations / legacy allocated Refunds exclude commission eligibility once; payout does not reduce it again.
- Monthly Statement batch + Admin Review, checkpoint continuity, closed months only, Payment confirmation including current adjusted amount, price/journal gates, savepoint rollback, immutable snapshots and idempotent retries. Open Claim alone is allowed.
- UI trigger, authenticated API and explicit-DB CLI. Cursor and remaining_client_ids expose unprocessed Clients/period backlog. No scheduler has been activated.

## Verification
- npm test: all 36 synthetic domain suites PASS.
- scripts/verify-sales-monthly-close.cjs: 36 assertions PASS, plus 40 purchases racing 40 owner transfers on separate SQLite connections. Tests include Client/Admin/Sales purchase, old/new Sales access, invalid owner rollback, retry, historical/unknown legacy attribution, immutable snapshots, nonzero/zero MoM, missing estimate, Refund revision/payout, stale Payment confirmation, Review recovery and contiguous months.
- scripts/verify-owner-http.cjs: 10 existing HTTP suites PASS (491 HTTP assertions; separate setup checks also pass): Order API, Operations, Finance, Manifest Scan, Cancellation, Owner Credit, Owner Manual (concurrent Tracking/price retries), Statement V2, Balance Overview and Finance List.
- scripts/verify-sales-monthly-http.cjs: 35 new HTTP assertions PASS: actor/audit/privacy, stale owner conflict, ownership permissions, historical reporting, monthly gates, concurrent retries, one finalized snapshot, open Claim projection and Review recovery.
- Browser: 14 assertions across BOD and Finance Statement at 1440px and 390px; no page errors or horizontal page overflow. Revenue bars and horizontally scrollable tables inspected in screenshots.
- npm run lint and npm run typecheck PASS.
- npm run build PASS against a fresh temporary DB. Build metadata uses one worker to avoid concurrent legacy ALTER TABLE initialization.
- CLI smoke on the owned synthetic HTTP fixture: exit 0, no remaining periods/Review, no duplicate snapshot.
- git diff --check PASS.

## Evidence and reproduction
Logs and four desktop/mobile PNGs: [evidence directory](evidence/sales-monthly-20261025).
Run domain checks with npm test. Build with npm run build (always disposable DB).
The HTTP harness starts/stops only its own localhost server and generates a new synthetic DB. Browser mode is enabled with DMD_BROWSER_CHECK=1; select an installed Playwright module with DMD_PLAYWRIGHT_MODULE and use installed Google Chrome. It checks the built candidate. Test credentials and all displayed accounts are synthetic.

## Data safety and remaining limits
No operational DB was opened/reset for testing. Codex/ remained untouched. Tests use temporary files or new .smoke fixtures. The existing guarded demo reset now includes new audit/batch tables after its scope checks and backup; operational resets were not executed.

One build attempt exposed concurrent legacy schema creation; isolated metadata was serialized and passed afterward. Typecheck also found four identical generated duplicate files named “ 2.ts” under .next/types; byte identity was checked before removing only those disposable duplicates. No source/reference file was removed.

Historical attribution already overwritten by older software cannot be reconstructed from current Client ownership; existing purchased values are preserved, unknown stays unknown. Commercial month views remain live purchase cohorts, not issued accounting snapshots. Commission eligibility is reported; no payout-ledger/rate-policy expansion is introduced. External scheduler provisioning and production data acceptance remain operational work.
