## VND continuation — 17/11/2026
UPS now uses the same VND consent/FIFO/reserve/one-time charge engine as automatic ePacket/Yun. Pricing refresh uses current published accounts and confirmed globals; published selling remains versioned. Missing price stays an Admin error; no zero quote or automatic Supplier send. Overdue VND Debt/Statement Credit Term block issuance/Purchase.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

## Final-source automatic Purchase increment — 17/11/2026
[Feature 34](34-service-v1-final-source-purchase.md) extends new-account VNĐ Purchase to ePacket Standard/Eco/EU and Yun via final Excel (2), existing Review/Publish and exact Reserve/FIFO/Charge. It supersedes earlier blanket statements that only Chuyên tuyến is admitted. UPS has a source resolver only; operational UPS, auto EU routing, Shipping Edit, Duplicate, Add-on and financial reporting cutover remain pending. [Source index](SERVICE-V1-SOURCE-INDEX.md) closes source identity and fixed-VND ePacket fee/FX relation only.

## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

## Atomic reserve hardening — 16/11/2026
reservePurchase now acquires an immediate write transaction even for direct calls. It verifies Order/Client ownership, treats an exact active reservation as idempotent, excludes only its own old reserve while checking a replacement and writes the new reserve plus audit atomically. Failed funds/eligibility/audit checks restore the old reserve. Completed/cancelled reserves cannot reopen. Existing caller quote/consent gates remain required.
verify-atomic-reserve.cjs exercises independent SQLite writer races for different Orders and same-Order retries, replacement room, ownership and audit rollback. This hardening preserves legacy USD cents; VND storage, retained pending revision/consent state, Awaiting Funds and FIFO are still missing. It is not a VND cutover.

## Current requirements — handoff 16/11/2026
[Canonical full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [audited HEAD gaps](31-service-v1-build-gap.md) supersede contrary dated requirements below. Earlier dated sections are historical where inconsistent, not concurrent current rules.
- APPROVED: cancellation policy per Service/Sub-Service/Supplier route; no global 90/100. Admin may support 100%, never bypass shipment denial. Claim refund is separate. Combined Duplicate uses policy with optional Admin support, not unconditional 100%.
- APPROVED: Edit Order shipping/service only before any Tracking OR Label; separate manual Edit Selling Price offer and Add Tracking/Label. Selling correction after charge appends delta/history without reopening Purchase.
- APPROVED: Add-on revenue correction replaces old absolute revenue lock. Financial posting/adjustment may exceed Credit Limit without creating Debt; Purchase still gates funds.
- APPROVED: VND fractional values retained; UPS divisor 5000, bands (min,max], priority SDS→VTT→JD. Global FX/UPS variables update new Net/Base/Retail without promoting pending account versions.
- IMPLEMENTED / STAGED / MISSING: use the linked HEAD gap, not old baseline tables. Operational USD is not VND simply by changing labels. Use the current source index and Feature 35/39 for resolved source, FX/fee, Service-change and inclusive ePacket Net decisions. Supplier-specific cancellation/void values and carrier evidence still require configuration; do not invent defaults.

## Owner Edit Order V1 — 16/11/2026
Confirmed target, current legacy issuance-lock hardening and remaining VND/consent/replacement gaps: [Feature 28](28-order-edit-v1.md). Duplicate must be a new processing Purchase Request, never Draft; existing cancellation policy still applies. Full workflow is not enabled by this change.

## Service V1 — Owner làm rõ 14/11/2026
Fulfillment V1 chính là quy trình xử lý Order/mua Supplier/Tracking–Label/Manifest/bàn giao. Mỗi Lot là một shipment mua UPS, Shipment Surcharge một lần/Lot; Order DMD gom các Lot gửi cùng một địa chỉ. Tiền VNĐ giữ số lẻ; không thay rounding cân. Đây là target CONFIRMED; luồng vận hành USD hiện hành và Purchased snapshots chưa chuyển đổi. Xem [spec](DMD_Order_Platform_Service_Architecture_V1_Specification.md).

## Purchase consent — 04/11/2026
Priced Client purchases require quote confirmation in the domain engine across bulk and legacy API paths. Missing/stale confirmation is a normal FAILED/DATA item, permitting Draft reload/Preview/reconfirmation. Accepted retry remains idempotent. Approved UPS/Chuyên tuyến unpriced service requests remain unchanged. [Exact contract and route limitations](03-service-route-pricing.md#client-confirmation-enforcement--04112026). Tests: `verify-purchase-consent.cjs`, existing bulk/linked regressions.

## Owner continuation — 25/10/2026
Current Sales snapshots, BOD monthly trends and Statement batch close: [approved behavior and integration](20-sales-monthly-close.md). This delta supersedes conflicting historical notes below. No background scheduler is configured.

# Mua đơn & xử lý thất bại

## Owner continuation — 22/10/2026 (current delta)

See [implementation, debt-age assumptions, test evidence and explicit remaining gates](OWNER-EXECUTION-2026-10-22.md). Five horizontal financial task tabs; read-only financial GETs; deterministic frozen-period debt aging; Tracking/Label before manual price; price/finalization gate; auditable partial-label override; server Ledger pagination. This delta supersedes contrary historical behavior below. No deployment or full production acceptance.


## UPS/chuyên tuyến không có giá tự động — Owner 20/10/2026
Client chỉ **gửi yêu cầu mua/đặt dịch vụ** chưa biết giá và không phát sinh Reserve/Charge. Khi Admin cấp Tracking/Label, phải ghi giá bán tổng Order (USD, chính xác cents). Gate Balance/Credit/Hold/overdue Debt áp dụng khi biết giá trước bất kỳ Tracking nào; nếu không đủ tiền, rollback toàn bộ Order update/Tracking/Reserve. Admin ghi Reserve một lần; Label đầu tiên chuyển thành Charge qua `completeReserve` (không nhân Carton, retry không charge lại). Đơn chưa có giá không được dùng Tracking insertion từ endpoint khác để vượt gate. Supplier Net Cost và Purchase Template tách biệt. Đây là phương án manual GĐ1, không phải giá UPS auto. Evidence và giới hạn: `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.


## Owner financial update — 20/10/2026

Approved target: Client partial-success bulk purchase, explicit failed-Draft reselection, no auto retry; READY requires purchased/reserved, complete data/template and no Hold, without another balance check. Only overdue Debt and independent locks block; Statement paid/unpaid does not. Current application integration remains pending. See [approved rules](OWNER-FINANCE-2026-10-20.md) and [verification/migration/UAT](VERIFICATION-FINANCIAL-CORE-2026-10-20.md).

## Delta 18/10/2026
Purchase mới ePacket Standard/Eco DMD bị chặn nếu version active thiếu Base Rate do Owner nhập; không tự đổi Net thành Base. Snapshot lịch sử không repricing. Gate Base Rate cho luồng manual UPS/Yun/custom vẫn chưa hoàn tất, không tự tuyên bố áp dụng toàn GĐ1.

## Chốt nghiệp vụ 13/10/2026 — TARGET
- Draft không ảnh hưởng sức mua. Accepted Purchase **Reserve** giá phải thu, chưa ghi Charge. Khi event đủ điều kiện → **Charge một lần**, đồng thời giải phóng reserve tương ứng; failure/cancel trước Charge → release reserve. Sau Charge áp dụng hoàn/huỷ riêng.
- Config route có `charge_trigger`: **TRACKING_AND_LABEL** cho ePacket, UPS, YunExpress và Express; **ETD_REACHED** cho Cargo; **USAGE_RECORDED** cho Scan Active/Relabel.
- Tracking/Label không phải điều kiện charge phổ quát. ETD phải có nguồn thời gian hợp lệ; usage event phải có source ID/idempotency key. Giai đoạn 2 mới tích hợp source Label production; Cargo giai đoạn 3.
- Retry, update tracking, duplicate webhook không được charge hai lần; reserve + ledger/credit cập nhật cùng transaction.
- **AS-IS/TO-BE GAP:** code versioned hiện có reserve và tracking+label charge, nhưng chưa xác nhận framework trigger Cargo/usage; tài liệu cũ nói charge tại Purchase không được dùng làm target.


**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Preview/validation Draft trước khi mua; hệ thống kiểm tra quyền client, route, hold, trọng lượng/kiện, hạn mức và trạng thái.
- Mua hàng loạt dùng giao dịch nguyên tử theo mô tả ePacket: batch không hợp lệ rollback toàn bộ; tránh mua trùng bằng cơ chế idempotency.
- Phiên bản tài chính mới có reserve khi mua đang chờ, ghi charge khi tracking + label được cung cấp; thất bại/huỷ giải phóng reserve. Admin có nghiệp vụ retry theo quy định.
- Tài liệu cũ `docs/legacy-logic/epacket-pricing.md` mô tả trừ charge ngay khi purchase; cần đối chiếu với logic `docs/legacy-logic/operations-finance.md` mới hơn trước khi điều chỉnh tài chính.
## Điểm kiểm tra
- Partial failure, retry, concurrency, balance không đủ, quyền Sales, không để lộ Net Cost cho Client.
## Nguồn
- `src/app/api/purchase-jobs/`, `src/lib/credit.ts`, `src/lib/route-pricing.ts`, `scripts/verify-purchase-engine.cjs`, `scripts/verify-credit.cjs`.
## Cần xác nhận
- Màn retry/filter Draft và thời điểm thu tiền cuối cùng theo từng loại purchase legacy/versioned.

## Cập nhật 14/10/2026 — Debt gate
- Purchase gọi credit gate hiện hành: Debt/statement quá hạn block, không bypass bằng credit limit.
- Chuyển receivable sang một active Debt giải phóng room không tạo Payment; trả Debt không tăng room lần hai. Xem [Finance](./08-finance-balance.md).
