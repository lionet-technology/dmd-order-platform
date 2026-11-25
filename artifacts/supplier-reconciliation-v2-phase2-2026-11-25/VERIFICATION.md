# Supplier Reconciliation V2 · đợt 2

Kiểm chứng ngày 25/11/2026 trên bản tách từ `main` của repo chính thức tại `9bcfececcc48ee4878dad6708b689a3a5f764080`. Các ca ghi sổ, Chrome và phục hồi dùng dữ liệu TEST độc lập.

- `npm test` qua 71 bộ. Supplier Import qua 97 assertions, Control Tower qua 22, Emergency Hold hiện hữu qua 179. Tình huống kiểm tra gồm delta Actual nhiều lượt, quyền chỉ nội bộ, snapshot quyết định, và thẻ phí void vượt policy.
- `npm run typecheck`, `npm run lint` và `npm run build` đều qua. Build còn cảnh báo Turbopack về phân tích đường dẫn SQLite tại `src/lib/db.ts`.
- [Chrome localhost](browser-uat.json) qua 180 assertions với 5 vai trò. Đã kiểm tra SHA-256 của file tải lại, quyền tải file, định danh dòng, Excel preview và lưu đề xuất, từ chối bản cũ và công thức, Finance xác nhận delta và đọc lại bản chụp đã duyệt.
- [Backup/restore SQLite TEST](claim-restore.json) qua kiểm tra integrity, khóa ngoại và so khớp dữ liệu trước/sau, gồm 7 workbook, revision điều chỉnh, quyết định import, kỳ khóa và sổ Supplier.

[Feature 40](../../docs/Feature/40-vnd-post-shipping-import-reconciliation.md#supplier-reconciliation-v2--đợt-2) và [Feature 30](../../docs/Feature/30-supplier-cancellation-followup.md#đối-chiếu-phí-void-trong-exception-queue) ghi phạm vi vận hành. Emergency Hold cấp Sub-Service và Supplier Recovery Worklist thuộc phần tiếp nối. Tài liệu bàn giao DEV/TEST trước đó ghi Jenkins HTTP 403. Lần kiểm chứng này xác nhận localhost và SQLite TEST.
