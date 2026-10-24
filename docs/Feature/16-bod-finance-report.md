# BOD Finance report — Client, Supplier and approved Order GP

## Continuation — 25/10/2026
BOD/Finance report now adds current Supplier signed Balance and separate Refund Receivable from the same Account projection (including effective decision corrections and settlement reversals). Unresolved Claim/Recovery sources are flagged REVIEW. Historical invoices are not added to Balance; no old receipts/openings are inferred. This is current exposure, explicitly independent of requested report period.
Supplier Add-on revenue/cost use Vietnam posting date in the requested period and remain separate from Order GP. Current Order GP includes only FINALIZED + COMPLETE Actual coverage + PASS reconciliation. Pending/Review estimated GP and counts appear separately; no sum is labelled company net profit. No automatic allocation or physical bank reconciliation.
Client Reconciliation now summarizes available / total / issued Statement periods and explicitly identifies unavailable Clients. Missing historical periods are not reconciled zero. Existing period opening/closing and bank-versus-wallet separation remain intact.
Regression `verify-bod-finance-report.cjs`: 22 synthetic assertions including correction/reversal parity, legacy invoice non-duplication, pending GP exclusion, period/current separation and no money/Statement posting on repeated reads. Typecheck/lint PASS. Full acceptance and historical migration remain open. Older sections below are historical where superseded.


## Consecutive period UI continuation — 20/10/2026

The Statement history API returns `next_period_start` from the checkpoint or last issued end in the same serialized read as history. Selecting a Client automatically loads history and selects that unissued period; a next-period button restores its dates. A future period is labelled as unavailable for Finalize. Captured Credit Limit/Reserve appear separately as references, never added to balances. Client-switch/unmount invalidates pending Statement and Claim responses. Existing role, immutable snapshot, late-posting and Debt-first rules remain unchanged. See [current as-is audit and rerun evidence](STATUS-AS-IS-2026-10-20.md). Legacy migration and complete production acceptance remain open. Older progress sections below are historical.


## Statement V2 operational integration — 20/10/2026 (current implementation)

This section supersedes earlier delivery-status notes below; approved business rules are unchanged. Statement V2 is connected to the active operational Ledger, Debt/allocations, daily interest and Refund events, with API and UI. `fc_*` remains inactive. See [implementation, evidence and remaining gates](VERIFICATION-STATEMENT-V2-2026-10-20.md).

`statement_periods` now reports each Client's signed opening/closing Balance, Debt and Refund Balance from the operational audit projection, plus the exact issued snapshot when the requested interval matches it. Projection totals are checked against current operational balances and cumulative actual Bank refund records before reporting availability. The entire report runs in one immediate transaction to avoid mixing concurrent account states. Unsupported pre-checkpoint/legacy periods are explicitly unavailable with a reason, rather than reported as reconciled zero.

The UI compares period balances and Finalized status separately from current exposure. Raw Ledger flow is still raw Ledger (Payment includes Debt-paid amounts); the Statement projection includes the Debt reclassification/allocation deltas needed to reconcile net Wallet. Never add raw flow to net opening without those deltas. Actual Bank Refund uses `paid_date`; Statement Bank movement uses recorded posting period, with the difference explicitly labelled. Supplier payments/physical bank-statement matching and complete company cash reconciliation are **not** certified by this Client-finance report.


**Trạng thái:** Partial implementation 20/10/2026; not Owner-accepted or production certified.

## User-facing implementation
- Only `BOD` and `FINANCE` may call `GET /api/bod-finance-report?start=YYYY-MM-DD&end=YYYY-MM-DD` and open **BOD Finance** tab from Finance workspace; API responses `private, no-store`.
- Displays current **signed** Client Balance, outstanding Debt, signed Refund Balance and Reserve, without netting different Clients against one another. Shows positive Refund obligations and over-refunded exposure independently.
- Reporting-period flows: Payment net, wallet Refund/Recovery, other wallet/service postings, Bank Refund cash outflow (bank execution date), and Claim category net changes. Ledger categories reconcile to the total recorded ledger movement; cash outflow **never increases Client Balance**. No BOD read creates Payment, Debt, Bank execution or refund events.
- Bank accounts free-text, entered in Refund Management; report does not initiate transfer. Sensitive bank evidence is restricted to Finance/BOD via RefundService report.
- Service-cost internal postings excluded from Client Wallet flows. Balance/Reserve/DEBT read from existing application Financial Core adapter (`credit.ts`); Refund uses `refund_events`. Do not activate `fc_*` isolated replacement domain.

## Accounting semantics and restrictions
- `accounts` and aggregate exposures are **current at query time**, NOT period-end reconciled balances. This avoids implying historical Debt/balance snapshots that the operational Ledger cannot reliably reconstruct yet.
- Ledger period filters `date(created_at,'+7 hours')` (Vietnam posting day); Refund Bank outflow filters actual `paid_date`. Backdated economic Order dates do not silently restate financial posting flows.
- `ledger_flows.net_balance_change_cents` is a signed **raw Ledger** movement, including amounts paid into Debt as logged; this is not necessarily equal to change in purchasing net Balance after debt reclassifications. Finance must not interpret that single figure as ending wallet reconciled movement until Statement V2 can replay allocations.
- Claim obligation decision affects Refund Balance only, not Client Wallet until actual Refund-to-Balance. Bank payment affects bank outflow only.
- **Remaining:** immutable periodic Statement V2 (service charges, finance events, Balance/Debt/Refund opening/closing), historical Debt/allocation migration, reconciliation with Supplier net and production financial evidence. Existing Statement UI still has legacy columns and cannot be used as approved Finalized snapshot.

## Source/tests
- `src/lib/bod-finance-report.ts`, `src/app/api/bod-finance-report/route.ts`, `src/app/bod-finance-workspace.tsx`, `src/app/finance-role-workspace.tsx`.
- `scripts/verify-bod-finance-report.cjs` creates isolated temporary SQLite. Tests RBAC, negative Balance, signed Refund exposure, bank vs wallet differences, no bank double counting on replay, and grouping invariant.
- No changes or reset to live/user-provided database, no `Codex/` changes.

## Next
1. Build Statement V2 on authoritative operational Ledger **without dual-booking**. Persist immutable snapshots + opening/closing state at captured checkpoints, with event audit; fail closed when period cannot be reconciled due to historical allocations.
2. Add statement-dispute projection from existing Claims and late adjustments in next period.
3. E2E role/browser UAT on a disposable seeded database, then migration and backup/restore rehearsal before pilot.
