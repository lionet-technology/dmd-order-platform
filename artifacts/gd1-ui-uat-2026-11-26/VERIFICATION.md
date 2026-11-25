# GĐ1 · Kiểm chứng bản sửa Bulk Tracking

Nền GitHub main được đối chiếu trước sửa: `e9e4ec98b33b451b6dc9c05803ee22d80f6fc486`.

- Hồi quy qua 72 bộ. Emergency Hold qua 179 assertions. Supplier Recovery và SubService Emergency qua 62, Supplier Import qua 97, Supplier Receivables qua 65.
- TypeScript, lint, build và git diff --check qua. Build có cảnh báo Turbopack hiện có về đường dẫn SQLite động.
- Chrome localhost trên SQLite TEST xác nhận Admin mở Orders và sheet đổi Tracking, kiểm tra dòng A, dán B, xác nhận bị khóa cho đến khi kiểm tra lại. [Ảnh sau khi kiểm tra lại](tracking-repreview.png).
- Backup/restore SQLite TEST khớp tất cả các dòng trên 13 bảng. Kiểm tra integrity và khóa ngoại đều qua.

[Checklist UI và pilot](../../docs/Feature/UAT-GD1-PILOT-2026-11-26.md) ghi các màn hình còn cần nghiệm thu. DEV/TEST Jenkins, chứng từ Supplier thật và hồ sơ Client pilot cần xác minh riêng.

## Kiểm tra bổ sung

- Chrome 390 px kiểm tra lại thao tác dán. Tại lúc dán lại, mã Order cũ biến mất và nút xác nhận bị khóa. Đã mở sheet qua điều hướng được kích hoạt bằng automation, nên kết quả áp dụng cho sheet sau khi mở. [Ảnh mobile](tracking-mobile.png).
- 15 kiểm tra HTTP qua trên SQLite TEST. Admin, Finance, BOD, Sales và Client đều đăng nhập. Hold chỉ trả 200 cho Admin. Recovery Worklist trả 200 cho Admin, Finance và BOD. Các vai trò ngoài phạm vi nhận 403.
