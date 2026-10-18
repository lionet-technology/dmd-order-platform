# Tracking, Label & trạng thái vận chuyển

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Theo dõi tracking thuộc Order/lot; ghi nhận đổi tracking, cập nhật shipment status, thời gian giao và log nội bộ.
- Theo nghiệp vụ đề ra, màn bulk tracking/label cần thao tác dạng spreadsheet, phân nhóm theo Order, chỉnh supplier/lot một lần cho Order.
- Khi tracking/label có hiệu lực có thể ảnh hưởng trạng thái mua, charge, điều kiện huỷ, manifest và history.
## Điểm kiểm tra
- Nhập hàng loạt không gắn tracking sai Order; tracking cũ không làm mất bằng chứng đã bàn giao; lỗi từng dòng thể hiện rõ.
## Nguồn
- `src/app/api/orders/tracking-queue/`, `src/app/api/orders/tracking-replacements/`, `src/app/api/shipment-status/`, `src/lib/order-shipments.ts`, `src/lib/order-timeline.ts`.
## Cần xác nhận
- Chi tiết UI spreadsheet và ràng buộc unique cần kiểm chứng bằng browser acceptance.

## Delta 16/10 — shipment FAILED
- IMPLEMENTED local: Admin cập nhật FAILED qua POST /api/shipment-status và dropdown/bulk sheet. Tab Failed dùng GET ?view=failed; queue active/Theo ETD loại FAILED, DELIVERED, ALERT, EXCEPTION. Vẫn yêu cầu Tracking ACTIVE, ETD và Order mở.
- Lưu status/actor/history, không đặt delivered_at; Admin được sửa trạng thái khi có thông tin mới. Không tự đổi Case, refund hay purchase status; không tự backfill đơn IN_TRANSIT lâu ngày.
- Case SOLVED (code RESOLVED/CLOSED) độc lập với shipment FAILED. Bằng chứng: route.ts, order-workspaces.tsx, regression verify-rbac.cjs; [Operational Flow](OPERATIONAL-FLOW.md).

## Internal UAT 18/10 — phạm vi sheet
- Lưu Tracking/Label chỉ gửi các Order có Tracking trong sheet, giữ đủ dòng Carton thuộc Order đó. Không đặt mua hoặc kiểm tra credit các Order trống không liên quan trong queue.
- Xuất mua chỉ persist các Order đã chọn; không thay route/reserve của các Order còn lại.
- Phát hiện bằng browser trên queue nhiều Client có một Client bị khóa; xem INTERNAL-UAT-2026-10-18.md để biết kết quả retest và giới hạn.
- Thông báo lưu/xuất thành công được giữ sau tự tải lại queue; đổi filter xóa thông báo cũ.
