# GĐ1 · Kiểm chứng P0 và UI Admin · 21/11/2026

Bản làm việc tách từ repo chính thức tại `9e103f9e6f6258ad9acf5b5cadff7a087151361f`, Node 20.20.2. Chrome chạy production build trên localhost với SQLite TEST dùng một lần. [Memo quyết định](../../docs/Feature/47-gd1-p0-decision-memo.md).

| Luồng Admin | Kết quả vòng review đầu |
|---|---|
| Bulk Purchase failures | Chrome tạo Order thiếu điện thoại và kiểm tra lỗi dữ liệu theo Order. Tab Cần xử lý hiện toàn bộ trường dòng ở chế độ chỉ đọc và ẩn thao tác lưu Tracking. Chrome tạo lỗi lưu Tracking rồi thử lại: rollback toàn batch, giữ dữ liệu đã nhập, lưu lại thành công. [Cần xử lý desktop](admin-purchase-issues-1440.png) · [Mobile](admin-purchase-issues-390.png). |
| Bulk Tracking/Label | Chrome xác nhận lọc Service/Sub-Service, gom hai kiện theo từng Order, chọn toàn bộ sau filter, tải/upload Excel, dán Tracking/Label và charge một lần cho mỗi Order. [Desktop](admin-tracking-1440.png) · [Mobile](admin-tracking-390.png) · [86 kiểm tra](bulk-browser.log.txt). |
| Supplier Import/Exception Queue | Chrome xác nhận unmatched nằm trong queue, Admin thiếu quyền Accept, Finance có thể duyệt chi phí đã rà. Tham chiếu trùng sổ hiển thị lý do và khóa Accept; Sales/Client bị chặn truy cập journal. [Queue](uat-supplier-import-queue.png) · [Xung đột tham chiếu](uat-supplier-reference-conflict.png). |
| Orders/Detail | Chrome kiểm tra tìm theo mã, mở đúng Order và tab Carton & SKU ở desktop/mobile. Luồng VNĐ đã kiểm tra sửa kiện/đổi Service và xác nhận giữ offer. [Order Detail](admin-order-detail-1440.png). Link View VNĐ hiện mở workspace chung; còn cần thử khả năng giữ ngữ cảnh Order khi đi từ danh sách tới chi tiết. [Hộp thoại giá](uat-service-price-choice.png). |
| Balance Ledger | Chrome mở [Balance Ledger](admin-balance-ledger-390.png) và kiểm tra chiều rộng ở desktop/mobile. Bộ kiểm tra VNĐ xác nhận tài khoản theo vai trò, ghi phí một lần, sao kê đã phát hành giữ nguyên, cảnh báo Credit Term và dữ liệu Bank theo quyền. Còn cần review riêng lọc và tìm giao dịch trên ledger dài. [Admin](uat-admin-desktop.png) · [Finance Statement](uat-finance-statement.png). |
| Control Tower | Chrome kiểm tra mở hàng đợi Supplier, Sales/Client chỉ thấy ngoại lệ được cấp và không có Net/Actual. [Control Tower](uat-control-tower.png). |

- Chrome/HTTP VNĐ đạt 164 kiểm tra trên Admin, Finance, BOD, Sales và Client. [Kết quả](browser-uat.json).
- SQLite TEST restore đối chiếu 21 bảng, integrity OK và 0 vi phạm khóa ngoại. Diễn tập nâng cấp chạy lại installer và bảo toàn dữ liệu. [Restore](claim-restore.json) · [Nâng cấp](upgrade-test.json).
- Workbook giá nguồn SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.
- Deploy và restore tại môi trường triển khai DEV/TEST chờ xác minh. Hồ sơ bàn giao trước ghi Jenkins HTTP 403. UAT vận hành và chứng từ thật thuộc pilot.
- Hồi quy 71/71 suite. TypeScript, ESLint và production build đạt; build có cảnh báo Turbopack về truy vết đường dẫn SQLite động. [Hồi quy](regression.log.txt) · [TypeScript](typecheck.log.txt) · [Lint](lint.log.txt) · [Build](build.log.txt).
