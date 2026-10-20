# Orders, Draft & cấu trúc kiện

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
