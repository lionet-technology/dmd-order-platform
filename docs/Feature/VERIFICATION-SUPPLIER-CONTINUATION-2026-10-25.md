# Supplier continuation, Client Reconciliation and BOD — 25/10/2026

Status: implemented and verified on isolated synthetic fixtures; not production acceptance.

## Git and delivered increments
Initial fetch confirmed origin/main had zero unique commits and main had exactly d6714ff and 6517c47. Baseline 35 domain suites, typecheck, lint and production build passed before those two commits were pushed.
- d64e9ad: explicit immutable operational Recovery → Account Claim source link; overlap/legacy receipt guards and source warnings.
- 739c9df: append-only Claim decision corrections and full settlement reversals with compensating Offset entries.
- 2242204: old/new Emergency Supplier visibility, route-only filter, cost-source snapshots and documented Admin Review exceptions.
- 042f483: BOD current Supplier exposure, separate period Add-ons, approved Actual Order GP and Client Statement availability.
- Final verification follow-up adds isolated build execution, missing-GP protection, updated multi-Lot regression expectations and reproducible browser evidence.

## Accounting and workflow
[Supplier Account rules](19-supplier-accounts.md), [reconciliation rules](09-supplier-reconciliation.md), [BOD report](16-bod-finance-report.md).
Linking transfers follow-up ownership, never creates an inferred approval/receivable/receipt. Same Supplier and exact Order scope/amount, one unambiguous open Recovery and no prior receipt/posting are required. Overlapping unlinked sources fail closed; old/new receipt paths reject the same Supplier/reference. Original operational records are retained.
Effective approved = original approved + immutable correction deltas. Outstanding = effective approved − unreversed receipts − unreversed offsets. Reverse Offset appends equal opposite Balance; reverse receipt changes receivable only. Evidence/reason/reference/actor/time are retained. Original decisions and settlements cannot be rewritten; stale correction, duplicate reversal and over/under-settlement fail atomically.
Cost snapshot includes each Supplier document and adjustment source. Changed documents invalidate approval even at an unchanged aggregate. Multiple Suppliers/Lots and late adjustments require review; missing new Emergency cost remains partial. Finance records Admin Review reference/evidence; no guessed allocation.
BOD current Supplier exposure and current Order GP are independent of the selected posting period. Only non-null finalized GP with COMPLETE/PASS qualifies; missing GP stays pending. Pending estimated GP and missing-estimate count remain separate. Add-ons use Vietnam posting period and never become company net profit. Client availability identifies unavailable historical periods rather than reconciling them as zero.

## Executed final verification
Runtime: Node 20.20.2 arm64, matching installed SQLite native module. Node 22 x86_64 and bundled Node 24 were incompatible and not used for final checks. Stale duplicate generated Next types were preserved by moving the previous .next to /tmp/dmd-next-before-20261025-1728, then regenerating.
- npm test: all 35 domain suites PASS. Supplier Account 138 assertions; Emergency 152; Debt/Reconciliation 66; BOD 23.
- verify-owner-http.cjs: all 10 owned synthetic HTTP suites PASS: Orders 36, Operations 23, Finance 20, Manifest 16, Cancellation 86, Owner Credit HTTP 18, Manual 31, Statement 39, Balance overview 140, Finance list 22 assertions. The Owner Credit fixture also passed its 47 domain assertions.
- npm run build, npm run typecheck, npm run lint and git diff --check: PASS.
- e2e-supplier-accounts.cjs: Chrome 1440×1000 and 390×844 PASS, 22 assertions. Actual UI: BUY/SELL Add-ons, partial approval/Offset/receipt/close, mistaken Offset reversal, decision correction, explicit Recovery link without second receivable, old Supplier cost visibility and documented review, BOD Supplier/GP parity, scoped Client Statement navigation. No browser errors or page overflow. Horizontally scrollable comparison tables remain on mobile.
- Mutation failures were injected in synthetic tests: approval/correction audit, settlement/reversal Balance posting and money receipt rollback; immutable originals, source/actor retries and stale commands are covered.

Evidence: [domain log](evidence/supplier-continuation-20261025/domain.log), [HTTP log](evidence/supplier-continuation-20261025/http.log), [build log](evidence/supplier-continuation-20261025/build.log), [browser log](evidence/supplier-continuation-20261025/browser.log).
Screenshots: [correction desktop](evidence/supplier-continuation-20261025/supplier-correction-desktop.png), [correction mobile](evidence/supplier-continuation-20261025/supplier-correction-mobile.png), [source link](evidence/supplier-continuation-20261025/supplier-link-mobile.png), [cost review](evidence/supplier-continuation-20261025/supplier-review-mobile.png), [BOD desktop](evidence/supplier-continuation-20261025/bod-desktop.png), [BOD mobile](evidence/supplier-continuation-20261025/bod-mobile.png), [Client desktop](evidence/supplier-continuation-20261025/client-desktop.png), [Client mobile](evidence/supplier-continuation-20261025/client-mobile.png).

## Data-safety incident and correction
The first baseline build did not explicitly set DMD_DB_PATH. Default DB data/dmd-finance-ops.db modification time became 2026-10-25 00:30:50 local time. There is no pre-build checksum/snapshot, so byte-for-byte preservation and absence of startup migrations cannot be certified. No reset/delete/seed command was directed at that DB, and no manual financial action was executed against it. Do not interpret synthetic tests as verification of its historical records.
All finance suites and browser servers selected owned synthetic databases. Subsequent builds explicitly used temporary databases. npm run build now invokes scripts/build-isolated.cjs, which always overrides even an inherited DMD_DB_PATH with an owned temporary DB and removes only that temporary directory afterward. The final build passed; default DB modification time remained 00:30:50 afterward. This prevents recurrence; it does not retrospectively prove the first build left the DB unchanged.
Codex/ remains untracked and was excluded from all staging. No synced project source, real carrier/bank operation, destructive historical migration or deployment was performed.

## Outstanding exceptions and policy boundary
- Legacy Claim Balance postings, Recoveries with existing receipts, mismatched amount/scope and multiple overlapping Recoveries require reviewed historical reconciliation. They remain flagged/blocked; no automatic historical import or reset.
- Admin Review is documentary evidence entered by Finance. A separate authenticated Admin signoff queue is not implemented; operational Admin still cannot access Supplier GP APIs.
- Supplier Account cost confirmation still blocks Lot adjustments needing Supplier allocation. Use reviewed explicit signed account adjustment; no inferred allocation, automatic payable restatement, invoice-to-cost mapping or opening wizard.
- Rejected/unapproved Claim reopening, operational receipt correction/migration, evidence upload store, full account-history pagination and Supplier-specific Add-on catalogue remain outside this increment.
- BOD exposure/Order GP are current, not immutable period-end Supplier snapshots or full company net profit. Physical bank matching and company-wide costs remain open.
- Client legacy Statement allocation migration and unavailable historical periods remain explicit review exceptions. Full operational-role/device acceptance, actual-document pilot, backup/migration rehearsal and rollout remain open.
No new business-policy decision is required to use the verified synthetic paths. Outstanding items need reviewed evidence/migration or additional implementation; this report does not mark them completed.
