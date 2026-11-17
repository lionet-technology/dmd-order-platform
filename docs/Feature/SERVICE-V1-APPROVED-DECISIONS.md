## Owner clarification — 17/11/2026 (supersedes earlier OPEN coverage notes)
- CONFIRMED: workbook Net for ePacket Standard/Eco already includes mid-mile + last-mile. Detailed component accounting is deferred to a later phase; it is not a V1 blocker and must not be added again to inclusive Net. Estimated workbook Net remains distinct from Supplier-approved Actual and finalized GP.
- CONFIRMED: Supplier cancellation/void policy and carrier evidence must be set up per service/route. Manual follow-up with Admin choosing a refund percentage/amount is approved. Values/evidence still need operational configuration; no default percentage, automatic carrier void or cost reversal follows from internal cancellation. Supplier money remains explicitly reconciled through its financial workflow.

## Claim / Supplier implementation — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md) records a partial VNĐ implementation of already approved Claim pool and Supplier actual/payable rules. No new formula, FX, allocation or permission decision is inferred. APPROVED remains distinct from delivered and pilot-accepted.

## VND continuation — 17/11/2026
Owner answered the remaining manual-offer Service-change decision: require explicit NEW_OFFER or AUTOMATIC selection, then price consent; retain existing reserve while pending. Decisions already approved are unchanged. Implementation status is now recorded in Feature 35.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

## Source update — 16/11/2026 final (2)
[Authoritative source index](SERVICE-V1-SOURCE-INDEX.md) supersedes earlier (1)(1), UPS Zone PDF and USD surcharge descriptions. Verified fixed-VND fees are 135000 / 285000 noncumulative oversize and 405000 non-cont, independent of FX. Source availability and fee-FX relation are CLOSED; operational integration requires separate verification.

## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

# Service Architecture V1 — Approved Decisions
Current requirements reviewed 16/11/2026. APPROVED means a business decision, not delivered code.
Primary source: [full attached handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md). [Implementation gap and evidence](31-service-v1-build-gap.md). [Earlier decision history](archive/SERVICE-V1-APPROVED-DECISIONS-BEFORE-HANDOFF-2026-11-16.md) is archived, not a second active specification.

## APPROVED
- One Order = one Service/Sub-Service and address; ePacket/Yun one carton, UPS/custom multiple cartons and Lots. Supplier/UPS accounts stay internal. Manual Quote is for custom routes; missing automatic prices are errors.
- VND wallet, Order, Ledger and reporting for V1, retaining fractional money. Sequential Base = Net × (1+mNB), Retail = Base × (1+mBR), Selling = Retail × (1−discount). No inferred initial FX/Fuel or real prices.
- Net Cost Markup and Base Cost Markup retain current published Selling until Review/Publish. Confirmed ePacket FX and UPS globals are exceptions: new Net/Base/Retail auto apply without publishing pending account edits. Purchased snapshots stay immutable.
- UPS full formula, divisor 5000, carton-then-Lot rounding, strict (min,max] tiers, FIXED ≤20 and PER_KG above20 after Lot rounding. Optimize full calculated Net; equal costs priority SDS→VTT→JD. Account/zone rates and no-rate errors follow handoff §3.
- Purchase checks eligibility, consent, Balance + Credit − Active Reserve. Insufficient funds means Awaiting Funds; FIFO by original confirmed request with atomic reserve/retry. No fabricated zero reserve for missing manual quote.
- Draft uses current quote. Consent is required for changed Selling on click/processing or while unissued Purchasing, not merely changed Net/account. Scoped Admin/Sales override is audited and cannot bypass eligibility/funds. Keep original reserve pending consent; swap only after successful financial recheck.
- Edit Order changes shipping/service only before any Tracking OR Label. Separate Edit Selling Price is a manual offer and cannot be silently overwritten; separate Add Tracking/Label. After charge, Selling correction appends delta Ledger/history without reopening Purchase/Fulfillment.
- Cancellation uses configured Service/Sub-Service/Supplier policy and current collected total Order revenue, including corrections/fees/taxes, less prior refunds. Before charge release reserve only. Shipment/historical handover denies cancellation even if a policy says otherwise. Admin may explicitly support100%; Claim refund is a separate approved/executed workflow.
- Cancel & Duplicate is Admin-only in the current explicit operational boundary; new linked Order is Purchasing, never Draft, with no copied issuance/reserve/charge/cost snapshot. Valid source cancellation stands if new price/funds are pending; true DB failure rolls back atomically.
- Financial Posting/Add-on/corrections/Balance Adjustment may exceed Credit Limit; do not auto-create Debt or remove existing reserves. Cost correction does not change Client Balance. Add-on revenue is revisable through delta correction, superseding the old absolute lock.
- Claim execution uses approved Client pool, separate bank/balance and partial payments; reject excess rather than clamp. Supplier actual payable/Claim receivable remain independent from Client refund or internal cancellation. Preserve statement history.
- Server-side RBAC covers object scope, APIs, exports, history and errors. Sales cost/supplier exception applies only to their Client Add-on, not transport Net/Supplier.

## IMPLEMENTED, STAGED, MISSING
[Feature23](23-service-architecture-v1.md) and [HEAD audit](31-service-v1-build-gap.md) define code status separately. Current delivery: per-route cancellation; atomic reserve hardening; staged UPS rules and existing pricing/FX backend. No full VND cutover, consent/FIFO, replacement, correction or Client Add-on delivery is claimed.

## OPEN / DEFERRED
Handoff §10 remains authoritative: exact Supplier cancellation/void policy, missing source rows/zone provenance, ePacket VND fee/FX relation and inclusive cost components, manual offer on Service change. BOD full-system target versus current explicit Admin-only cancellation inheritance needs reconciliation before broadening access. Do not invent rules or seed unverified values. No production access, Jenkins or deployment.
