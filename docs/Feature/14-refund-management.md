# Claims, signed Refund Balance and actual refunds

**Status: implemented locally, partial financial release; not production accepted. Reviewed 20/10/2026.**

This document supersedes the historical automatic Claim credit and per-Order payout allocation in feature 10. Payment/Debt/Statement cutover remains incomplete. Do not interpret the local Refund implementation as completion of the full financial build.

## Current application flow

1. A public Client Claim remains connected to its Orders for investigation. Admin selects LOST, DELAYED, PARAMETER_ADJUSTMENT or OTHER and decides shipping refund plus compensation, in USD. Both become one signed Client refund obligation; there is no wallet posting at decision time and no required payout-to-Claim mapping.
2. A subsequent Admin decision specifies the **new total** shipping refund and compensation, not a delta. An immutable revision posts new obligation minus previous obligation. It never changes past wallet postings or actual payouts. Case detail displays the latest decision.
3. Finance opens Refund Management, sees current signed balances, and enters 1–100 actual payout rows. A batch is atomic: one invalid row rolls back every payout, wallet posting, notification and request receipt. Each retry must retain its key and payload. Different payloads under one key fail.
4. `to_balance` subtracts the payout from Refund Balance and writes one CREDIT/REFUND into the existing `ledger_entries`, with source `REFUND_ACTUAL`. `to_bank` subtracts the payout and records free-text source/destination accounts, executed date, reference and evidence; it writes **no Client wallet entry**. Economic bank-outflow reporting uses the executed date; obligation movements use recording time.
5. Exceeding the obligation returns a warning and still records the payout. Negative Refund Balance stays negative without automatic recovery, Debt or Hold. Only Admin can `recover` some or all of the negative amount: one ADJUSTMENT_DEBIT in the wallet plus a positive refund event. Recovery cannot exceed the current overpayment.
6. Every decision/payout/recovery inserts durable in-app notifications for the Client and responsible Sales in the same transaction. Recipient-only acknowledgement is append-only and idempotent. No email/SMS transport is claimed.

The existing wallet ledger remains authoritative for Balance; `fc_*` balances are not enrolled or written by this adapter. Operational financial API now projects signed net Balance instead of the old unallocated-credit expression. Refund recovery is excluded from legacy service-fee/Statement receivable materialization; it is a financial movement, not a new service charge. A complete Statement snapshot of all movements is still pending.

## Roles and UI

| Role | Access |
|---|---|
| Admin | Current balances/history; Claim decisions/revisions; manual recovery; cannot execute Finance payouts |
| Finance | All Client balances, bank evidence, atomic payout sheet, refund report; cannot decide Claims or recover overpayment |
| BOD | Balances/history and refund report, no payout/recovery |
| Sales | Assigned Clients, own notifications; no bank accounts/evidence or payout/recovery |
| Client | Own balance/history and notifications; no bank accounts/evidence or mutation of money |
| Warehouse | Denied |

Finance/BOD enter through the new Refund Management tab. Admin/Sales/Client see Refund Balance in Balance Ledger. Current-balance rows stay compact; expandable history and notifications follow. Finance payouts use a horizontally scrollable sheet; Admin recovery only shows Client, amount and reason. Wallet/overview/ledger refresh after a payout or recovery in the same page.

`GET /api/refunds`: accessible balances and recipient notifications. `?client_id=`: authorized history. `?view=report&start=YYYY-MM-DD&end=YYYY-MM-DD`: BOD/Finance report.

`POST /api/refunds`: `to_balance`, `to_bank`, `recover`, `batch` (rows), `acknowledge` (notification ID). Money commands require request keys and positive integer cents; decisions allow zero. Bank payout date must be a valid completed/executed date, no future date. `POST /api/claims` action `finalize` now records/revises obligations and requires a request key.

## Records, audit and reporting

Additive tables: `refund_events`, `refund_receipts`, `refund_notifications`, `refund_notification_reads`. Update/delete triggers preserve all four histories and wallet rows linked by `refund_events.ledger_id`. One immediate transaction includes decisions, case audit/public notices, money, notifications and receipts. The old original Claim decision table is retained as legacy reference; it is never silently rewritten.

The dedicated BOD/Finance refund report separates sum of positive obligations and sum of negative overpayments. It reports actual Bank outflows and Balance refunds separately and includes event drilldown. Claim category revisions reverse the previous category's obligation and add the new category's obligation; category totals reconcile to signed Claim decision flow without double counting. The generic ledger/import helper rejects forged `REFUND_ACTUAL` and `CLAIM` source references; only the dedicated financial adapters write those sources. Clients with unreconciled old Claims are explicitly flagged as incomplete in reports and shown as “Chưa đối chiếu” in current-balance rows.

Control Tower's historical actual-claim-paid metric adds new actual payouts to legacy already-paid decisions, not new obligations. This is not completion of the requested full BOD financial dashboard.

## Migration and rollback

No operational DB was opened/reset for verification. Tests and browser fixtures create new independent databases and ignore operator DB environment variables. The browser seed script always creates a new `mkdtemp` database. Existing data provenance has not been established.

A Client with any legacy `claim_decisions` is **blocked from new financial Claim decisions and actual refunds/recoveries**. The UI marks migration required. This prevents guessing whether old automatic credits were executed payouts or duplicating them. No opening Refund Balance or automatic reinterpretation of old Claim ledger rows is inferred. A reviewed opening-balance migration plus consistent SQLite backup/restore rehearsal is still required for those Clients. Read-only history currently covers new events; historical already-paid amounts are not a newly established refund opening balance.

Before activation on a populated DB: verify environment/provenance; take and restore-test a consistent backup; reconcile Client obligations, legacy credits and actual payouts; implement explicit migration; verify projections; release the complete financial build. Do not reset a DB on the basis of a filename. Source rollback alone after actual payouts is unsafe: preserve append-only events and wallet links; reconcile before reverting handlers.

The guarded synthetic demo seeder was updated to seed a decision plus explicit actual Finance refund. It retains its existing provenance/environment/reset checks and backup. Its cleanup of new immutable refund tables is allowed only inside that verified synthetic reset workflow. No arbitrary-data migration/reset tool was added.

## Verification and open gates

See [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md). Domain/API assertions cover signed revisions, original receipts, bank versus Balance, warning-only overpayment, partial recovery, role/ownership restrictions, all-or-nothing batches, immutable wallet links, outbox failure rollback, private bank evidence, recipient acknowledgement, category/report parity and 40 retries over four independent SQLite connections.

Still required for the full build: operational Payment reconciliation/adjustment, one Debt account without Statement selection, full Statement snapshots/dispute/late-adjustment integration, unified financial reporting, reviewed historical cutover and complete cross-module UAT. Generic manual/import financial entry paths also need retirement/restriction as part of that cutover; the dedicated Refund API does not make those legacy paths compliant.
