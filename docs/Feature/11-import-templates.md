# Import, mẫu mua & export

## Cập nhật 20/10 — Manual UPS/chuyên tuyến
File Client vẫn 1 dòng = 1 Carton và Quantity chỉ dòng đầu. UPS/chuyên tuyến cho tạo Draft khi chưa có bảng giá, Admin nhập giá bán tổng Order lúc cấp Tracking/Label. Export/Import sheet Tracking có thêm cột **Giá bán thủ công (USD/Order)**, chỉ đặt giá ở dòng đầu Order. Client nhập tay chọn Single/Multiple Cartons nếu Route cho phép; API public mới hoãn. File Supplier Purchase Template vẫn là cấu hình riêng, không giả lập template generic khi thiếu. Xem `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.


## Client Excel multi-carton — 20/10/2026 (implementation slice)

Owner chốt: **một dòng Excel = một Carton**, mọi dòng bắt buộc `Client Order ID`, các mã trùng chỉ được liền nhau, không gom ngược qua Order khác. `Carton Quantity` **bắt buộc ở dòng đầu Order, để trống ở mọi dòng sau**, phải bằng đúng số dòng Carton; không yêu cầu Carton No. Hệ thống tự đánh số Carton theo thứ tự; nhiều Carton mặc định chung Lot 1. Các dòng sau có thể bỏ trống trường người nhận/địa chỉ nhưng dữ liệu được lặp không được mâu thuẫn với dòng đầu. Dòng nào nhập sai thì cả Order bị chặn lưu; không tạo một phần Carton. Để sửa, khách sửa workbook và upload lại.

`client-carton-groups.ts` nhóm tuần tự, Client file upload của `/api/client-orders` gọi normalizer trước khi preview; `save` tái kiểm nhóm Carton chống can thiệp payload và ghi cấu trúc Order/Carton/Lot trong một transaction. Không nhân bản Order/Ledger theo dòng Carton. Route có đúng một tham số `max_cartons_per_order` mặc định 1; `carton-policy.ts` kiểm cả Client Import, lưu Carton và Purchase; ePacket và Yun buộc 1 kể cả cấu hình cũ bị sai. UPS/chuyên tuyến chỉ multi khi Admin tăng giới hạn. Giá tự động cho UPS/chuyên tuyến chưa có rule được duyệt vẫn **fail closed**, không suy tính từ carton đầu hay ePacket. `Carton Quantity` trong API/nhập tay trước mắt chỉ hợp lệ khi có đúng danh sách carton khớp; API nested/carton editor hoàn thiện tiếp. Supplier template vẫn được xuất riêng sau khi Order chuẩn được ghi.

**Verification:** `scripts/verify-client-carton-groups.cjs` và `scripts/verify-client-carton-api.cjs` là regression độc lập trên DB synthetic; xem `VERIFICATION-CLIENT-CARTON-IMPORT-2026-10-20.md`, không phải browser UAT toàn luồng hay giá UPS thực tế.


## Delta 18/10/2026
Supplier Cost Excel chỉ BOD/FINANCE. Không cấp họ import Orders/Balance/Tracking. File tối đa 10 MB. Net Cost không được xuất qua lot.net_cost hoặc placeholder ngoài allowlist trong template vận hành. API JSON có projection bảo vệ cost cả list/detail/mutation và chuỗi JSON lồng.

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Nhập Excel là đường bulk/migration, không thay thế nguồn Order chuẩn; mẫu theo vai trò và module.
- Admin quản lý template mua theo route và phiên bản; mapping dùng trường dữ liệu của Order/lot; template preview/download/export cần giữ nguyên khả năng mở trong Excel.
- Các workbook có validation name #REF! phải được xử lý khi sinh file để tránh Excel repair, không làm thay đổi file gốc.
- Export manifest phải kiểm route, trạng thái carton và điều kiện kho; không tự chọn template generic thay cho template cấu hình route theo yêu cầu nghiệp vụ.
## Nguồn & kiểm tra
- `src/lib/importers.ts`, `src/lib/purchase-templates.ts`, `src/app/api/import/`, `src/app/api/purchase-export/`, `src/app/api/purchase-templates/`, `src/app/api/manifest-export/`, `scripts/verify-purchase-engine.cjs`.
## Cần xác nhận
- Danh sách mapping bắt buộc cho từng supplier; file Excel thực tế cần acceptance check ngoài parser.
