# Quy trình quản trị feature docs

## Bắt buộc trong mỗi thay đổi tính năng
1. Đọc file feature liên quan **trước khi sửa code**; đọc các module kết nối (pricing → purchase → credit → ledger → claims).
2. Ghi **hành vi hiện hành**, trường hợp lỗi/boundary, role/API, tác động dữ liệu và trạng thái rollout. Chỉ khẳng định khi có đối chiếu code/tests.
3. Cập nhật Markdown **trong cùng thay đổi/PR với code**; nếu chưa làm xong phải ghi TODO/decision rõ ràng thay vì mô tả như đã hoàn thành.
4. Thêm đường dẫn source và script kiểm thử, chạy regression tương ứng; với chức năng tài chính, test retry/idempotency, lịch sử và rollback.
5. Trước release, đối chiếu docs với code + kết quả chạy test + UI acceptance; cập nhật phần pending, version/time và release checklist.

## Template tối thiểu cho file mới
```md
# Tên tính năng
**Trạng thái:** Implemented / Partial / Proposed / Deprecated
**Rà soát:** YYYY-MM-DD; commit; bằng chứng
## Mục đích và phạm vi
## Vai trò / quyền truy cập
## Đầu vào và kiểm tra hợp lệ
## Các trạng thái, hành động và luồng chính
## Rule tính toán và ngoại lệ
## Tác động tài chính / dữ liệu / audit
## Liên kết tính năng khác
## API, code, DB, tests
## Chưa triển khai / quyết định cần chốt
## Lịch sử thay đổi
```

## Nguyên tắc chất lượng
- Tách **As-Is (đã xác minh)** và **To-Be (đề xuất)**. Không tự dùng tài liệu cũ để suy diễn hành vi hiện tại.
- Không thay đổi quyết định nghiệp vụ chỉ vì code hiện tại khác spec: ghi discrepancy và hỏi Product/Owner.
- Khi source và doc khác nhau: ghi cảnh báo, kiểm chứng bằng test; sửa code hay sửa doc cần người chịu trách nhiệm chấp thuận.
- Đường dẫn ở đây là chuẩn cho tài liệu tính năng: `docs/Feature/`; tài liệu vận hành/deployment vẫn ở `docs/`.
- Gợi ý review PR: docs impact? role/security? money semantics? migrations? tests? rollback? launch notes?
