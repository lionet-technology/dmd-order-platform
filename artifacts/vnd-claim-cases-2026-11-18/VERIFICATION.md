# VNĐ Claim NEXT · Kiểm chứng triển khai 18/11/2026

HEAD local, origin/main và main trên GitHub được kiểm tra trước thay đổi và cùng ở `f9c90f1b1f11e442f958624c203b12c5bdde8354`. Đặc tả và điều kiện nghiệm thu nằm trong [Feature 42](../../docs/Feature/42-vnd-claim-refund-next.md).

## Phạm vi kiểm thử

- Client và Supplier đánh dấu Order trước khi tạo case, chọn Order từ watchlist, ghi trao đổi có actor/thời điểm, Complete và xem liên kết với Claim. Supplier có kiểm thử một case chứa hai Order. Link thủ công do Finance/BOD và yêu cầu Order chung.
- Complete ghi vào journal quyết định cùng transaction. Complete với số tiền 0 giữ nguyên pool. Luồng Bank/Balance, Supplier Bank/Offset, retry, revision, quyền tài khoản và privacy tiếp tục qua kiểm thử hồi quy.
- Báo cáo BOD vẫn giữ Refund chưa phân bổ ở cấp Claim. GP/commission sau Refund liên nhóm tiếp tục OPEN. Cancellation theo Service giữ luồng riêng.

## Kết quả

- Regression PASS 68 suites. Client Refund 74 assertions, Supplier Claim 65, commission 43 và Supplier close 38.

- [Chrome UAT](browser-uat.json) PASS 90 assertions qua năm vai trò, dùng Chrome localhost và fixture TEST. Ảnh minh họa có [Supplier desktop](uat-supplier-receivable-desktop.png) và [Supplier mobile](uat-supplier-receivable-mobile.png).
- [Backup/restore TEST](claim-restore.json) PASS 11 bảng có dữ liệu, gồm Processing, watchlist và link. SQLite integrity và foreign keys PASS.
- Typecheck, lint và production build PASS. Build có cảnh báo tracing động hiện hữu ở `src/lib/db.ts`. Build dùng DB tạm riêng.

## Còn mở

Pilot bằng chứng từ thật, restore ở môi trường triển khai non-production và nghiệm thu vận hành cần dữ liệu và môi trường xác nhận. Đối chiếu liên kết chứng từ giữa Supplier Actual/payable và receivable vẫn là phần riêng. Đợt này chỉ dùng dữ liệu TEST và không chạy Jenkins hoặc production.
