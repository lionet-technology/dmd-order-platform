# GĐ1 · Emergency Hold, Supplier Recovery và GP-Net

Ngày 25/11/2026. Thực hiện trong repo chính thức, trên nền GitHub main `26734f310b2e03cec84a8cc476b384f90ecf1d80`. Dữ liệu ghi thử thuộc SQLite TEST.

## Quy tắc đã chốt

**GP-Net = tổng thu ghi nhận sau Client Refund − tổng chi ghi nhận sau Supplier Recovery.** Tổng thu gồm cước, phụ phí và thuế phía Client. Tổng chi gồm Actual thực tế đã duyệt qua các lượt fulfillment, trừ toàn bộ khoản Recovery đã duyệt. Chênh lệch khi sửa quyết định Recovery ghi vào tháng duyệt, giữ Order, Sales và kỳ mua gốc. Bank/Payable Offset tất toán khoản phải thu. GP-Base và snapshot hoa hồng vẫn dùng quy tắc hiện hành. [Đặc tả và ví dụ VNĐ](../../docs/Feature/42-vnd-claim-refund-next.md).

## Kết quả trên TEST

- `npm test` qua 72 bộ. Suite Emergency Hold và Supplier Recovery qua 62 assertions. Các bộ liên quan gồm Emergency Hold 179, Supplier 100, Supplier Import 97 và Supplier Receivables 65. Kiểm tra hành trình A → B → A, Tracking/Label và void, gom nhiều Order vào Claim, Client Refund, Recovery có phụ phí và thuế, sửa duyệt, Bank/Offset từng phần, quyền, retry, và snapshot khóa kỳ.
- [Chrome localhost](browser-test.json) qua 39 kiểm tra trên Admin, Finance, BOD, Sales và Client. Kiểm tra quyền xem GP-Net, Recovery có thuế, worklist, Hold/Resume có retry và quyền xem Order của Client. Kiểm tra HTTP độc lập qua 22 assertions trên cùng 5 vai trò.
- [Backup/restore SQLite TEST](sqlite-restore.json) qua kiểm tra toàn vẹn, khóa ngoại và đối chiếu 13 bảng, gồm hồ sơ Emergency, void, Client Refund, journal Supplier Claim và phân bổ Recovery.
- `npm run typecheck`, `npm run lint`, `npm run build` và `git diff --check` đều qua. Build còn một cảnh báo Turbopack về đường dẫn SQLite động.

## Phạm vi xác minh

DEV/TEST từ Jenkins chưa được xác minh. Lần kiểm tra API Jenkins chỉ đọc trước đó trả HTTP 403. UAT và pilot với Supplier thật vẫn mở. Claim lịch sử thiếu phân bổ cần đối chiếu trước khi đưa vào GP-Net theo Order. Kiểm tra trùng dùng tham chiếu chứng từ hiện hành, nên cùng một credit note được nhập dưới mã khác cần đối chiếu nghiệp vụ.
