# Edit Order V1 — partial hardening, integration blocked

## Continuation 16/11 — current status
[Feature 30](30-supplier-cancellation-followup.md) implements ordinary 100/90 cancellation with ADMIN-only 100% support and atomic pending Supplier follow-up. It supersedes the older unconditional 100% Duplicate requirement below. No BOD Duplicate permission. Cancel & Duplicate, unified edit/consent and Purchase/ledger VND remain incomplete. The source Excel has now been located at /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx; asking for its location again is unnecessary.
Reviewed 16/11/2026 at starting HEAD 312227e56030bce1437d2f5ec8750257bc75ac21, main, origin lionet-technology/dmd-order-platform. No production/Jenkins work.

## Confirmed target
[Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md#confirmed--owner-continuation-16112026-edit-order--replacement) records the complete Owner rule. Duplicate must enter a new processing Purchase Request, never Draft. Ordinary cancellation remains governed by route policy and cannot bypass Emergency Hold.

## Current change
`finance.upsertOrder`, `order-amendment.amendOrderBeforeTracking` and `order-shipments.saveOrderShipmentStructure` now reject edits when legacy Order tracking OR label is nonblank, even with no normalized tracking row. The amendment check runs inside its immediate save transaction before any supplied write callback. Existing normalized Tracking checks remain, including historical/replaced rows. Purchased-price SQL exception also requires blank legacy Tracking/Label. This closes a label-only edit gap; it does not activate the proposed replacement workflow.

Regression: `scripts/verify-purchase-consent.cjs` covers legacy tracking-only and label-only locks, amendment callback rejection, unchanged shipment/reserve/ledger state, existing normalized issuance and posted financial identity locks. Verification outcomes are recorded in artifacts/order-edit-v1-2026-11-16/VERIFICATION.md after execution.

## Verified integration gaps
- `route-pricing.ts` and `credit.ts` operational quotes/reserves are USD and integer cents. `service-v1-quote.ts` exposes VND selected-row previews with purchase_eligible=false and operational_cutover=false. It requires a caller-selected rate_key, not server shipment/weight/zone mapping.
- `order-amendment.ts` currently replaces an uncharged reserve and reprices immediately as ADMIN. It has no Price Confirmation Required state, Client reconfirm or scoped Sales override. Existing behavior is not the approved target.
- `/api/orders` Sales edits use upsertOrder directly; Admin uses amendment. UI still opens the existing editor; there is no unified Service-then-price confirmation session or Cancel & Duplicate UI/API.
- Current purchase idempotency uses Order snapshot/service_purchased_at and reserve Order ID. A distinct stable Purchase Request identity plus price-revision consent and supplier-execution guard is not implemented by this change. No replacement source-ID relation or processing command is introduced.
- Canonical 14/11 handoff explicitly lists missing operational VND integration and actual workbook acceptance. Owner now reports Work completed Excel; no matching handoff/commit has been identified in inspected repo. Owner clarified in this session: all operational prices are VND; ePacket Net input is USD converted through Rate USD–VND before sequential markups. The new Rate module/UI/API and selected-row quote conversion are implemented in Feature 29; the legacy operational Purchase path is not connected yet. Need to reconcile source mapping, published prices, surcharge coverage and financial cutover before enabling new VND purchase. Owner has now confirmed Admin-versioned Rate for new quotes/Purchases and 100% source refund for eligible Cancel & Duplicate, followed by the normal new-price financial flow. These are no longer open decisions. No guessed rates, FX, zero-value purchase, copied old snapshot or bypassed financial condition.

## Remaining work
Reconcile Work handoff; implement operational VND price and financial path; then unified atomic edit/consent, permissions, cancellation/replacement with transactional eligibility/idempotency, source linkage and processing Purchase Request. Add full API/UI and cancellation/duplicate/ledger race/retry/rollback regressions and browser acceptance. This document does not claim those features are delivered. A scoped implementation commit must not be described as complete rollout; required whole-flow gates remain pending.
