# Danh mục & cấu hình dùng chung

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Danh mục chung gồm Service, Sub-Service theo Service, Supplier, Country; mục đã dùng trong lịch sử không xoá vật lý.
- Admin thêm/sửa/sắp xếp/activate/deactivate; chỉ chấp nhận giá trị hợp lệ, đang active trong input/import.
- Đổi tên phải tránh mồ côi dữ liệu lịch sử. Deactivate service ảnh hưởng sub-service liên kết theo tài liệu cũ.
- Một số cấu hình route và giá theo phiên bản immutable/activation, không thay thế bằng chỉnh trực tiếp bản giá đã bán.
## Nguồn
- `src/lib/enums.ts`, `src/app/api/enums/`, `src/app/api/service-routes/`, `src/lib/route-pricing.ts`.
## Cần xác nhận
- Tác động cascade từng loại danh mục và yêu cầu backward compatibility khi import file cũ.

## Delta lượt tiếp tục 16/10/2026
Supplier đã có invoice phải trả bị chặn rename để giữ chứng từ bất biến; deactivate vẫn cho phép và thanh toán nghĩa vụ lịch sử vẫn được ghi. Tạo tên mới cho giao dịch mới; không cascade sửa lịch sử invoice/payment.
