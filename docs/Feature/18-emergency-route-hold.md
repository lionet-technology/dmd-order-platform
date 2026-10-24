# Emergency Hold và đổi Route trên Order gốc

**Trạng thái:** Implemented local; chưa nghiệm thu production. Quy tắc Owner 24/10/2026 ưu tiên hơn các mô tả Phase 1/2 cũ.

## Luồng đơn giản
Admin Hold một Route có lý do → Order đủ điều kiện vào HOLD → chọn Route mới Active, không warehouse Hold → chuyển từng Order bằng một SQLite IMMEDIATE transaction. Giữ nguyên original Order, Client Order ID, DMD ID và giá bán; không cancel/rebuy, refund, Charge hay Reserve giả.

- Tracking/Label OPTIONAL: không gửi mapping (API `[]` hoặc bỏ `trackings`), hoặc để trống toàn bộ hai cột mới trong Excel → chỉ đổi Route, giữ nguyên tất cả hàng Tracking và lịch sử.
- Nếu nhập bất kỳ Tracking/Label mới nào: phải nhập đủ **tất cả Tracking ACTIVE** của Order, mỗi Tracking ID cũ đúng một lần, đủ Tracking mới và Label hợp lệ. Không hỗ trợ thay một phần trong Emergency; lỗi rollback cả Order.
- Estimated Net Cost OPTIONAL: blank giữ nguyên, số mới không âm, tối đa hai chữ số thập phân. Không tự chia lại phân bổ nhiều Lot/component; trường hợp đó để blank và sửa allocation qua Reconciliation.
- Chỉ khôi phục workflow trước Hold; Order vốn HOLD vẫn HOLD. Route gốc vẫn chặn mua đến khi Undo. Undo chỉ khôi phục Order chưa resolved, không đảo Switch thành công.

## Bàn giao và stale state
Xuất Manifest carton là bàn giao Supplier/ETD Express. Bất kỳ carton nào đã export khiến toàn Order thành ngoại lệ thủ công; kiểm cả EXPORT/REMOVE audit bền vững sau khi reopen/unpack. Tracking movement, delivered timestamp, fulfillment_started hoặc audit movement hỏng cũng loại khỏi tự động. Hold và Switch dùng chung `emergencyException`. Carton trong Manifest chưa export cần kho gỡ khỏi Manifest trước Switch.

Switch kiểm tra lại Order còn HOLD, Route gốc khớp snapshot, Hold còn mở và Route đích Active/không Hold/đúng giới hạn carton trong cùng transaction. Guard DB khóa route, định danh, giá bán, estimate và Tracking của Order chưa resolved. Switch/Undo và duplicate Switch được serialize. Retry cùng Route/mapping/estimate không ghi thêm; payload khác bị từ chối. Retry Hold/Undo cũ không mở/đóng nhầm batch mới.

## Cost, tiền và audit
Actual Cost Supplier cũ và mới giữ từng chứng từ, không rewrite supplier cũ sang mới, cộng vào actual exposure khi đủ coverage. Switch ghi Route/Supplier trước-sau, Tracking KEEP/REPLACE_ALL, estimate và cost đã biết theo Supplier trong audit. Client chỉ nhận thông báo đổi Route hoặc Tracking/Label, không thấy cost.

Replacement đòi cost Supplier mới đúng Tracking/Lot. Route-only thêm expectation theo Hold/Order/Lot/Tracking; không tạo Tracking giả. NOT_BILLED/INCLUDED_IN_PARENT của label cũ không miễn cost Supplier mới. Thiếu evidence mới → PARTIAL/PENDING, xóa finalized GP ngay trong Switch. Route khác nhưng cùng Supplier cũng không tái dùng bill có trước Switch: giữ pending chờ evidence mới. Đây là mặc định bảo thủ để tránh COMPLETE sai, chưa có thao tác miễn phí mới hoặc gộp bill cùng Supplier; ngoại lệ đó cần Finance xác nhận quy tắc trước khi mở.

Order không có Tracking vẫn có expectation theo Lot, cần invoice trực tiếp Lot của Supplier mới. ePacket aggregate chưa mapping component vẫn UNKNOWN theo quy tắc đối soát chung. Cost import sau Switch chỉ đối soát cost, không chạy lại nhánh legacy sửa Charge/giá. Statement snapshot đã phát hành không đổi.

## Excel và hàng chờ lỗi
Download từ Hold, một dòng cho mỗi Tracking. Điền Route ID mới trên dòng xử lý; blank Route bỏ qua dòng. Route-only không bắt nhập Tracking ID mới/Label. Nếu replacement, tất cả dòng/Tracking của Order phải đầy đủ. Giới hạn 5 MB, 2.000 dòng, 250 Order. Không nhận formula/hyperlink.

Parse theo dòng, nhóm theo Order; lỗi của một Order không hủy kết quả Order khác. Mỗi Order thành công được giữ lại; Order lỗi còn HOLD/unresolved, lưu `last_error`, hiện trong alert khi tải lại trang, retry bằng cùng file đã sửa. Header/file hỏng hoặc vượt giới hạn bị từ chối trước khi xử lý; các Order unresolved vẫn trong hàng chờ. Không cố đoán Order khi DMD ID không đọc được. Success xóa lỗi của chính Order đó. Các dòng thành công có thể replay an toàn.

## Nguồn và kiểm chứng
`emergency-hold.ts`, `emergency-switch.ts`, `emergency-schema.ts`, `emergency-excel.ts`, `reconciliation.ts`, `order-operations.ts`, API service-routes/:id/emergency và `emergency-switch-workspace.tsx`.

`scripts/verify-emergency-hold.cjs`: database synthetic tạm; tiền/Statement bất biến, route-only, full replacement, rollback audit, role, Manifest history, duplicate/retry, worker concurrency/Switch-vs-Undo, cost cũ+mới, cost import retry và mixed Excel recovery. Kết quả thực chạy và giới hạn ghi trong [audit mới](AUDIT-EMERGENCY-SIMPLIFICATION-2026-10-24.md).
