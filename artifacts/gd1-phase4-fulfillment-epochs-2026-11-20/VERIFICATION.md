# GĐ1 Phase 4 · Actual và payable theo lượt fulfillment

Kiểm thử ngày 20/11/2026 trong repo chính thức `/Users/quan/Developer/report` trên SQLite mẫu và Chrome localhost. Commit nền `7bec0dc822f573e223f91d5c7c849e8c7695044a` đã chứa cả chốt đối soát chứng từ và Supplier Add-on BUY/SELL. GitHub main ở `12f7c1c990ddd77b5e5836bb3e8ec564f8be329a` khi bắt đầu.

- **Hồi quy 71/71 suite.** Supplier Actual đạt 97 kiểm tra. Excel Supplier đạt 78. Có A → B → A, giữ và thay Tracking, thay Label cùng Tracking, khôi phục bằng chứng thay Tracking từ audit cũ, Finance/BOD và quyền chặn Admin/Sales/Client, retry, chứng từ mơ hồ, cùng Supplier qua nhiều lượt, delta cũ lệch và hai kỳ đã khóa. Chứng từ điều chỉnh ghi kỳ hiện tại và nối đúng bút toán của lượt trong kỳ gốc. Void giữ nguyên journal. [Log hồi quy](regression.log.txt)
- **Chrome/HTTP 150 kiểm tra trên năm vai trò.** Finance dùng Excel có Tracking và URL Label để chốt lượt lịch sử. Dòng Tracking dùng lại bị chặn trên giao diện và khi ép Lot qua API. Có kiểm tra lại Supplier Add-on và Balance Client. [Kết quả Chrome](browser-uat.json) · [Ảnh hàng đợi](uat-fulfillment-queue.png)
- **TypeScript, ESLint và production build đạt.** Build dùng SQLite riêng. Backup/restore Chrome đối chiếu 17 bảng, kiểm tra integrity và khóa ngoại. Nâng cấp từ SQLite tạo bằng mã ở commit nền bảo toàn Actual, payable, template, dòng chứng từ, liên kết điều chỉnh và snapshot kỳ khóa. [Backup/restore](restore-test.json) · [Nâng cấp](upgrade-test.json)
- Workbook giá gốc giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

Dữ liệu cũ thiếu lịch sử hoặc có delta không khớp lượt vẫn cần Finance đối soát. SELL gắn Client ghi toàn bộ vào Balance một lần và thu qua luồng nạp tiền hiện tại. Chuyên tuyến theo Order/Lot và popup đổi Service còn mở. Chưa xác minh deploy DEV/TEST hoặc pilot chứng từ thật.
