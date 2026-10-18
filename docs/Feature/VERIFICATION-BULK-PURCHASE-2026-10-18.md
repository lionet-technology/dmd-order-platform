# Bulk purchase & Admin queue — 18/10/2026

## Thay đổi

- `POST /api/client-orders` action `purchase` trả `{results, succeeded, failed}` theo đúng thứ tự lựa chọn. Mỗi Order được xử lý trong transaction độc lập; Order lỗi không rollback những Order đã reserve thành công. Response từng Order có status PURCHASED/FAILED, error_type DATA/SYSTEM và lý do; không tự retry.
- Client UI hiển thị tổng thành công/thất bại và lý do theo Order, giữ lại các Draft lỗi để người dùng chỉnh sửa hoặc xác nhận mua lại; không tự đánh dấu chọn mua lại sau lỗi.
- `GET /api/orders/tracking-queue` mặc định `view=READY`; `view=ISSUES` cho các Order thiếu template, dữ liệu, cấu hình giá, hoặc bị chặn về sức mua. Draft Client chưa đặt mua vẫn không vào queue Admin. Thống kê theo Order, không theo Carton. Export XLSX giữ cùng bộ lọc.
- Admin bulk UI tách hai view Sẵn sàng mua / Cần xử lý, hiển thị lý do; view lỗi không cho phép cấp tracking/mua trực tiếp. Backend vẫn kiểm tra lại điều kiện ở thời điểm lưu để phòng trạng thái tài chính thay đổi.

## Kiểm chứng độc lập

- `npm test`: **PASS 19/19 suite, 1.025 assertions** (ePacket tăng từ 159 lên 170), gồm valid + invalid Order trong cùng batch; reserve idempotent; Balance đủ 2/3 đơn, 2 đơn đã reserve vẫn giữ nguyên sau lỗi đơn thứ ba; queue READY/ISSUES và loại Draft Client chưa mua.
- `npm run lint`: PASS. `npm run typecheck -- --incremental false`: PASS (dọn generated duplicate `.next/types` trùng byte trước khi chạy, không sửa source để né lỗi).
- `npm run build` với DB `.smoke` mới: PASS, 37/37 static pages.
- `git diff --check`: PASS. Chưa thực hiện browser UAT đa phiên hoặc giả lập mất kết nối.

## Giới hạn & lưu ý

- Đây là vòng sửa theo rule đã chốt, chưa phải nghiệm thu UI với dữ liệu thật hoặc nhiều người thao tác cùng lúc.
- Điều kiện Balance có thể thay đổi sau khi load queue. Backend phải tiếp tục chặn tại thời điểm giao dịch, không dựa vào trạng thái READY trên UI.
- Đơn bị lỗi có thể được sửa thông qua Draft hiện có; không tự động mua khi khách nạp tiền.
- Các rule Base Rate UPS/Yun/custom chưa hoàn thiện vẫn thuộc backlog riêng.
