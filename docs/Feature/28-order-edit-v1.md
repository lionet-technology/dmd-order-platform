## VND continuation — 17/11/2026
Separate Admin shipping edit is implemented for VND Draft/Purchasing before any Tracking OR Label, including carton/Lot changes and explicit China region. After a manual offer, the confirmation dialog shows the current offer and the proposed Service's automatic price. Admin chooses to keep the offer or apply the automatic price, then the Client confirms the new revision. Keep the prior reserve during pending consent/funds. Existing offer, post-charge correction and Tracking/Label operations remain separate.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

## Current requirements — handoff 16/11/2026
[Canonical full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [audited HEAD gaps](31-service-v1-build-gap.md) supersede contrary dated requirements below. Earlier dated sections are historical where inconsistent, not concurrent current rules.
- APPROVED: cancellation policy per Service/Sub-Service/Supplier route; no global 90/100. Admin may support 100%, never bypass shipment denial. Claim refund is separate. Combined Duplicate uses policy with optional Admin support, not unconditional 100%.
- APPROVED: Edit Order shipping/service only before any Tracking OR Label; separate manual Edit Selling Price offer and Add Tracking/Label. Selling correction after charge appends delta/history without reopening Purchase.
- APPROVED: Add-on revenue correction replaces old absolute revenue lock. Financial posting/adjustment may exceed Credit Limit without creating Debt; Purchase still gates funds.
- APPROVED: VND fractional values retained; UPS divisor 5000, bands (min,max], priority SDS→VTT→JD. Global FX/UPS variables update new Net/Base/Retail without promoting pending account versions.
- IMPLEMENTED / STAGED / MISSING: use the linked HEAD gap, not old baseline tables. Operational USD is not VND simply by changing labels. Use the current source index and Feature 35/39 for resolved source, FX/fee, Service-change and inclusive ePacket Net decisions. Supplier-specific cancellation/void values and carrier evidence still require configuration; do not invent defaults.

# Edit Order V1 — partial hardening, integration blocked

## CONFIRMED — Owner answers 16/11/2026: pending Edit and Duplicate failure
Source: direct Owner answers in this continuation; these decisions supersede the earlier proposal to rollback the source cancellation when the new Purchase lacks price/funds.
- Edit after Purchase but before any Tracking/Label: keep the original Reserve while awaiting Client confirmation and block issuance. On Client confirmation (or authorized Admin/scoped Sales override), validate the proposed revision and current Balance/Credit/Debt gates before atomically replacing the Reserve. Insufficient funds leaves the revision pending and preserves the original Reserve.
- Cancel & Duplicate: cancel/refund the original under the common 100/90/ADMIN-support policy and create one source-linked replacement in PURCHASING / PURCHASE REQUESTED. If the replacement lacks a valid price or sufficient purchasing room, retain the source cancellation and replacement with an explicit pending reason. Do not roll back the source merely because the new Purchase is financially ineligible.
- A pending replacement is not an accepted Supplier purchase: do not fabricate a zero-price quote, copy the old quote/account or write a new Reserve/Charge to force processing. Retain a stable request/source relation; retries cannot cancel/refund the source or create a replacement twice. Supplier execution waits for a valid current quote and the normal financial gate. An unavailable automatic price remains a pricing issue, not an implicit extension of manual Awaiting Quote eligibility.
- Source Supplier cancellation follow-up remains PENDING independently of replacement purchase or Client refund. No automatic Supplier cost/refund.
Implementation status: approved target only; the pending-edit and Cancel & Duplicate commands are not yet delivered by the documentation update.

## Continuation 16/11 — current status
[Feature 30](30-supplier-cancellation-followup.md) implements ordinary 100/90 cancellation with ADMIN-only 100% support and atomic pending Supplier follow-up. It supersedes the older unconditional 100% Duplicate requirement below. No BOD Duplicate permission. Cancel & Duplicate, unified edit/consent and Purchase/ledger VND remain incomplete. The source Excel has now been located at /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx; asking for its location again is unnecessary.
Reviewed 16/11/2026 at starting HEAD 312227e56030bce1437d2f5ec8750257bc75ac21, main, origin lionet-technology/dmd-order-platform. No production/Jenkins work.

## Confirmed target
[Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md#confirmed--owner-continuation-16112026-edit-order--replacement) records the complete Owner rule. Duplicate must enter a new processing Purchase Request, never Draft. Ordinary cancellation uses the latest Owner 100/90/ADMIN-support/shipped-deny policy and cannot bypass Emergency Hold.

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

## Xác nhận đổi Service khi có offer

Thao tác Edit tính giá cho dữ liệu vận chuyển, vùng China và kiện/Lot sau chỉnh sửa. Hộp thoại hiển thị offer hiện hành, giá tự động hoặc lý do thiếu giá. Admin chọn giữ offer hoặc áp giá tự động. Tuyến Manual Quote cho phép giữ offer. Tuyến tự động cần báo giá hợp lệ. Mỗi lần xác nhận kiểm tra revision và tính lại hai mức giá trên server. Nếu giá đã đổi, Admin xem và chọn lại. Lần hiện hộp thoại và nút Quay lại không ghi thay đổi, hàng đợi hay bút toán.

Sau khi lưu, offer giữ lại là mức giá cấp Order. Chi phí ước tính theo tuyến cũ và chi tiết mức giá theo Lot vẫn tra được trong lịch sử báo giá. Client cần chấp thuận revision mới kể cả khi số tiền giữ nguyên. Reserve cũ vẫn có hiệu lực trong lúc chờ consent hoặc chờ sức mua. Chỉ thay Reserve trong giao dịch nguyên tử sau khi đủ điều kiện. Khi đã từng có Tracking hoặc Label, Edit bị khóa ở server.
