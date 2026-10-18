# Import, mẫu mua & export

## Delta 18/10/2026
Supplier Cost Excel chỉ BOD/FINANCE. Không cấp họ import Orders/Balance/Tracking. File tối đa 10 MB. Net Cost không được xuất qua lot.net_cost hoặc placeholder ngoài allowlist trong template vận hành. API JSON có projection bảo vệ cost cả list/detail/mutation và chuỗi JSON lồng.

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Nhập Excel là đường bulk/migration, không thay thế nguồn Order chuẩn; mẫu theo vai trò và module.
- Admin quản lý template mua theo route và phiên bản; mapping dùng trường dữ liệu của Order/lot; template preview/download/export cần giữ nguyên khả năng mở trong Excel.
- Các workbook có validation name #REF! phải được xử lý khi sinh file để tránh Excel repair, không làm thay đổi file gốc.
- Export manifest phải kiểm route, trạng thái carton và điều kiện kho; không tự chọn template generic thay cho template cấu hình route theo yêu cầu nghiệp vụ.
## Nguồn & kiểm tra
- `src/lib/importers.ts`, `src/lib/purchase-templates.ts`, `src/app/api/import/`, `src/app/api/purchase-export/`, `src/app/api/purchase-templates/`, `src/app/api/manifest-export/`, `scripts/verify-purchase-engine.cjs`.
## Cần xác nhận
- Danh sách mapping bắt buộc cho từng supplier; file Excel thực tế cần acceptance check ngoài parser.
