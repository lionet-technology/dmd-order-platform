# Verification — 16/10/2026

Phạm vi lượt này: cập nhật source-of-truth vận hành theo phản hồi Owner, liên kết feature rules, rà xung đột và bổ sung shipment FAILED. Không xác nhận toàn bộ GĐ1 đã hoàn thành.

## Thay đổi
- `docs/Feature/OPERATIONAL-FLOW.md`: sơ đồ tổng thể, cân đo/phụ phí, tracking và cost; bảng IMPLEMENTED/APPROVED/DEFERRED; quyền GP-Net và Supplier scope.
- Đồng bộ README, Decisions, Roadmap và các feature 01/05/07/08/09/10.
- API shipment-status nhận FAILED; GET view=failed; active view loại FAILED. UI label/dropdown/bulk sheet/tab có Failed.
- Regression API thực tế bổ sung vào verify-rbac: Sales bị từ chối, Admin cập nhật, FAILED ra khỏi active và có filter riêng, không đặt delivered_at, không tạo/resolve Case, retry và sửa lại IN_TRANSIT.

## Kết quả chạy thực tế

Runtime: Node v20.20.2 đã có tại máy, tương thích better-sqlite3 ABI 115. Không cài lại dependencies.

| Kiểm tra | Kết quả |
|---|---|
| TypeScript `--noEmit --incremental false` | PASS |
| Next local production build | PASS, 36 static pages; không deploy |
| ESLint route shipment-status, order-workspaces, verify-rbac | PASS |
| verify-rbac | PASS — 32 assertions |
| verify-operations | PASS — 57 assertions |
| verify-debt-reconciliation | PASS — 48 assertions |
| verify-order-cancellation | PASS — 128 assertions |
| git diff --check | PASS |

Tổng 265 assertions ở 4 suite đã chạy, không phải toàn bộ regression suite. Browser UAT chưa chạy. Không lấy số 747 ở báo cáo trước làm kết quả lượt này.

## Vướng mắc môi trường đã xử lý
- Lần chạy đầu bằng bundled Node 24 lỗi native ABI, chưa chạy được assertions; chuyển đúng Node 20 có sẵn rồi chạy lại PASS.
- Typecheck ban đầu lỗi duplicate types do `.next/types/* 2.ts`. Kiểm tra nội dung byte-identical với bản chuẩn rồi chuyển bốn bản sao sang workspace `work/generated-types-backup/`; giữ nguyên source, không nới tsconfig để bỏ lỗi. Typecheck/build sau đó PASS.
- Cancellation test lần đầu không tạo được `.smoke/` do sandbox; chạy lại với quyền filesystem được duyệt, dùng database test riêng PASS.

## Khoảng trống được ghi nhận, chưa sửa hành vi
- Auto surcharge cân đo còn PENDING_APPROVAL; service-invalid quote hiện rollback measurement, chưa lưu evidence/flow Admin hold/reroute/return.
- Cost aggregate theo Lot chưa phân biệt ePacket placeholder Mid-mile và actual component coverage; chưa xác nhận tránh double count ở cấp báo cáo.
- GP-Net hiện ADMIN có thể xem đầy đủ; chưa có permission BOD/authorized finance riêng. Release blocker, không coi 32 RBAC checks đã chứng minh yêu cầu quyền mới.
- Supplier account/portal và actual Mid-mile allocation/Cargo DEFERRED, cần permission/allocation spec trước triển khai.
- Browser UAT, migration dữ liệu thật, cấu hình policy Supplier thực tế chưa nghiệm thu.

Không push, deploy, reset hoặc migrate dữ liệu thật. Test database tách biệt. Build có thể tạo cache/artifacts `.next`, không phải phát hành production.
