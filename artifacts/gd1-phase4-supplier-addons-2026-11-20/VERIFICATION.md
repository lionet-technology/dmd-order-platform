# GĐ1 Phase 4 · Supplier Add-on BUY/SELL VNĐ

Repo chính thức `/Users/quan/Developer/report`. Baseline `12f7c1c990ddd77b5e5836bb3e8ec564f8be329a`. Kiểm thử dùng SQLite mẫu và Chrome localhost.

- Hồi quy toàn repo đạt 71/71 suite. Supplier Add-on đạt 36 kiểm tra. Phạm vi gồm số lẻ VNĐ, tên Supplier nhập tự do, BUY/SELL, thanh toán từng phần qua nhiều tháng, chống trùng chứng từ và tham chiếu thanh toán, hai writer thanh toán đồng thời, rollback khi lỗi bút toán Client và role access.
- SELL gắn Client có một ADDON_REVENUE; có thể làm sức mua âm. Client trả sau bằng PAYMENT qua luồng nạp tiền. Test đối chiếu số dư, Reserve, số bút toán và sổ Supplier Actual/payable.
- Chrome/HTTP đạt 145 kiểm tra trên năm vai trò. Finance tạo BUY trên màn hình, ghi trả một phần và xem số đã trả theo Supplier. HTTP kiểm tra ghi SELL đúng một lần khi gửi lại. Admin/BOD được xem, Sales/Client không truy cập Supplier Add-on.
- TypeScript, ESLint và production build đạt. Backup/restore trên DB Chrome mẫu đạt kiểm tra integrity, khóa ngoại và đối chiếu 13 bảng, gồm cả hai bảng Supplier Add-on.

Bản sao SQLite trước Add-on nâng cấp thành công và bảo toàn dữ liệu trong năm bảng đối chiếu.

[Hồi quy](regression.log.txt) · [Chrome/HTTP](browser-uat.json) · [Backup/restore SQLite mẫu](restore-test.json) · [Kiểm tra nâng cấp](upgrade-test.json).

Workbook giá giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Chưa xác minh deploy DEV/TEST cho thay đổi này. Actual/payable theo lượt fulfillment lịch sử vẫn mở.
