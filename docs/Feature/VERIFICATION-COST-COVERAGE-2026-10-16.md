# DMD Report — triển khai cost coverage 16/10/2026

Source: /Users/quan/Desktop/report. Đã cập nhật source local; không push/deploy, không mở database thật, không reset dữ liệu.

## Đã làm
- Additive schema cho bốn cost component LAST_MILE, MID_MILE, WAREHOUSE, OTHER theo Lot; reference giữ liên kết tracking/Lot, allocation tương lai, carton/order hoặc supplier document.
- API đối soát hỗ trợ component nội bộ, request key, audit, transaction; UI vẫn nhập tổng estimate/actual, thêm nhãn chi phí đã xác nhận.
- Thiếu actual component giữ estimate trong effective cost. Actual thay estimate cùng component; không cộng trùng Mid-mile. Zero actual được phân biệt với null.
- ePacket aggregate chưa rõ coverage: UNKNOWN, effective total null, không tự coi Mid-mile bằng zero hoặc cộng nguyên estimate vào supplier cost. Estimated GP vẫn riêng; finalized GP chỉ khi đối soát sạch và coverage COMPLETE.
- Component/coverage snapshot lưu cùng version bất biến; thay coverage đánh giá lại dù tổng tiền không đổi. Không thay snapshot giá bán.
- Chặn trộn aggregate supplier feed và component model khi chưa có mapping. Không tự phân rã cost lịch sử.
- Feature docs cập nhật: 09-supplier-reconciliation, README và ROADMAP.

## Kiểm chứng thực tế
Node 20.20.2 (khớp SQLite native của dự án), database test riêng:
- verify-debt-reconciliation.cjs: PASS, 58 checks, gồm coverage, snapshot, retry, rollback, giá bán bất biến và schema rerun.
- verify-domain-finance.cjs: PASS, 69 checks.
- verify-order-cancellation.cjs: PASS, 128 assertions.
- TypeScript --noEmit --incremental false: PASS.
- ESLint các file sửa: 0 errors, 1 warning createSession chưa dùng trong test.
- Chưa chạy build production hoặc browser UAT.

## Giới hạn / phần tiếp theo
- Chưa triển khai Cargo allocation chargeable weight, supplier mapping/FX, quyền GP-Net BOD/finance D22, đóng kỳ/export revision.
- Lot đã có aggregate cost không được chuyển tự động sang component. Cần mapping rõ coverage trước để không double count. UI không yêu cầu nhân sự nhập bốn phần.
- Dữ liệu lịch sử không backfill: các report khác đọc finalized GP cũ cần rà soát/reconcile trước khi khẳng định fully actual. Chưa xác nhận mọi báo cáo/export cũ đã áp dụng coverage.
- Finalized reconciliation và actual coverage được tách trong API/report đối soát; chưa chứng minh UAT toàn hệ thống.
- Bộ duyệt tự động từ chối đề xuất null finalized GP ePacket lịch sử vì sửa giá trị lịch sử vượt migration additive. Bước đó đã loại bỏ hoàn toàn; không có yêu cầu duyệt còn chờ.
