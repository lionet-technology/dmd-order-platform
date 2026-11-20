# GĐ1 Phase 4 · Chặn ghi Actual khi chưa rõ lượt fulfillment

Baseline repo chính thức và GitHub main ngày 20/11/2026 là `12f7c1c990ddd77b5e5836bb3e8ec564f8be329a`. Phạm vi kiểm thử dùng SQLite mẫu.

- Luồng Supplier VNĐ giữ chứng từ đến trễ trong queue khi Supplier đã rời tuyến hoặc Lot có Tracking từng bị thay. Kiểm tra áp dụng cho Excel, import trực tiếp và chọn lại Lot. Actual đã có giữ nguyên. Chứng từ chờ duyệt qua luồng Actual trực tiếp cũng bị chặn ghi sổ khi phát hiện lịch sử cần đối soát.
- Supplier VNĐ đạt 70 kiểm tra, gồm A → B → A, từ chối Accept khi chọn Lot thủ công, lưu chứng từ trực tiếp vào queue và bảo toàn payable của cả hai Supplier. Supplier Import đạt 70 kiểm tra, gồm Excel mapping theo phiên bản, gửi lại cùng dòng chứng từ Tracking cũ, từ chối Accept và bảo toàn snapshot kỳ khóa cùng liên kết điều chỉnh.
- Hồi quy toàn repo đạt 70/70 suite. TypeScript, ESLint và production build đạt. Chrome/HTTP trên localhost đạt 134 kiểm tra với năm vai trò.
- Diễn tập backup/restore SQLite mẫu đạt 8 bảng, kiểm tra integrity và khóa ngoại. Đối soát kỳ Supplier đạt 38 kiểm tra.

Workbook giá giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Kết quả lưu trong [hồi quy](regression.log.txt), [Chrome/HTTP](browser-uat.json) và [backup/restore](restore-test.json).

Còn mở định danh fulfillment attempt, chọn và ghi Actual theo lượt, liên kết kỳ khóa theo lượt và Supplier Add-on BUY/SELL. Phạm vi này chưa có deploy DEV/TEST.
