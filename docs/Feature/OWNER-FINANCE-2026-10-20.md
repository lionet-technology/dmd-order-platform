# Owner financial refactor — 20/10/2026

## Payment Adjustment application continuation — 20/10/2026

Finance can now append linked actual-receipt adjustments through the Payment Reconciliation UI/API. Original Payment and adjustment ledger/history are immutable; reductions consume the Payment's Balance portion, then reverse principal and interest; increases settle current Debt interest/principal before surplus. Client/Sales notifications, optimistic versions and atomic actor-scoped receipts are implemented. Existing Payment allocations into Statements are **blocked pending reviewed migration**; the global legacy FIFO and Statement-dependent Debt conversion remain. This is a verified partial delivery, not completion of the Owner financial cutover. See [Payment feature](15-payment-reconciliation.md) and [current evidence](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).


## Payment reconciliation continuation — 20/10/2026

Finance bulk confirmation/discrepancy is connected to real Payment ledger rows through a dedicated API and UI. It appends immutable reconciliation history, atomic Client/Sales notifications and optimistic version checks without moving money or allocations. Payment Adjustment and the approved Payment/Debt/Statement cutover remain incomplete. See [Payment reconciliation](15-payment-reconciliation.md) and [verification/migration/UAT](VERIFICATION-PAYMENTS-2026-10-20.md).


**Business status: APPROVED. Delivery status: PARTIAL. Claims/Refund adapter connected; replacement Payment/Debt/Statement core remains inactive.**
This decision supersedes conflicting Statement/FIFO, Claim auto-credit, Finance permission and Debt-source rules in older documents. Existing Payment/Debt/Statement operational code still contains those old behaviors; Claims/Refund status is described in [feature 14](14-refund-management.md). Passing the replacement domain tests does not mean the application implements this decision.

## Approved rules

1. Balance Ledger is the balance source; signed balance has no negative cap. Purchase room is `max(0, Balance + Credit Limit - Reserve)`. Independent Hold and unpaid overdue Debt block purchases. Client bulk purchase has partial success, failed Drafts require explicit reselection, no automatic retry. READY requires purchased/reserved, complete template/data, no Hold; no second balance check after reserve. Charge at each service's approved trigger; Statement finalization never charges.
2. One Debt Account per Client, with outstanding principal, accrued interest, current daily rate and one deadline. Admin explicitly converts an amount up to negative Balance; no Statement/Order selection, fake Payment or revenue. Conversion credits Balance and increases Debt equally. In-term Debt does not consume room. Deadline includes the whole Vietnam day; overdue begins at 00:00 the next day. Extension/rate changes require old/new audit, with no retroactive interest. Payments settle interest, principal, then Balance surplus; Debt payment does not release room twice. No automatic Debt.
3. Sales/Admin payments take effect immediately. Finance gets a separate reconciliation sheet: bulk confirm, discrepancy, amount adjustment to actual receipt. Confirmation status never changes money; no suspicious detection or per-payment advance approval. Original Payment immutable; typed linked adjustments. Only Debt/Balance allocation, never Statement. Reductions consume the original Balance portion first, then reverse Debt-paid principal/interest as required; never cancel Orders or create new Debt. Atomic/idempotent writes, Client and Sales notifications.
4. Claims classify LOST, DELAYED, PARAMETER_ADJUSTMENT, OTHER. Decisions/revisions change only Client Refund Balance. Positive means DMD owes, zero settled, negative overpaid. Over-refund warns without blocking. Separate Refund Management shows current per-Client balance, history and a sheet for multiple actual payouts, without Claim-by-payout mapping. Confirmed refund-to-balance reduces Refund Balance and credits Balance once. Executed refund-to-bank reduces Refund Balance and records source/recipient accounts, amount/date/reference/proof and cash outflow; never credits Balance. Free-text bank accounts allowed. Revisions never alter past payout or adjustment records. Negative Refund Balance can remain indefinitely; no automatic recovery, Hold or Debt. Only Admin can manually recover some/all overpayment: debit Balance, credit Refund Balance. Other adjustments require typed source/reason/audit.
5. FINALIZED Statement is an immutable periodic snapshot: (A) services/surcharges/add-ons/prior-period adjustments, (B) financial activity with Payment Debt/Balance breakdown, refund Balance/bank, conversions and adjustments, (C) opening/closing Balance, Debt and Refund Balance. Credit Limit/Reserve reference only. No charge/payment execution or FIFO/paid-unpaid workflow. Disputed is derived from Claims. Financial postings after finalization enter a later period; never rewrite issued snapshots.
6. BOD reporting separates current positive obligations from negative overpayments per Client, signed flows and incident categories; bank actual outflow and Balance refunds remain separate with drilldown. Balance Report must match ledger and exclude bank refund credits. No double counting.
7. Admin/Sales/Finance/Client permissions are explicit; Finance does not inherit Admin powers. Immutable records, request keys, exact cents, atomic transactions, durable notifications/outbox, quick spreadsheet workflows and one-carton default. No Cargo/Mid-mile expansion.

## Implemented replacement domain (not application behavior)

`src/lib/financial-core/{schema,core}.ts` accepts an explicit SQLite connection. It never imports `db.ts`, reads environment DB paths, migrates operational tables, creates users or seeds balances. Construction creates only additive `fc_*` tables. Tests provision an empty disposable DB with synthetic Client IDs.

- Integer cents in domain input/storage, safe-integer bounds and immutable update/delete triggers.
- Events carry signed Balance/principal/interest/Refund Balance/reserve/cash-out deltas, actor, source, reason, posting time and typed detail.
- One Debt aggregate per Client; conversion independent of Statement. Prospective terms, inclusive Vietnam deadline, daily interest rounded in cents using BigInt exposure; intraday principal/rate changes apply from their timestamp. This intraday implementation needs Owner UAT against the earlier day-based examples before activation.
- Payment Debt-first posting, linked actual-receipt adjustments and immutable reconciliation events; transactional outbox rows for Client and responsible Sales.
- Claim obligation revisions, signed Refund Balance, free-text bank payouts, warning-only over-refund and Admin partial recovery.
- Reserve/charge/release primitives. Charge does not recheck room, but requires a matching reserve and no account Hold. **Order Hold, template, service-trigger and READY guards remain the responsibility of the pending application adapter.**
- Immutable completed-period snapshots, event drilldown and separate BOD refund exposures/flows.
- Atomic receipts scoped to actor/key with canonical payload hashes; permission checks happen before replay. SQLite immediate transactions serialize independent writers.

## Not implemented / activation blockers

The isolated `FinancialCore` replacement is **not imported by application routes**. A separate Claims/Refund adapter now uses the existing wallet ledger and its own signed obligation history; it does not activate fc_* accounts. `credit.ts`, `finance.ts`, current Payment/Statement UI, Balance Report and existing BOD reports still use the legacy domain. There is no dual-write adapter. Do not expose replacement balances beside legacy balances or assume either has been reconciled.

Remaining work: unified ledger migration/cutover; Client configuration and enrollment adapter; replace every financial write path (Order charge/cancellation/weight adjustment/import/surcharge/manual adjustment); connect authoritative purchase checks; Payment Reconciliation UI/API; historical Claim migration; Statement dispute derivation and late adjustment adapters; application BOD/Balance report parity; outbox delivery/read/ack lifecycle; HTTP RBAC/concurrency tests; desktop/mobile UAT for Admin/Sales/Finance/Client. Statement finalization stores an actor/key payload receipt and also returns the immutable existing snapshot for the same Client+period. No transport/API contract is claimed complete.

## Evidence and rollout

See [verification and migration notes](VERIFICATION-FINANCIAL-CORE-2026-10-20.md). Historical feature docs describe legacy behavior below their new status notice. This document is the approved target, while the replacement test suite is evidence only for the explicitly implemented primitives.
