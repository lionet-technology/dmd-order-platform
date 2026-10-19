# Payment reconciliation continuation — verification, migration and UAT

**Full Owner financial build remains INCOMPLETE. No new commit or push.**

## Verified repository baseline

Continued the existing `dmd-uat` workspace, preserving uncommitted FinancialCore and Refund work. `git fetch origin main` succeeded using network access after sandbox DNS failure. HEAD and origin/main both equal `917ed9c8f8281ef655f29c4740387e5f8dced3f0`; divergence 0/0. Prior Refund evidence and actual code were read before implementation. No clone/restart, merge, reset, operational seed or Codex/ change.

Remaining legacy code was verified: `allocateFIFO` still targets Statements, Debt conversion still requires Statement, and replacement `FinancialCore` remains inactive. Existing Refund adapter uses the real application wallet independently of that inactive core. Earlier evidence is retained and not claimed as new UAT.

## New application behavior

Added actual Finance bulk Payment confirmation/discrepancy with immutable event history, paginated search/status filters, optimistic version control, canonical actor-scoped idempotency, atomic financial audit, Client/Sales in-app notifications and recipient-only read acknowledgement. Dedicated `/api/payment-reconciliation` is authenticated; Finance alone writes reconciliation. Admin/BOD read all, Sales assigned Clients, Client self, Warehouse denied. Reconciliation never mutates wallet or allocation and never changes the original Payment. Original ledger rows with reconciliation evidence are update/delete protected.

UI is in the Finance/BOD workspace and operational Balance Ledger for Admin/Sales/Client. Feature/RBAC, business decisions, operational flow, roadmap and Owner target status were updated together. See [feature contract](15-payment-reconciliation.md).

## Automated results

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: 23 domain suites PASS, including new real-handler/session HTTP tests (50 assertions at full-suite run).
- Final new suite: 52 assertions PASS after adding competing distinct-key writer checks. Four independent SQLite writers retry one key forty times: one event. Four different keys targeting version zero: exactly one succeeds; three reject stale version. History cannot be overwritten.
- Coverage: bulk rollback on invalid/duplicate/stale rows, notification failure rollback, wallet/allocations unchanged, append-only correction history, key conflict/replay, all role boundaries, cross-Client isolation, notification recipients/ack isolation, search/filter, invalid pagination, immutable ledger/audit and foreign-key check.
- `npm run build`: PASS, including `/api/payment-reconciliation`, against a newly created `/tmp/dmd-payment-build.*/synthetic.db` selected explicitly for the process.
- `git diff --check`: PASS. Default compatible Node 20.20.2 used; no dependency reinstall/lockfile changes.

Raw evidence: [all domain/API suites](evidence/payments-2026-10-20/domain-api-tests.log), [final concurrency suite](evidence/payments-2026-10-20/payment-reconciliation-final.log), [lint](evidence/payments-2026-10-20/lint.log), [typecheck](evidence/payments-2026-10-20/typecheck.log), [production build](evidence/payments-2026-10-20/production-build.log).

## Browser UAT observed

New isolated synthetic database `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-refund-browser-Ba3ito/synthetic.db` with seeded UAT accounts and three synthetic Client Payments ($10/$20/$30). Local server `127.0.0.1:3120`, stopped after verification. No real bank/payment endpoint was used.

| Role | Observed behavior | Evidence |
|---|---|---|
| Finance | Selected all three PENDING Payments; batch confirmation with reason yielded three CONFIRMED rows and success message | [Screenshot](evidence/payments-2026-10-20/finance-bulk-confirmed.png) |
| Client | Own three CONFIRMED Payments; Wallet $60, no reconciliation controls; three notices, one marked read and its unread action disappeared | [Screenshot](evidence/payments-2026-10-20/client-read-ack.png) |
| Sales | Assigned Client Payments and independent unread notifications; no reconciliation form | [Screenshot](evidence/payments-2026-10-20/sales-read-notifications.png) |
| Admin | Read-only reconciliation table; history shows Payment #3 confirmation/reason/timestamp, no reconciliation form | [Screenshot](evidence/payments-2026-10-20/admin-read-history.png) |

No browser assertion is claimed for discrepancy correction, mobile, multi-row failure, concurrent tabs, BOD, Payment Adjustment or replacement Debt/Statement. Applicable reconciliation API/domain boundaries are tested, but full financial Owner UAT remains incomplete.

## Migration and release gates still open

Additive reconciliation tables preserve historical evidence; no guessed confirmations or automatic financial correction. Legacy Payment rows without a Client remain excluded pending reviewed ownership mapping. No existing operational DB was opened for this task's tests or build; its provenance remains unverified, so no reset/migration was performed. Restore rehearsal remains open. Sources/ and Codex/ unchanged.

Still required before full release and main push:

1. Payment Adjustment linked to original actual receipt, with Debt interest/principal and Balance conservation. Retire Statement/FIFO Payment allocation and generic bypass paths.
2. One enduring Debt account per Client, manual negative-Balance conversion independent of Statement, terms/deadline/purchase integration and historical reconciliation.
3. Activate one authoritative financial model across all charge/reserve/cancellation/surcharge/adjustment paths; do not dual-write inactive fc_* balances.
4. Immutable FINALIZED full financial Statements with opening/closing Balance/Debt/Refund Balance, all period movements, late postings and Claim disputed projection.
5. Unified BOD financial report parity; reviewed Claim/Payment/Debt opening migration, backup/restore rehearsal and operational notification transport beyond in-app.
6. Complete browser UAT/concurrency/invariants for all new financial flows and real-carrier/pricing/policy release gates retained from prior reports.

Passing the implemented subset does not meet the user's full-build acceptance condition. HEAD remains `917ed9c8f8281ef655f29c4740387e5f8dced3f0`, with previous and new work uncommitted; no production deployment or push is claimed.
