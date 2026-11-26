## Current requirements — handoff 16/11/2026
[Canonical full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [audited HEAD gaps](31-service-v1-build-gap.md) supersede contrary dated requirements below. Earlier dated sections are historical where inconsistent, not concurrent current rules.
- APPROVED: cancellation policy per Service/Sub-Service/Supplier route; no global 90/100. Admin may support 100%, never bypass shipment denial. Claim refund is separate. Combined Duplicate uses policy with optional Admin support, not unconditional 100%.
- APPROVED: Edit Order shipping/service only before any Tracking OR Label; separate manual Edit Selling Price offer and Add Tracking/Label. Selling correction after charge appends delta/history without reopening Purchase.
- APPROVED: Add-on revenue correction replaces old absolute revenue lock. Financial posting/adjustment may exceed Credit Limit without creating Debt; Purchase still gates funds.
- APPROVED: VND fractional values retained; UPS divisor 5000, bands (min,max], priority SDS→VTT→JD. Global FX/UPS variables update new Net/Base/Retail without promoting pending account versions.
- IMPLEMENTED / STAGED / MISSING: use the linked HEAD gap, not old baseline tables. Operational USD is not VND simply by changing labels. Use the current source index and Feature 35/39 for resolved source, FX/fee, Service-change and inclusive ePacket Net decisions. Supplier-specific cancellation/void values and carrier evidence still require configuration; do not invent defaults.

## Owner Edit Order V1 — 16/11/2026
Confirmed target, current legacy issuance-lock hardening and remaining VND/consent/replacement gaps: [Feature 28](28-order-edit-v1.md). Duplicate must be a new processing Purchase Request, never Draft; existing cancellation policy still applies. Full workflow is not enabled by this change.

# Orders, Draft & cấu trúc kiện

## Owner continuation — 28/10/2026
Manual Order entry is capped at 20 rows in Client and Admin/Sales UIs, including paste/add/clone/Enter. Oversized paste is rejected whole. Admin/Sales use `/api/orders/manual-batch` (1–20 rows, existing per-row authorization, partial successes retained). Client JSON preview/save rejects >20 Orders regardless of a caller-supplied source flag. Larger imports use multipart CSV/XLSX, reparsed on preview and save; manual cap does not affect imported Orders or purchase selection (up to 1000). No advanced sheet selection/fill/undo/arrow navigation. Tracking/Refund/other EntrySheet paths are unchanged.


## UI follow-up — 23/10/2026
Tracking/Label save keeps its success notice after reloading and refreshes the Admin action queue through the shared financial update event. Unpriced and partial-Label actions open the relevant Order directly. Late-price purchasing semantics remain as approved on 22/10. Browser mobile completion and HTTP concurrency evidence: [verification](VERIFICATION-BALANCE-DEBT-SPLIT-2026-10-23.md).

## Owner continuation — 22/10/2026 (current delta)

See [implementation, debt-age assumptions, test evidence and explicit remaining gates](OWNER-EXECUTION-2026-10-22.md). Five horizontal financial task tabs; read-only financial GETs; deterministic frozen-period debt aging; Tracking/Label before manual price; price/finalization gate; auditable partial-label override; server Ledger pagination. This delta supersedes contrary historical behavior below. No deployment or full production acceptance.


## Client nhập tay 20/10/2026 — tạm thời UPS/chuyên tuyến
Chỉ với Route được phép nhiều Carton, màn Client hiển thị chọn **Single Carton** (mặc định) / **Multiple Cartons**. Nhập Order recipient/address một lần, khai Carton 1 trên sheet và bổ sung từng Carton bằng form chi tiết; tự tăng `Carton Quantity`, không bắt Carton No. ePacket/Yun không hiện chế độ nhiều Carton. Định dạng Excel vẫn yêu cầu ID từng dòng, Quantity chỉ dòng đầu. Client được lưu Draft và gửi Order chờ Admin nhập tổng giá bán; lúc đó chưa tạo Reserve/Charge. Preview có trạng thái riêng **Chờ Admin nhập giá**, không hiển thị 0 USD như đã chốt giá. Sau khi Client xác nhận gửi, không cho sửa dữ liệu Order/Carton nữa trừ khi xử lý nghiệp vụ bằng Admin. Chưa phát hành API multi-carton công khai (deferred theo Owner). Test source/API ghi ở `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.


## Chốt nghiệp vụ 13/10/2026
- Một Order có **duy nhất một địa chỉ giao**. Không mở rộng thành nhiều điểm đến hoặc triển khai lịch giao riêng cho từng Lot.
- Giữ hỗ trợ nhiều Lot/Carton nếu có trong domain, nhưng luồng mặc định 1 Order = 1 Lot = 1 Carton phải ít thao tác nhất.


**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Order chứa thông tin địa chỉ nhận; có thể gồm nhiều carton/lot, tối ưu UI cho trường hợp một carton.
- Draft lưu trước khi mua; cần kiểm tra hợp lệ dữ liệu, service, sub-service, supplier, trọng lượng và giới hạn route.
- Order được quản lý xuyên nhập liệu, chỉnh sửa, tracking, shipment structure, history; thao tác đã mua bị hạn chế tùy trạng thái.
- Các lô trong cùng Order dùng chung supplier và sub-service theo quyết định nghiệp vụ; mỗi lô có tracking và carton tương ứng.
## Điểm kiểm tra
- Không mua trùng khi retry; không tự merge Order ID trùng nếu mơ hồ.
- Validation cả ở nhập tay, paste/import và backend; lịch sử chỉnh sửa không biến mất.
## Nguồn
- `src/app/api/orders/`, `src/app/api/drafts/`, `src/lib/order-operations.ts`, `src/lib/order-shipments.ts`, `scripts/verify-order-flow.cjs`.
## Cần xác nhận
- Dạng lot/carton trên mọi route; một số logic trong `docs/legacy-logic/logic.md` thuộc MVP cũ.

## Delta lượt tiếp tục 16/10/2026
API cấp tracking từ chối Lot nhập khác Lot của Carton thay vì âm thầm ưu tiên carton. Khai báo Carton/Lot trước cấp tracking; transaction rollback khi xung đột. Regression HTTP cập nhật fixture hai Lot đúng cấu trúc.


## View VNĐ từ Orders

Admin, Sales và Client mở Chi tiết Order từ dòng đã chọn. Chi tiết tải theo Order ID. Nút Quay lại danh sách giữ từ khóa, bộ lọc và trang đang xem. Client chỉ xem Order của mình. Sales chỉ xem Order của Client đang được phân công. Giữ quyền truy cập tại API chi tiết, kể cả khi gọi trực tiếp bằng Order ID.

Tổng quan hiển thị giá và trạng thái mua. Giao dịch VNĐ hiển thị các bút toán cước, điều chỉnh cước, phụ phí, thuế và hoàn do huỷ gắn với Order. Các số tiền hiển thị theo chuỗi thập phân từ hệ thống VNĐ. Số hoàn trên Order đã huỷ lấy từ bút toán hoàn đã ghi. [Kiểm chứng Chrome và HTTP](../../artifacts/gd1-operational-uat-2026-11-26/order-detail-fix/VERIFICATION.md).
