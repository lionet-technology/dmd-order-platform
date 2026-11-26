# GĐ1 · UI/UX Acceptance Checklist · 26/11/2026

So sánh bản gốc `9eac15fcc9295cb596d7a2c2ee3a318b6819e398` và bản sửa, chạy ứng dụng trên localhost với SQLite TEST riêng. Dữ liệu workload gồm 570 Order và 500 dòng Supplier. Playwright dùng Chrome thật trên desktop và viewport 390 px. [Dựng lại TEST và kịch bản Bước 2](../../docs/Feature/UAT-GD1-SYNTHETIC.md) · [Số liệu fixture](fixture-summary.json).

| Kết quả | Tác vụ và bước tái hiện | Kết quả đã quan sát |
|---|---|---|
| P1 BUG → PASS | Admin → Orders → Mua đơn hàng loạt. Tìm `TEST-BULK-086`, `TEST-BULK-091`, `TEST-BULK-096`. Kiểm tra tab Sẵn sàng mua và Cần xử lý. | Cũ 95/5, gồm 10 Order đang Hold hoặc thiếu sức mua trong tab Sẵn sàng mua. Sau sửa 85/15, từng nhóm có lý do. Một Order hai carton có một ô chọn ở cấp Order. [Trước 390 px](before/admin-bulk-390.png) · [Sau 390 px](after/admin-bulk-390.png) · [Sau desktop](after/admin-bulk-1440.png). |
| P1 BUG → PASS | Trên màn hình mua hàng loạt, xem cột giá của Order VNĐ. Dán hai cột từ bảng tính vào sheet, lọc ẩn dòng, quay lại, lưu khi mô phỏng 503, rồi lưu lại. | Cũ 95 ô sửa giá USD ở hàng chờ VNĐ. Sau sửa đọc báo giá VNĐ. Nháp giữ nguyên qua đổi bộ lọc và lỗi 503. Retry gửi một Order, ghi đúng một charge `-200000.125` VNĐ. [Ảnh lỗi thử lại](after/admin-bulk-retry.png). |
| P1 BUG → PASS | Admin → Tổng quan → Việc cần xử lý. | Cũ đầy 100 dòng Order VNĐ bị gắn thiếu giá USD. Sau sửa lọc đúng quy trình giá USD. [Trước](before/admin-dashboard.png) · [Sau](after/admin-dashboard.png). |
| PASS | Admin → Orders → Đổi Tracking → dán, kiểm tra, rồi dán đè bằng bộ Tracking khác. | Xác nhận bị khóa sau khi dán đè. Kiểm tra lại hiển thị đúng Order mới, sau đó lưu đúng một Tracking/Label. [Ảnh kiểm tra lại](after/admin-tracking-repreview.png). |
| PASS | Admin/Sales/Client → Orders → tìm Order → View VNĐ → Tracking/Label → Giao dịch VNĐ → Quay lại danh sách. | Bộ Chrome chuẩn kiểm tra đúng ID, Bộ lọc, Tracking/Label và charge chính xác ở 1440 và 390 px. [Các ca theo vai trò](role-coverage/order-detail-results.json) · [Ảnh Client 390 px](role-coverage/order-detail-client-390.png). |
| PASS | Finance → Sổ VNĐ → Supplier → Reconciliation V2. Tải queue, lọc lỗi, rồi kiểm tra các tình huống điều chỉnh từ Excel ở fixture chuyên biệt. | Chrome tải 500 dòng và tìm được 30 dòng không khớp qua bộ lọc lỗi. [Desktop](after/finance-queue-1440.png) · [390 px](after/finance-queue-390.png). Bộ Chrome chuẩn kiểm tra mapping, cấu phần Cost/Surcharge/Tax, tag, điều chỉnh Excel, lịch sử và chặn dữ liệu cũ. [Cấu phần](role-coverage/uat-supplier-v2-components.png) · [Hàng chờ và Excel](role-coverage/uat-supplier-import-queue.png). |
| PASS | Mở Emergency Hold và Supplier Recovery với Admin/Finance, đối chiếu khoản Refund, Recovery và cấn trừ. | Chrome mở [năm Order bị Hold](after/admin-emergency.png) và [Recovery đã quyết định](after/admin-recovery.png). Seed tạo Refund, duyệt Recovery và cấn trừ qua domain. Hồi quy kiểm tra Hold theo Sub-Service, đổi tuyến, gom Recovery, phân bổ, sửa duyệt và Bank/Offset. GP-Net mẫu trước/sau duyệt là `74500.215` / `94500.34` VNĐ, giữ `94500.34` khi cấn trừ. |
| PASS | Client xem Balance; Sales kiểm tra phạm vi Order và báo cáo hoa hồng; Finance xem Statement; BOD xem Control Tower, GP và hoa hồng. | Chrome/HTTP chạy năm vai trò. Bộ hồi quy kiểm tra quyền, GP-Base, snapshot hoa hồng và bất biến kỳ khóa. [Statement](role-coverage/uat-finance-statement.png) · [Control Tower](role-coverage/uat-control-tower.png) · [Hoa hồng tháng](role-coverage/uat-monthly-commission.png). |
| DEFERRED | Thao tác cầm tay trên điện thoại thật. | Viewport 390 px đã mô phỏng. Bảng mua hàng loạt cần cuộn ngang trong màn hình; Owner kiểm tra thao tác với hai carton trên thiết bị thật. |
| DEFERRED | Dùng chứng từ Supplier thật, Claim lịch sử thiếu phân bổ, chứng từ cùng nguồn đổi mã. | Pilot thực hiện sau Bước 2. Owner/Finance chốt hồ sơ mẫu, mapping, định danh và cấu hình void thực tế ở giai đoạn pilot. |
| DEFERRED | Xác minh SHA và health DEV/TEST được triển khai. | Đợt này xác minh health localhost. Jenkins đã ghi nhận 403 ở đợt trước. |

## Kiểm chứng

Từ Tổng quan tới màn hình mua hàng loạt cần 2 lần bấm. Lượt ghi bằng chứng mở màn hình và đọc hai API hàng chờ mất 4.63 giây trước sửa và 2.96 giây sau sửa. Finance tải queue 500 dòng mất 2.34 giây trên localhost. Đây là các lần đo quan sát để tái hiện UAT.

- Hồi quy domain 72 bộ. TypeScript, lint, build production với Webpack và `git diff --check`.
- Chrome/HTTP chuẩn 218 kiểm tra trên Admin, Finance, BOD, Sales và Client. [Tổng hợp](role-coverage/browser-uat.json) · [Backup/restore của bộ Chrome chuẩn](role-coverage/claim-restore.json).
- Backup/restore workload đối chiếu từng dòng 131 bảng, integrity và khóa ngoại. [Trước sửa](before/checks.json) · [Sau sửa](after/checks.json). Ảnh và JSON kết quả tách riêng khỏi SQLite và tệp mật khẩu TEST.
