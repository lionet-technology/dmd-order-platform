# Finance and operations rollout

Runtime: Node 20.20.2 (`.nvmrc`). The existing unfinished UI changes were preserved in a separate commit before phase work.

## Phase 1 — Financial backbone

`/api/financials` exposes weekly Monday–Sunday statements, FIFO payment allocation, Admin allocation overrides, Admin-only debt restructuring/deadline extension, credit limits/terms and purchase locks. Debt items remain visible to Client. Default credit limit is zero and default term is 14 days after period end. A period or debt is overdue only after its deadline. Debt excluded from purchasing utilization still blocks new purchases when overdue. Additional fees support date, quantity and unit price in USD; Sales may charge their assigned clients. Sales may enter payments, but cannot issue refunds/credits. Payments are credited immediately; Admin rejection creates an auditable reversal and releases their allocations.

Versioned purchases reserve room without debiting ledger, charge when tracking and label are recorded, release reserve on failure/cancellation, and re-reserve on Admin retry. Transactional checks prevent over-reservation and duplicate charges. Sales may purchase a versioned service for an assigned client through `/api/purchase-jobs`; the response hides Net and pricing internals. Legacy purchase generation also checks financial blocking. Existing historical legacy charges remain intact; reconciliation changes to their statement items are audited rather than silently discarded.

## Phase 2 — Cases and holds

`/api/cases` provides bulk Order cases with independent kind/status, public/internal visibility, severity, owner, deadline, next action and replies. Hold cases block purchase and warehouse packing/outbound through the existing guards without replacing the primary Order lifecycle. Admin releases holds. Client sees public cases for their own Orders; Sales sees assigned clients; supplier recovery financial events are Admin-only. Resolved claims cannot be reopened to pay twice.

## Phase 3 — Inbound and measurement

`/api/inbound` matches tracking, DMD ID and client Order ID. Ambiguous/unmatched scans retain unidentified inventory. Admin/Sales match inventory to accessible Orders; Warehouse/Admin records carton measurements. Measurements do not overwrite declared or purchased pricing. Higher versioned billing tiers create pending adjustments using the frozen pricing versions; the Client receives a public notice before Sales/Admin approval charges the fee. Routes without a versioned price enter an actionable case queue and Sales/Admin can quote a manual adjustment, then approve it. No automatic refund is generated for a lower tier.

## Phase 4 — Claims and supplier recovery

A public Client Claim may span Orders; opening it never changes Balance or suspends billing. Admin finalization separately records shipping refund and compensation once. A payout claim must belong to one Client, and shipping refunds are bounded conservatively by charges remaining after earlier refunds on overlapping Orders. Supplier recovery is a separate Admin-only receivable with expected/recovered amounts, references, status, deadlines and audit. Receiving supplier money does not credit Client Balance.

Cancellation that would refund money now creates an idempotent approval request for Client/Sales. Admin re-evaluates the existing cancellation boundary and finalizes the refund. Reservations with no charge can be cancelled without creating money. `/api/cancellation-requests` and Control Tower expose the Admin approval queue.

## Phase 5 — Control Tower and role UIs

`/api/control-tower` and the Control Tower sidebar expose role-scoped failed purchases, open holds, due cases, overdue claims, pending weight adjustments, unidentified inventory, overdue accounts, supplier responses and cancellation approvals. Finance totals separate ledger balance, reserves and remaining receivables. Admin sees claim payouts, recoveries and net loss.

New Client Quality groups fixed monthly cohorts by first successful purchase, matures after 60 days, and measures revenue in the latest 30 calendar days. Qualified revenue belongs to clients whose weighted margin meets the company's weighted margin in that same window. Target revenue share is at least 20%; absent revenue returns no fabricated percentage.

## USPS cleanup

The Supplier ZIP text area was removed. New surcharge configurations clear custom ZIP additions and use USPS domestic non-continental/military state and prefix recognition, including ZIP+4. The default charge remains USD 15/order. Existing purchased pricing snapshots are preserved.

Sources: https://about.usps.com/what/performance/service-performance/zip-3-by-area-district.htm and https://about.usps.com/postal-bulletin/2016/pb22432/pb22432.pdf

## Verification and operation

Run `npm run verify:credit`, `npm run verify:operations` and the existing regression scripts under Node 20. HTTP suites require an isolated server/database and the `e2e-order-api.cjs` fixtures. `npm run e2e:operations` checks the new API role boundaries. Browser smoke checks cover Admin financial statements/queues, Sales scope/payout restrictions, Client public claim/read-only financial controls, and a Warehouse unidentified scan on the mobile layout. Temporary servers must be stopped after tests.

## Consolidated pending_decisions

- Automatic default SLA durations by case type remain unset; operators supply case deadlines. Decide standard response/resolution durations if automatic deadlines/escalation are desired.
- Supplier reconciliation of inclusive oversize/tax feeds, multi-currency/FX, a dedicated Finance role, external client API and real East/West segmentation remain the previously deferred scope. Admin currently exercises the approved Finance authorities.
- Legacy billing records retain their historical charge timing. Decide a separately audited historical migration/backfill before converting old draft charges to the new reserve lifecycle; no existing ledger money was rewritten during rollout.

No interactive approval step was rejected or skipped in this run. No temporary test data was seeded into the real database.
