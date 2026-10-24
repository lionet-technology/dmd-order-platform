## Emergency đơn giản hóa — 24/10/2026
Đổi Route trên Order gốc, Tracking/Label và Net Cost optional; blank giữ nguyên. Nếu thay Tracking thì thay đủ bộ ACTIVE. Cost Supplier cũ/mới tách chứng từ, không tự COMPLETE chỉ vì giữ label; cost import sau Switch không sửa Charge. Order upload lỗi còn HOLD, lưu alert để retry; từng Order thành công được giữ. Bất kỳ carton đã export Manifest thì toàn Order xử lý thủ công. [Quy tắc hiện hành](18-emergency-route-hold.md).

# Tracking, Label & trạng thái vận chuyển

## Owner continuation — 22/10/2026 (current delta)

See [implementation, debt-age assumptions, test evidence and explicit remaining gates](OWNER-EXECUTION-2026-10-22.md). Five horizontal financial task tabs; read-only financial GETs; deterministic frozen-period debt aging; Tracking/Label before manual price; price/finalization gate; auditable partial-label override; server Ledger pagination. This delta supersedes contrary historical behavior below. No deployment or full production acceptance.


## UPS/chuyên tuyến manual charge gate 20/10/2026
Admin trong cả màn Tracking/Label hàng loạt và Order detail phải nhập **giá bán USD cho cả Order**, không phải theo từng Carton. Thiếu giá, giá cents sai hoặc Credit/Balance không đủ thì chặn trước khi tạo Tracking, rollback. Khi đủ giá, Reserve một lần; Label ghi Charge một lần; các Carton còn lại/retry không charge thêm. Manual Route chưa có Supplier Template vẫn có thể nhập Tracking thủ công; export file mua vẫn đòi Template thật. Xem `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.


## P1 continuation — 20/10/2026 (latest)

Bulk Tracking retry now preserves an omitted sub-service instead of clearing the locked route. New 19-assertion recovery regression covers second-group transaction rollback, exact retry and explicit failed-Draft reselection; no automatic Balance Adjustment. Statement synchronization reuses its prepared lookup. Final test/lint/typecheck/build pass; 27 domain suites. New HTTP runner verifies 10k-entry concurrency (600 requests, zero errors), signed financial writes, 12 concurrent finalizations and application restart from a verified backup restored into a new synthetic DB. Five-role desktop/mobile browser smoke is recorded separately from full workflow acceptance. Priced UPS/Yun multi-carton reserve-to-Statement integration, full workflow UAT, deployment-target rehearsal and real pilot remain open. See [verification and limits](VERIFICATION-P1-CONTINUATION-2026-10-20.md) and [pilot checklist](PILOT-CHECKLIST-2026-10-20.md).

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
- Tiếp tục 18/10: sheet mobile cho phép cuộn toàn bộ nội dung modal và dành vùng bảng cao tối thiểu 280 px; không để toolbar chiếm hết vùng dòng. Checkbox có kích thước riêng và tên Order/DMD ID cho truy cập bàn phím/screen reader. Chưa đồng nghĩa acceptance trên máy thật.

## UAT sau 4a836ea — 18/10
Browser xác nhận partial purchase, READY tách Draft, export một Order và lưu Tracking/Label. Sửa phân loại account eligibility sang DATA ngay cả khi lý do khóa mua là văn bản tùy nhập; không đổi guard mua/reserve/charge. Xem [biên bản](UAT-BULK-LEDGER-2026-10-18.md).
