# GĐ1 · Kiểm chứng Chuyên tuyến nhiều Lot và đổi Service

Kiểm thử 20/11/2026 trong repo chính thức trên nhánh `main`, nền `6b726895647be4846664405db59b896678376c09`. Local HEAD, origin/main và GitHub main trùng nền khi bắt đầu. Runtime Node 20.20.2 và SQLite fixture, Chrome thật trên localhost.

- **Chuyên tuyến.** Kiểm tra cộng Selling Price và Net thập phân từ hai Lot, nhập Base cấp Order, chặn một trường ở hai cấp, thiếu Lot, Lot không thuộc Order, Lot trùng và quyền Sales. Snapshot cấp Lot cung cấp estimate cho đối soát Supplier. Giữ đúng một Purchase Request, FIFO và Reserve khi thiếu tiền, khóa sau Tracking/Label, Charge đúng một lần khi đủ chứng từ.
- **Đổi Service.** Preview dùng Service và kiện sau sửa. Đóng hộp thoại giữ nguyên dữ liệu. Server chặn giá so sánh đã cũ, thử cả giữ offer và dùng giá tự động, quyền Admin, revision mới và rollback. Chrome thao tác thực với Admin. Client cần consent cho revision mới. [Ảnh popup](chrome/uat-service-price-choice.png)
- **Finance và Supplier.** Thuế/phụ phí theo Tracking giữ ID Tracking, kiện và Lot. Tham chiếu chống ghi trùng qua định danh Order. Hồi quy giữ các ca chi tiền, Refund, Commission khóa kỳ, hồ sơ void, Supplier Add-on, đối chiếu Actual theo lượt và điều chỉnh payable tới trễ.
- **Hồi quy 71/71 suite đạt.** [Nhật ký hồi quy](regression.log.txt)
- **Chrome/HTTP 156 kiểm tra trên năm vai trò.** [Kết quả](chrome/browser-uat.json)
- **SQLite TEST.** Backup/restore đối chiếu 21 bảng, gồm Purchase, snapshot giá, phí, Client ledger, Claim và Supplier. Diễn tập nâng cấp trên bản sao dùng schema cũ của bảng nguồn phí, chạy installer hai lần, giữ hai dòng phí cũ và 20 bảng còn lại. SQLite integrity và khóa ngoại đều đạt. [Backup/restore](chrome/claim-restore.json) · [Nâng cấp](chrome/upgrade-test.json)
- **TypeScript, ESLint, production build đạt.** Build phát cảnh báo Turbopack về truy vết đường dẫn SQLite động. [Nhật ký build và kiểm tra](quality.log.txt)

Workbook nguồn giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Mọi ghi dữ liệu trong kiểm thử dùng SQLite mẫu.

Nhiều Supplier theo Lot thuộc tùy chọn hoãn vì phụ thuộc route và fulfillment epoch cấp Order. Các quyết định báo cáo/đối soát còn mở, UI/UAT và pilot chứng từ thật nằm trong [kiểm kê GĐ1](../../docs/Feature/43-gd1-completion-decision-backlog.md). API Jenkins trả HTTP 403. DEV/TEST deploy và khôi phục tại môi trường triển khai chưa được xác minh.
