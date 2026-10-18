# DMD Report — kết quả cập nhật 14/10/2026

Repo: `/Users/quan/Desktop/report`. Chỉnh sửa local; không commit/push/deploy, không chạy trên database production.

## Đã triển khai
- Một active Debt/client; top-up gốc cùng Debt, lưu nguồn từng statement và audit; gia hạn deadline. Nhiều Debt legacy đang mở không tự hợp nhất.
- Chuyển receivable sang Debt giải phóng sức mua không tạo Payment. Payment trả Debt không tăng sức mua lần hai; lãi không tạo wallet giả. Debt quá hạn chặn Purchase.
- Lãi %/ngày trên gốc còn lại, làm tròn cent cuối ngày. Event hiệu lực ngày thay đổi theo Asia/Ho_Chi_Minh, ghi nhận ngày đã kết thúc khi hoạt động tài chính; lãi cũ bất biến. Mặc định lãi 0 nếu chưa cấu hình, không backfill lãi legacy.
- Payment tự trả Debt (lãi rồi gốc), sau đó operational receivable FIFO deadline/kỳ/id. Admin override đích phân bổ hoặc trả gốc trước có lý do/audit.
- Reconciliation theo Order + số Lot, nhập cost trực tiếp không cần tracking đại diện. Actual > Estimated Review; không vượt tự Pass khi đủ dữ liệu. Thiếu cost Pending, thiếu estimate Review.
- Admin cost thay thế có audit, phụ phí độc lập có public note + request_key, absorb loss, bulk nguyên tử và late cost adjustment +/- bất biến. Không tự đổi Sales Price hay thu phí từ supplier feed.
- GP ước tính và finalized tách trường riêng; finalized nullable khi Pending/Review, margin N/A nếu revenue=0. Xử lý doanh thu sau cancellation/refund.
- Form Debt đổi lãi/gia hạn; màn Admin Lot/bulk và nhập supplier cost theo Lot.
- Cập nhật docs/Feature 04, 08, 09, README, ROADMAP và decision log D10–D15.

## Kiểm chứng
Tất cả regression chạy với SQLite tạm, tách dữ liệu thật. Runtime Node 20 arm64 tương thích thư viện SQLite hiện có.

| Kiểm tra | Kết quả |
|---|---|
| verify-debt-reconciliation | PASS — 48 checks |
| verify-credit | PASS — 48 checks |
| verify-domain-finance | PASS — 69 checks |
| verify-purchase-engine | PASS — 45 assertions |
| verify-operations | PASS — 49 checks |
| verify-order-cancellation | PASS — 108 assertions |
| verify-balance-idempotency | PASS — 6 checks |
| TypeScript cho src đang chạy | PASS |
| ESLint các file code đã sửa/thêm | PASS |
| git diff --check | PASS |

Tổng regression: 373 checks/assertions. Purchase regression được cập nhật đúng quyết định mới: đặt estimate từng Lot, supplier fee/tax không tự ghi khoản thu Client.

TypeScript toàn repository vẫn báo lỗi các bản sao source có từ trước trong `Codex/2026-10-06/...` và `Codex/2026-10-09/...`. Không sửa hoặc xóa các bản sao này; kiểm tra scoped bao gồm toàn bộ `src/**/*.ts(x)` và next-env, giữ nguyên tsconfig repo. Chưa chạy production build hoặc browser UAT.

## Phần cần chốt / nghiệm thu
- Chuẩn hóa total_net_cost inclusive phí/thuế và oversize theo từng supplier, FX/multi-currency. Hiện dùng total_net_cost đã chuẩn hóa, không tự cộng các cột phí thu khách vào cost.
- Estimate riêng nhiều Lot do Admin cung cấp; không tự chia estimate Order theo trọng lượng/số kiện khi chưa có quy tắc.
- Báo cáo GP/statement kỳ đã khóa: đã có version và ledger adjustment kỳ hiện tại, chưa có quyết định reissue báo cáo/export đã khóa.
- Hoàn/giảm phụ phí đã thu khi cost giảm: cần policy/Claim; không tự refund.
- Migration nhiều Debt legacy và acceptance dữ liệu lịch sử; scheduler lãi độc lập chưa có (hiện lazy accrual).
- UAT màn UI mới, kiểm tra pagination/quy mô lớn của bảng Lot và supplier source_key payload conflict legacy trước release.

## Bảo toàn công việc dev khác
Giữ nguyên thay đổi có sẵn ở AGENTS.md, README.md gốc, next-env.d.ts, Codex/, docs/README.md và việc chuyển tài liệu legacy. Chỉ cập nhật phần feature liên quan quyết định được giao và các code/tests nêu trên; không reset/checkout/cherry-pick công việc của người khác.

## File code chính
- `src/lib/credit.ts`, `src/lib/debt-interest.ts`
- `src/lib/reconciliation.ts`, `src/lib/finance.ts`, `src/lib/order-operations.ts`, `src/lib/order-shipments.ts`
- `src/app/api/reconciliation/route.ts`
- `src/app/financial-workspace.tsx`, `src/app/reconciliation-workspace.tsx`, `src/app/page.tsx`
- `scripts/verify-debt-reconciliation.cjs`, `scripts/verify-purchase-engine.cjs`, `package.json`
