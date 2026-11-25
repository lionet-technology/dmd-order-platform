# Supplier Reconciliation V2 · đợt 1

Kiểm chứng ngày 25/11/2026 trên repo chính thức, từ `main` tại `02ad1b05982339617766e5dee67ab6c4f926fd67`. Chrome dùng ứng dụng build trên localhost và cơ sở dữ liệu TEST độc lập.

- `npm test` qua 71 bộ hồi quy. Supplier Import qua 92 assertions, gồm nhiều thành phần Cost, thuế/phụ phí, số 0 so với ô trống, phí mới và phí điều chỉnh, tải lại chứng từ, chặn lần duyệt lỗi thời, quyền duyệt, rollback và kỳ đã khóa.
- Build và lint qua. Build chạy kiểm tra TypeScript và có cảnh báo Turbopack tại `src/lib/db.ts` về phân tích đường dẫn SQLite.
- [Chrome TEST](browser-uat.json) qua 170 assertions với 5 vai trò. [Ảnh bảng so sánh](uat-supplier-v2-components.png) ghi nhận nhiều tag và nghĩa vụ sau điều chỉnh. [Ảnh ngoại lệ fulfillment](uat-fulfillment-queue.png) ghi nhận luồng làm rõ lượt.
- [SQLite backup/restore](claim-restore.json) qua kiểm tra integrity và khóa ngoại trên dữ liệu TEST. Snapshot thành phần V2 dùng trường JSON của bảng quyết định đã có.

Đợt này dùng quyền chốt Actual Finance/BOD trong luồng hiện hành. Mở tiếp việc lưu file gốc và quản lý batch, xuất/nhập lại Excel exception, tự chốt dòng đủ điều kiện, đối chiếu phí void theo phần trăm, Emergency Hold theo SubService và Supplier Recovery theo nhóm Refund Orders. [Phạm vi kỹ thuật](../../docs/Feature/40-vnd-post-shipping-import-reconciliation.md#supplier-reconciliation-v2--triển-khai-từng-phần).
