# GĐ1 · Retest View VNĐ · 26/11/2026

Baseline `988e6629aac7c7dd18d84d6f6e7d9d933ce1a6a7` đã đối chiếu GitHub main. Chạy trên bản build localhost, Chrome và SQLite TEST dùng một lần.

## Bước tái hiện

1. Đăng nhập lần lượt Admin, Sales, Client trong fixture VNĐ. Vào Orders và tìm `continuation-test-81` (#52, Tracking `TEST-UAT-CLAIM-TRACKING`). Trên baseline, ca tái hiện dùng Order `continuation-test-90`; View VNĐ chuyển sang `/vnd` và mất ngữ cảnh.
2. Trên bản sửa, bấm View VNĐ. Theo dõi GET chi tiết với đúng ID, mã Order trong tiêu đề và Tracking/Label. Chọn Giao dịch VNĐ và đối chiếu charge với sổ tài khoản.
3. Bấm Quay lại danh sách và xác nhận từ khóa, dòng đã chọn và màn hình Orders. Lặp lại ở Chrome desktop 1440 × 1000 và viewport mobile 390 × 844.
4. Gọi trực tiếp GET chi tiết Order #56 bằng phiên Sales và Client trong fixture. HTTP 403 và phản hồi không có dữ liệu bút toán. Order được cấp quyền trả đúng ID và chỉ có thông tin bút toán cần hiển thị. So khớp Balance và toàn bộ các dòng Ledger đọc được trước và sau thao tác.
5. Với Client, mở lại Order đã huỷ #45. Thông báo và bút toán hoàn đều hiển thị `8862869.9425563 VNĐ`. [Ảnh](order-detail-cancellation.png), [kết quả](cancellation.log).

| Vai trò | Baseline desktop | Baseline 390 px | Bản sửa desktop | Bản sửa 390 px |
|---|---|---|---|---|
| Admin | [Trước](before-admin-1440.png) | [Trước](before-admin-390.png) | [Sau](order-detail-admin-1440.png) | [Sau](order-detail-admin-390.png) |
| Sales | [Trước](before-sales-1440.png) | [Trước](before-sales-390.png) | [Sau](order-detail-sales-1440.png) | [Sau](order-detail-sales-390.png) |
| Client | [Trước](before-client-1440.png) | [Trước](before-client-390.png) | [Sau](order-detail-client-1440.png) | [Sau](order-detail-client-390.png) |

[Script Chrome/HTTP](../../../scripts/e2e-vnd-v1.cjs) · [Kết quả chi tiết theo vai trò và viewport](order-detail-results.json) · [Ca CSV và smoke theo vai trò](operational-checks.json) · [Control Tower Admin](dry-admin-control-tower.png) · [Balance Ledger → Refund Client](dry-client-ledger-refund.png).

## Đối chiếu tiền VNĐ

- [Approved Decisions](../../../docs/Feature/SERVICE-V1-APPROVED-DECISIONS.md) và [VNĐ Money Foundation](../../../docs/Feature/32-vnd-money-foundation.md) giữ số lẻ VNĐ. UPS dùng rate gốc VNĐ, làm tròn cân theo Carton/Lot, tính Net từ các cấu phần giảm giá, phí, fuel/VAT, broker và customs. Base, Retail và Selling áp lần lượt markup Net→Base, Base→Retail và discount của Client. Ca UPS này dùng `fx_version_id=null`; nhánh ePacket US dùng FX đã xác nhận cho giá USD.
- `TEST-DRY-CSV-01` (#60) báo giá `2505090.7757568` VNĐ, chuyển RESERVED rồi CHARGED sau Tracking/Label. SQLite lưu delta dạng TEXT `-2505090.7757568` đúng một lần. Balance khớp phép trừ chính xác từ Balance trước charge. Cả ba vai trò xem được giá và khoản charge của đúng Order. [Ảnh Order CSV](dry-client-order-detail-fixed.png).
- Tab chi tiết dùng trực tiếp chuỗi thập phân. Số hoàn lấy từ bút toán đã ghi và hiển thị đúng đơn vị VNĐ. Hồi quy Supplier Recovery, GP-Net và snapshot GP-Base/Commission qua. Công thức hiện hành lấy tổng thu sau Client Refund đã duyệt trừ tổng chi sau Supplier Recovery đã duyệt, gồm thuế và phụ phí theo cấu phần. Bank và Payable Offset tất toán phải thu.

## Kết quả trên bản build kiểm thử

- `npm test` qua 72 bộ. `npm run typecheck -- --incremental false`, `npm run lint` và `npm run build` qua. Build có cảnh báo Turbopack về đường dẫn SQLite động.
- [233 kiểm tra Chrome/HTTP trên năm vai trò](browser-uat.json), cộng [11 kiểm tra Emergency/Recovery](emergency-recovery.log). [Ảnh A → B → A](emergency-return.png) · [Ảnh gom Recovery](recovery.png).
- [SQLite backup/restore](claim-restore.json) khớp từng dòng của 23 bảng. Integrity OK và không có vi phạm khoá ngoại. Workbook nguồn khớp SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

OPEN cho điện thoại thật, hồ sơ thực tế xuyên suốt, chứng từ Supplier thật, Claim lịch sử thiếu phân bổ và bản sao dưới mã khác. SHA/health của DEV/TEST đang triển khai chưa được xác minh. [Checklist pilot](../../../docs/Feature/UAT-GD1-PILOT-2026-11-26.md).
