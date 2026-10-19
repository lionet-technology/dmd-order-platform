# Owner Credit / Finance Reconciliation — 19/10/2026

**Partial implementation, verified locally; not production acceptance.** Started from GitHub main `563f5be` after successful `git fetch origin main`; clean checkout. No operating DB, synced `sources/`, or `Codex/` files were changed. Verification used disposable databases in the OS temp directory; build used `/tmp/dmd-owner-build-test.db`.

## Changes and accounting semantics

Existing ledger is cumulative cash/charges, including charges later restructured into Debt. Writing a new credit on conversion would fabricate a receipt and double count room. Preserve `balance_cents`; expose `net_balance_cents` using the existing Debt exclusion calculation, and explain both in the financial detail UI. Keep existing accrued-interest/payment semantics.

Admin conversion is now bounded by both source Statement outstanding and actual negative net Balance. This prevents unallocated Refund/Compensation or Reserve from being converted into extra purchasing room. Conversion, limits, source updates and receipts remain inside SQLite immediate transactions; no schema migration or new money entry.

Existing behavior verified: uncapped negative balances, no automatic Debt; reserve reduces room; Debt in term is excluded from credit consumption; deadline day is inclusive in Vietnam; extension reopens buying without bypassing independent locks; Payment pays Debt interest/principal then AR FIFO; only surplus remains Wallet, with no second release from Debt repayment. Admin rate audit now has previous/new rate and effective day. Full Payment rejection audit now retains allocation snapshots, reversal ID and amount; original Payment is retained.

Compatibility: `available_to_buy_cents` remains signed headroom, and can remain positive when an independent lock/overdue condition blocks buying. Always use purchase enforcement, never headroom alone. Legacy domain commands can still omit request keys; UI and new integration callers must provide keys. No backfill or rewrite of historical ledger/allocations.

## Verification

- `npm test`: **20 domain suites PASS**, including `verify-owner-credit` **32 assertions** and existing Debt/interest/reconciliation suite **58 assertions**. Includes existing permission, balance idempotency, legacy migration, purchase, ePacket and release-gate suites.
- `npm run lint`, `npm run typecheck`, isolated `npm run build`: **PASS**.
- `E2E_BASE_URL=http://127.0.0.1:3129 node scripts/e2e-owner-credit.cjs`: **18 HTTP assertions PASS** against the new disposable fixture. Admin/Sales/Finance/Client logins; unauthorized conversion denied; simultaneous same-key Admin conversions produce one room increase; changed payload rejected; concurrent distinct keys cannot over-convert remaining negative Balance; simultaneous Sales Payments return one ledger ID; Debt payment does not increase room; Finance/Client cannot write Payment.
- Browser against built application: Admin viewed raw ledger and net Balance, Debt details, performed extension through review/confirm, saw deadline change 21→22/10 with AR/reserve/room unchanged. Sales saw assigned Client overview; Client saw own money and no Admin controls; Finance landed in Supplier finance workspace (no Client Payment reconciliation controls). Screenshot: `artifacts/owner-credit-2026-10-19/admin-extension.png`.
- Midnight boundary is a deterministic domain test at `2026-10-19T16:59:59.999Z` and `17:00:00.000Z`, not a browser clock manipulation. These are agent-run UAT checks, **not Owner sign-off** or a real-carrier shipping test.
- Runtime used Node 20 arm64 matching installed SQLite binary. Node 22 x64 and bundled Node 24 were incompatible; no dependency/lockfile change was needed.

Reproduce the focused HTTP/browser fixture: run `node scripts/verify-owner-credit.cjs`, use its printed **test DB** in `DMD_DB_PATH` for localhost server, then run the HTTP script. Test accounts `owner.admin/sales/finance/client` use synthetic password `TestPass123!`. HTTP test adds synthetic transactions; it does not reset data. Do not point this fixture at operational data.

## Finance discrepancy assessment — gaps remain

As-is: Sales records Payment immediately via `/api/ledger`, with actor attribution and mandatory request key. FIFO may run on finance reads/commands. Admin can reject an entire Payment with an offsetting reversal. FINANCE currently has Supplier cost/reconciliation/payables access, not Client money mutation access. There is no Client Payment bulk verification/discrepancy workflow or durable Client/Sales notification delivery here.

Proposed next slice (not implemented): a separate verification record/status for each original Payment, independent of cash posting; Finance bulk confirms matched receipts or reports actual amount, discrepancy, evidence and reason. Reporting alone does not alter Wallet/Debt. Use per-item expected version and command key, explicit atomic/partial batch results, and an audit plus durable notification outbox to the assigned Sales and Client. Retrying confirmation must not record another Payment. Do not broaden Finance into Admin controls.

Adjustment blockers before enabling money changes:

1. Define deterministic partial reversal selection within the original allocations: Debt/AR targets, multiple items, manual overrides, historical reallocations, prior corrections and later repayments. Do not compute reversal merely from current Wallet. Owner's requirement to restore original obligations and use Wallet only for the remaining difference must conserve the reduction exactly once.
2. Specify interest treatment when a fully/partially paid Debt is reopened: prospective principal event versus previously accrued immutable daily interest. No silent retroactive recomputation.
3. Add immutable correction/allocation-reversal records linked to original allocation IDs, preview with before/after Wallet, AR, Debt, room and blocking reasons, expected version, atomic write and durable notifications. Require sum(restored obligations + Wallet debit) = reduction, no new Debt and no order rollback.
4. Current conversion requires a Statement source. PAYMENT_REVERSAL is intentionally excluded from statement charge items because existing AR may already have been restored. A negative Balance caused solely by such reversal cannot currently be fully converted via this action. Design a distinct traceable Balance-adjustment source and prove no duplicate receivable before implementing; do not fabricate an additional fee or Payment.
5. Full rejection is not partial correction. Its allocation snapshot audit is improved, but legacy full rejects lack this snapshot and later FIFO may redistribute other unallocated credits. Rehearse history reconciliation before using it as the basis for the new workflow.

## Next priorities

1. **ePacket US pilot:** Owner-approved live Base/Retail rates and cancellation matrix; carrier credentials, label/tracking/error callbacks; real supplier invoice mapping, coverage/FX and evidence; backup/migration/restore rehearsal; small controlled client/order cohort, financial totals and Owner sign-off. Existing domain tests use synthetic fixtures and do not certify these gates.
2. **Finance Reconciliation:** deliver verification/discrepancy records and notification outbox first; then approve the partial reversal/source rules above and implement preview/atomic correction with permission, concurrency, retry and accounting conservation tests. Do not let bulk verification re-credit Wallet.
3. Complete legacy allocation/issued Statement migration rehearsal, external notification failure/retry, end-to-end supplier reconciliation and close-period evidence. No production-ready claim from this change.
