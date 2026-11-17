# VNĐ Claim / Supplier continuation — 17/11/2026
Canonical workspace: /Users/quan/Developer/report. Starting local HEAD and fetched origin/main: 6245e7da37a34d01c3cf43a14593f77e8ab8b99e; ahead/behind 0/0. Initial working tree contained only owner AGENTS.md and untracked Codex/. Neither is staged or changed by this task.

## Delivered increment
- Exact fractional VNĐ Client Claim creation, separate Admin approval/revision with evidence, original goods/currency and current total collected revenue snapshots (corrections/surcharges/taxes included). No invented compensation formula, FX, pool allocation or new permission inheritance.
- Finance partial Bank/Balance execution with atomic overpool rejection and actor/key/payload replay. Admin/Finance explicit negative-pool recovery via actual Bank receipt or funded Balance after reserves; no Credit-funded recovery, automatic Debt or automatic collection. Old USD Claim/Refund paths reject VNĐ.
- Immutable Refund journal and Statement opening/closing/event cursors; bank evidence excluded from public/Statement snapshots. Issued Statements never rewritten.
- Supplier VNĐ documentary totals by Lot/unique Tracking, pending duplicates, explicit retain-old/accept-new with current-approved CAS. Actual approval alone appends payable delta. Finance/BOD partial actual payments/prepayments and signed account adjustments/history, independent of Client money and old USD journals. Admin cost access does not grant Supplier ledger access.
- BOD-only report adds Claim category/historical-Sales processing-month obligation deltas, executed-month Bank flows, Claim/non-Claim/cancellation groups, approved Supplier totals and explicit ePacket coverage OPEN. No fabricated per-Order pool allocation, fully actual GP or automatic commission payout.
- Production connection reuse fix: actual Chrome exposed SQLITE_BUSY on Statement insertion because bundled modules could use separate SQLite connections within one command. Reuse the same open connection for the same resolved DB file in all modes. Regression verifies independently evaluated production modules share the transaction and rollback.

## Final verification
- npm test PASS: **63 suites** (test.log). Includes existing reserve/FIFO, financial correction, cancellation, RBAC, snapshot, idempotency and shared-funds regressions.
- New Claim suite PASS: **44 assertions**, including three independent worker connections concurrently attempting payouts from one pool (only one accepted), receipt replay, negative revisions, Bank/Balance separation, recovery/reserve guards, statement privacy/immutability, attribution/category reporting and rollback.
- New Supplier suite PASS: **31 assertions**, including pending duplicate totals, retain/replace, current-approved CAS, immutable deltas, payment/prepayment/reference uniqueness, account RBAC, legacy-unit guard, rollback, missing coverage and unchanged Client/Order.
- Production duplicate-module identity PASS: **4 assertions** (included in 63).
- npm run build, typecheck, lint PASS; build uses a new disposable DB, never the operator DB.
- Actual Chrome production-build UAT PASS: **32 assertions / 5 authenticated roles** (ADMIN, SALES, CLIENT, FINANCE, BOD), owned disposable DB and localhost server. Client creates Claim, Admin approves, Finance overpool is rejected, partial wallet and Bank payouts reconcile, bank proof is hidden from Sales/Client, Admin submits Supplier document without ledger visibility, Finance approves actual and partially pays Supplier. Existing Add-on/privacy, Statement finalize, report permission, pre-issuance shipping edit and mobile overflow tests also pass. No browser page errors. Desktop Finance and focused mobile BOD screenshots inspected visually.
- The first label selector failure was corrected in the harness. A subsequent reproducible Statement lock was fixed in application code, not ignored/retried into PASS. initial-statement-lock.png/.txt retain the original failure; final browser.log/browser-uat.json and uat-*.png are the passing rerun.
- The initial foreground full runner exceeded its 60-second tool bound; final test run completed via an owned background runner. All final logs reflect the corrected application; final supplier source timestamp precedes completed test log.
- git diff --check PASS. Final workbook SHA256 remains a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2.

## Remaining delivery versus decisions
Implementation backlog, not new business questions: VNĐ Supplier supplementary-cost templates/import mapping/duplicate confirmation, Supplier Claim receivable and partial receipt/offset/reversal cutover, period locking/late adjustments, durable Claim notifications/acknowledgements and existing Control Tower case integration. Full GP/commission category acceptance remains partial; Client pool payouts cannot be invented as per-Order amounts.

Actual OPEN external/business inputs: inclusive ePacket cost-component coverage/mapping and any still-unconfigured Supplier cancellation/void policy and real carrier evidence. No synthetic fixture policy is certified as a real Supplier rule.

Pilot/manual end-to-end acceptance with real documents and deployment-target backup/restore rehearsal remain required. **V1 is not done or production accepted.** No Jenkins, production, carrier API, external money transfer, operator DB reset, Desktop source or workbook mutation. All new official docs/evidence are under Developer/report.

Task changes are committed by explicit directories excluding AGENTS.md/Codex and pushed only by ordinary fast-forward. Final resulting commit and remote equality are recorded in the chat after push.
