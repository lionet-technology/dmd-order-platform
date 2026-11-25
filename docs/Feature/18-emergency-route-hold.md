# Emergency Hold và đổi Route trên Order gốc

**Trạng thái:** Implemented local; chưa nghiệm thu production. Quy tắc Owner 24/10/2026 ưu tiên hơn các mô tả Phase 1/2 cũ.

## Luồng đơn giản
Admin Hold một Route có lý do → Order đủ điều kiện vào HOLD → chọn Route mới Active, không warehouse Hold → Admin xác minh Route, Tracking, Label và Estimated Net Cost, điều chỉnh nếu cần hoặc approve giữ nguyên → chuyển từng Order bằng một SQLite IMMEDIATE transaction. Giữ nguyên original Order, Client Order ID, DMD ID và giá bán; không cancel/rebuy, refund, Charge hay Reserve giả.

- Tracking/Label OPTIONAL: không gửi mapping (API `[]` hoặc bỏ `trackings`), hoặc để trống toàn bộ hai cột mới trong Excel → chỉ đổi Route, giữ nguyên tất cả hàng Tracking và lịch sử.
- Nếu nhập bất kỳ Tracking/Label mới nào: phải nhập đủ **tất cả Tracking ACTIVE** của Order, mỗi Tracking ID cũ đúng một lần, đủ Tracking mới và Label hợp lệ. Không hỗ trợ thay một phần trong Emergency; lỗi rollback cả Order.
- Estimated Net Cost OPTIONAL: blank giữ nguyên, số mới không âm, tối đa hai chữ số thập phân. Không tự chia lại phân bổ nhiều Lot/component; trường hợp đó để blank và sửa allocation qua Reconciliation.
- Chỉ khôi phục workflow trước Hold; Order vốn HOLD vẫn HOLD. Route gốc vẫn chặn mua đến khi Undo. Undo chỉ khôi phục Order chưa resolved, không đảo Switch thành công.

## Một bước xác minh Admin cho mọi Route
Không tách luồng cùng/khác Supplier. Màn hình từng Order hiển thị Route hiện tại/đích, Tracking/Label hiện tại và Estimated Net Cost hiện tại; Admin sửa dữ liệu cần đổi rồi tick xác minh để tiếp tục. Không sửa tức là duyệt giữ nguyên. Thay Route, Tracking, Label hoặc Net Cost sau khi tick sẽ xóa xác nhận, yêu cầu rà lại. Bulk chỉ xử lý các Order đã được xác minh.

Excel dùng cùng quy tắc: Admin xác minh nội dung file rồi tick xác nhận; đổi file xóa xác nhận. API JSON phải có `review_confirmed: true` (boolean), multipart phải có `review_confirmed=true`; domain và Excel importer cũng enforce. Thiếu xác nhận thì không Switch, không thoát HOLD, không đổi tiền. Audit ghi Admin từ session, thời gian event, KEEP/REPLACE_ALL và KEEP/UPDATE Net Cost cùng dữ liệu trước/sau. Không thêm approval engine hoặc một approval riêng cho miễn cost cùng Supplier.

## Bàn giao và stale state
Xuất Manifest carton là bàn giao Supplier/ETD Express. Bất kỳ carton nào đã export khiến toàn Order thành ngoại lệ thủ công; kiểm cả EXPORT/REMOVE audit bền vững sau khi reopen/unpack. Tracking movement, delivered timestamp, fulfillment_started hoặc audit movement hỏng cũng loại khỏi tự động. Hold và Switch dùng chung `emergencyException`. Carton trong Manifest chưa export cần kho gỡ khỏi Manifest trước Switch.

Switch kiểm tra lại Order còn HOLD, Route gốc khớp snapshot, Hold còn mở và Route đích Active/không Hold/đúng giới hạn carton trong cùng transaction. Guard DB khóa route, định danh, giá bán, estimate và Tracking của Order chưa resolved. Switch/Undo và duplicate Switch được serialize. Retry cùng Route/mapping/estimate không ghi thêm; payload khác bị từ chối. Retry Hold/Undo cũ không mở/đóng nhầm batch mới.

## Cost, tiền và audit
Chứng từ Supplier cũ và mới được giữ riêng. Các chứng từ còn ACTIVE cùng đóng góp Actual Cost khi đủ coverage. Từ 06/11, nếu giữ nguyên Tracking và đã có cost ACTIVE, chứng từ mới vào Pending. **Nhận giá mới** thay toàn bộ giá ACTIVE của Tracking đó. Nếu cả hai chứng từ đều phải tính, cần đối soát và mapping riêng: giữ giá cũ không đáp ứng yêu cầu chứng từ Supplier mới, và Adjustment yêu cầu Lot đã có Actual Cost. Xem [Supplier Cost](09-supplier-reconciliation.md). Switch ghi Route/Supplier trước-sau, Tracking KEEP/REPLACE_ALL, estimate và cost đã biết theo Supplier trong audit. Client chỉ nhận thông báo cập nhật Tracking/Label nếu Tracking/Label thực sự đổi. Chi tiết Incident và hồ sơ void chỉ dùng nội bộ.

Replacement đòi cost Supplier mới đúng Tracking/Lot. Route-only thêm expectation theo Hold/Order/Lot/Tracking; không tạo Tracking giả. NOT_BILLED/INCLUDED_IN_PARENT của label cũ không miễn cost Supplier mới. Thiếu evidence mới → PARTIAL/PENDING, xóa finalized GP ngay trong Switch. Route khác nhưng cùng Supplier cũng không tái dùng bill có trước Switch: giữ pending chờ evidence mới. Đây là mặc định bảo thủ để tránh COMPLETE sai, chưa có thao tác miễn phí mới hoặc gộp bill cùng Supplier; đây chỉ là trạng thái đối soát cost, không tạo thêm nhánh xác nhận Emergency hay cản Order tiếp tục sau khi Admin duyệt. Admin duyệt Emergency không đồng nghĩa Finance duyệt Actual Cost/GP.

Order không có Tracking vẫn có expectation theo Lot, cần invoice trực tiếp Lot của Supplier mới. ePacket aggregate chưa mapping component vẫn UNKNOWN theo quy tắc đối soát chung. Cost import sau Switch chỉ đối soát cost, không chạy lại nhánh legacy sửa Charge/giá. Statement snapshot đã phát hành không đổi.

## Hồ sơ Supplier rời tuyến · Phase 4

Mỗi Switch thành công lưu cùng giao dịch một hồ sơ void cho cặp Incident ID và Order, ghi Route/Supplier gốc, Lot, Tracking/Label và cấu hình phí tại thời điểm chuyển. Hàng đợi theo Incident theo dõi toàn bộ Order đã chuyển, kể cả khi nhập Excel. Lỗi Switch rollback hồ sơ; retry giữ nguyên kết quả gốc kể cả khi Order đã được chuyển lần nữa. Phần này giữ nguyên sổ Client và Supplier. Chi tiết trạng thái, quyền và đối soát còn mở theo [Feature 30](30-supplier-cancellation-followup.md).

## Excel và hàng chờ lỗi
Download từ Hold, một dòng cho mỗi Tracking. Điền Route ID mới trên dòng xử lý; blank Route bỏ qua dòng. Route-only không bắt nhập Tracking ID mới/Label. Nếu replacement, tất cả dòng/Tracking của Order phải đầy đủ. Giới hạn 5 MB, 2.000 dòng, 250 Order. Không nhận formula/hyperlink.

Parse theo dòng, nhóm theo Order; lỗi của một Order không hủy kết quả Order khác. Mỗi Order thành công được giữ lại; Order lỗi còn HOLD/unresolved, lưu `last_error`, hiện trong alert khi tải lại trang, retry bằng cùng file đã sửa. Header/file hỏng hoặc vượt giới hạn bị từ chối trước khi xử lý; các Order unresolved vẫn trong hàng chờ. Không cố đoán Order khi DMD ID không đọc được. Success xóa lỗi của chính Order đó. Các dòng thành công có thể replay an toàn.

## Nguồn và kiểm chứng
`emergency-hold.ts`, `emergency-switch.ts`, `emergency-schema.ts`, `emergency-excel.ts`, `reconciliation.ts`, `order-operations.ts`, API service-routes/:id/emergency và `emergency-switch-workspace.tsx`.

`scripts/verify-emergency-hold.cjs`: database synthetic tạm; tiền/Statement bất biến, route-only, full replacement, rollback audit, role, Manifest history, duplicate/retry, worker concurrency/Switch-vs-Undo, cost cũ+mới, cost import retry và mixed Excel recovery. Kết quả thực chạy và giới hạn ghi trong [audit mới](AUDIT-EMERGENCY-SIMPLIFICATION-2026-10-24.md).

## Emergency Hold trong Orders · 25/11/2026

Admin mở **Emergency Hold** trong Orders và chọn một Route hoặc đồng thời các Route đang hoạt động của cùng Service/SubService. Phạm vi SubService dùng một giao dịch để áp dụng các Route được cấu hình tại lúc Hold. Điều kiện trước bàn giao và các ngoại lệ thủ công giữ theo quy tắc ở trên. Lý do Incident và chi tiết xử lý nằm trong API và audit nội bộ.

- Mở Route đang Hold để đổi Route hoặc ghi bộ Tracking/Label thay thế. Bộ thay thế đầy đủ có thể dùng lại Route gốc nếu Route đang hoạt động và trước sự cố không có Hold kho khác. Hệ thống lưu hồ sơ void và lượt Supplier cũ. Admin tiếp tục xử lý chứng từ/cổng của Supplier để void và lấy label mới.
- Chọn một hoặc nhiều Order, nhập lý do để **Tiếp tục** hoặc **Huỷ**. Tiếp tục khôi phục workflow gốc và bỏ qua Hold do Incident cho chính Order đó. Các Hold độc lập vẫn có hiệu lực. Huỷ áp dụng chính sách hiện hành trong cùng giao dịch và hoàn tác nếu chính sách từ chối. Lý do nội bộ chỉ vào audit; quy trình huỷ thông thường ghi nội dung công khai chung.
- Kết quả mỗi Order được ghi trong một giao dịch. Lặp thao tác đã thành công trả về kết quả đã xử lý. Undo trên Route khôi phục các Order còn chờ, giữ các kết quả đã xử lý.

Kiểm chứng miền nghiệp vụ tại `scripts/verify-vnd-supplier-recovery.cjs` và `scripts/verify-emergency-hold.cjs`.
