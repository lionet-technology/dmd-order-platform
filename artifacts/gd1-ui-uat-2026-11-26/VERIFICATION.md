# GĐ1 · Kiểm chứng bản sửa Bulk Tracking

Nền GitHub main được đối chiếu trước sửa: `e9e4ec98b33b451b6dc9c05803ee22d80f6fc486`.

- Hồi quy qua 72 bộ. Emergency Hold qua 179 assertions. Supplier Recovery và SubService Emergency qua 62, Supplier Import qua 97, Supplier Receivables qua 65.
- TypeScript, lint, build và git diff --check qua. Build có cảnh báo Turbopack hiện có về đường dẫn SQLite động.
- Chrome localhost trên SQLite TEST xác nhận Admin mở Orders và sheet đổi Tracking, kiểm tra dòng A, dán B, xác nhận bị khóa cho đến khi kiểm tra lại. [Ảnh sau khi kiểm tra lại](tracking-repreview.png).
- Backup/restore SQLite TEST khớp tất cả các dòng trên 13 bảng. Kiểm tra integrity và khóa ngoại đều qua.

[Checklist UI và pilot](../../docs/Feature/UAT-GD1-PILOT-2026-11-26.md) ghi các màn hình còn cần nghiệm thu. DEV/TEST Jenkins, chứng từ Supplier thật và hồ sơ Client pilot cần xác minh riêng.
