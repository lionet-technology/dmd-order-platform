# Feature 33 — Operational VNĐ: Chuyên tuyến Manual Purchase
**Status: Implemented bounded slice; V1 remains PARTIAL.** Reviewed 2026-11-16 from remote/local e74a0eac13d21f461c2d16d514e61bb226cc2b9a.
Code / tested source commit: **00aae8158f9715aaecbb21b012bc258144de7239**, pushed fast-forward to origin/main. Final gates:55 suites incl63 VNĐ assertions, typecheck, lint, isolated build PASS.

[Approved handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) · [Evidence](../../artifacts/service-v1-vnd-operations-2026-11-16/VERIFICATION.md).

## Scope and data boundary
This increment runs real Orders, declared Cartons, existing Tracking/Label handlers, configured cancellation policy and Supplier cancellation queue against an exact VNĐ ledger. It is not another arithmetic preview.
Admin/BOD explicitly opens a VNĐ account only for a Client with **no Orders, ledger, reserves, Debt or legacy Credit Limit**. No existing account is converted and no deployed data is reset. Activation cannot be silently reversed. The legacy USD ledger, reserve, Debt and account-financial commands reject VNĐ writes/reads rather than rounding or displaying USD amounts as VNĐ.
Only **Chuyên tuyến Manual Quote** is admitted in this increment. No fabricated zero quote/reserve is created for missing prices. Automatic services remain on their pre-existing path; new VNĐ accounts cannot use that incomplete integration.

## User flow / API
- Login normally, open **Chuyên tuyến · Sổ VNĐ** in the sidebar or `/vnd`. BOD/Finance may also navigate directly to this page.
- Open an empty Client account as VNĐ before creating Orders. Create shipping declarations through existing Orders/client entry. The Client entry panel reads the canonical VNĐ Balance and links Purchase to the VNĐ workspace.
- `POST /api/service-v1/operations`: `activate` (credit_limit decimal string), `request` (order_id), `offer` (amount, expected_revision, reason), `consent` or `override` (expected_revision), `post` (kind PAYMENT/ADJUSTMENT, signed delta, reason), `credit_limit` (amount, reason), `correction`, `surcharge`, `tax` (Order, amount, reason).
- Every operation requires client_id and request_key. Decimal money travels/stores as canonical **strings**, never REAL/cents. Equal actor/key/payload returns the original result; changed payload/key ownership rejects. A UI retry retains its key; “Bắt đầu thao tác mới” starts a distinct transaction.
- `GET /api/service-v1/operations?client_id=…` returns a consistent read snapshot of exact Balance, Credit, active Reserve, room, Requests and latest 200 ledger/history rows. Ledger totals include all rows.
- Add Tracking/Label remains the existing Admin endpoint `/api/orders/[id]/trackings`. Each Tracking must identify its declared Carton. All Cartons need an ACTIVE Tracking and Label before the single debit; partial coverage does not charge or accept the legacy partial override.
- Cancellation remains `/api/orders/[id]/cancel`, same route/stage policy and unconditional shipment/handover prohibition.

## Purchase, consent and FIFO
Request states: AWAITING_QUOTE → PRICE_CONFIRMATION_REQUIRED → AWAITING_FUNDS / RESERVED → CHARGED; cancellation may stop a pending request. The Order remains in Purchasing, never reverts to ordinary Draft.
The stable, serialized Request ID orders FIFO by original Purchase confirmation. Each ledger/credit change, consent, correction, charge and cancellation reevaluates pending requests internally; no carrier API is called.
Eligibility includes active Client, purchase lock, active/lifecycle Route, Client service assignment, Case/warehouse/route hold, required destination data and declared Carton/count/weight/volume. New VNĐ Debt creation is deliberately unavailable, so no legacy Debt is reinterpreted.
Offer revision is order-specific and separate from any automatic engine. Client confirms exact current revision; Admin/scoped Sales override requires reason and is audited. Neither bypasses eligibility/funds.
Changing an unissued offer retains the old reserve while consent or extra funds are pending. The accepted replacement excludes only its own prior reserve during the single immediate transaction. Financial postings never discard an existing accepted reserve or auto-create Debt. A later new Purchase waits if room is insufficient.
Technical failure rolls back the whole command, its ledger, FIFO changes and receipt. Expected ineligibility persists history rather than silently advancing issuance.

## Financial corrections / cancellation
Order price after charge changes by a signed ORDER_CORRECTION delta. Original ORDER_CHARGE is immutable; correction does not reopen fulfillment or ask Client consent. Surcharge and tax are separate obligations. These postings may take Balance below Credit Limit, with negative room visible; subsequent Purchase still gates funds. Original charged_offer and revision/history remain.
Cancellation computes exact configured percentage from current collected Order charge + signed corrections + surcharge + tax, less previous cancellation refunds. No precharge money refund: only release reserve. Admin support100 cannot bypass policy denial/shipment boundary. Internal tracking cancellation and independent Supplier PENDING queue commit atomically; no automatic carrier void/Supplier refund/cost reversal. Claim refunds are not cancellation refunds.

## Roles and protection
Admin: activation, Purchase/offer/override/correction and Tracking/Label. BOD: new-account activation and financial posting/read in this slice. Finance: financial posting/credit/read. Sales: only assigned Clients, Purchase/offer/override/Order posting. Client: own Request/consent/read/cancel; cannot post money or override consent.
Role and active user are re-read server-side; object scope applies before replay. Public projections redact private supplier names in notes/history. No transport Net/Base/Supplier/account appears in the VNĐ workspace.
Shipping edits after Request are conservatively rejected in this slice; separate Shipping Edit with retained-reserve revision is **still missing**, not simulated by direct overwrite.

## Storage / source / tests
- `src/lib/vnd-operational-schema.ts`: separate explicit account, request, append-only ledger, command receipt/history and legacy-path guards.
- `src/lib/vnd-operational.ts`: exact money, eligibility, consent/FIFO/charge/correction.
- Existing route-pricing, credit completion, Order/Carton guards, cancellation and Tracking handlers dispatch VNĐ without legacy money conversion.
- `scripts/verify-vnd-operations.cjs`: 63 assertions incl fractional end-to-end money; old reserve, stale consent, partial/full label, excess-credit posting, refund of corrected revenue, cancellation/command rollback, API role/object scope, legacy isolation, shipment denial and precharge no-refund.
- `scripts/vnd-race-worker.cjs`: independent SQLite writers concurrently retry Payment and completion; one ledger posting, oldest eligible Request first, no overspend.
All fixtures/prices/policies are explicitly TEST; no real Supplier values were invented.

## Remaining delivery / rollout limits
No general activation or production readiness is claimed. No existing Client migration, full automatic price/weight/zone resolver, UPS/ePacket/Yun VNĐ operational Purchase, price-engine consent on publication, VNĐ Debt/interest/Statements/monthly reports/claims/Supplier accounting integration, Payment reconciliation/bank evidence, Shipping Edit session, Cancel & Duplicate, Client Add-on or browser role UAT is delivered here.
The dedicated exact ledger is authoritative for this bounded slice; legacy Statements/reports do **not** include VNĐ money and must not be used to certify this account’s finances. No fake cents/REAL compatibility values are written into legacy Order totals. Main Order tables link to the VNĐ book rather than show fabricated USD totals.
Follow-on cutover must extend the canonical VNĐ journal to those modules and reconcile period snapshots/reports on a disposable target before broader activation. No Jenkins, deployment, carrier API or production was touched.
