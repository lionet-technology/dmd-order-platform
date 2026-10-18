# DMD Report — triển khai local 15/10/2026
Repo: /Users/quan/Desktop/report; main, HEAD cebd058. Không commit/push/deploy production; không áp migration lên database thật.

## Kiểm tra trước khi sửa
- Repo đã có nhiều thay đổi chưa commit từ dev/lượt Debt–Reconciliation trước. Giữ nguyên các thay đổi ngoài phạm vi, không reset/checkout.
- Git chỉ có worktree chính. CodingAgent không có background process; không thấy listener cổng 3000 lúc kiểm tra.
- Work state .agent/state/current-task.json cập nhật 06/10, HEAD b250dd0; là bản ghi cũ, không dùng để suy luận rằng HEAD hiện tại đã được kiểm thử. Giữ nguyên.
- Lưu baseline diff trước lượt này; bổ sung bằng các patch kiểm tra exact text, không ghi đè nguồn khác.

## Đã triển khai
- Policy riêng Service + Sub-Service + Supplier; tab Hoàn / Huỷ trong Service Configuration.
- Rules PRE_PURCHASE, PURCHASED (đang mua), ISSUED, SHIPPED; allowed và refund_percent. Thiếu policy/rule từ chối huỷ. SHIPPED chỉ huỷ khi Supplier cho phép rõ ràng; đã giao/đóng và Cargo bị chặn GĐ1.
- Huỷ tự động cho Client/Sales có ownership hoặc Admin, không duyệt Admin; không Manual Cancellation Override.
- Refund theo tổng đã charge gồm các phụ phí Order/Lot, trừ refund cũ, chặn vượt mức; pre-charge release reserve không credit giả.
- Immediate transaction, unique refund + trạng thái Order làm idempotency, audit chứa route/version/stage. Lỗi audit rollback.
- Policy history có version, lý do/actor và trigger chống sửa/xoá lịch sử.
- Pending approval legacy chuyển POLICY_RECHECK một lần có audit, giữ requester/thời điểm, không tự hoàn tiền. Control Tower/API cũ thực thi rule hiện tại.
- Balance Adjustment Credit riêng: Admin form tại Finance controls; action balance_credit trên /api/financials, amount dương, reason và request_key bắt buộc. ADJUSTMENT_CREDIT riêng, audit và receipt chống retry/payload conflict; không sửa cancellation/Actual Supplier Cost.
- Sửa GP sau huỷ để không cộng lại surcharge Lot đã nằm trong số tiền giữ lại.
- Reconciliation/Debt trước đó giữ nguyên: theo số Lot, Actual>Estimated Review, single active Debt/client, lịch sử lãi không hồi tố, payment debt-first. Chạy lại regression tương ứng.
- Đồng bộ Order Flow regression cũ: tạo đủ Lot/estimate trong fixture, supplier feed không tự thu phụ phí khách.
- Cập nhật docs/Feature 03,06,08,09, README, ROADMAP, decisions D16–D17 và báo cáo verification.

## Kiểm chứng
Node 20.20.2 arm64 tương thích better-sqlite3 của repo. Database test tạm, tách dữ liệu thật.

| Bộ kiểm thử | Kết quả |
|---|---:|
| Cancellation + hỗ trợ Credit | PASS — 128 |
| Debt/Reconciliation | PASS — 48 |
| Credit | PASS — 48 |
| Operations | PASS — 49 |
| Purchase Engine | PASS — 45 |
| Domain Finance | PASS — 69 |
| Balance idempotency | PASS — 6 |
| RBAC | PASS — 23 |
| Order Flow | PASS — 24 |
| Route Segmentation | PASS — 36 |
| Manifest Cartons | PASS — 57 |
| ePacket | PASS — 159 |

Tổng 12 bộ: 692 checks/assertions. TypeScript scoped toàn src PASS; ESLint các file sửa/thêm PASS không warning; git diff --check PASS.

TypeScript toàn repository vẫn lỗi các bản sao nguồn cũ trong Codex/2026-10-06 và Codex/2026-10-09, đã tồn tại ở lượt trước. Không sửa/xoá các bản sao hoặc tsconfig. Chưa chạy production build/browser UAT; không xác nhận production-ready.

## Blockers / trước release
1. Admin nhập tỷ lệ/điều kiện thực tế từng Supplier. Không seed tỷ lệ 100/90 giả định; tuyến chưa có policy không huỷ được.
2. Carrier cancellation/void label API chưa tích hợp; hiện thực thi huỷ/tracking availability trong app. Cần xác nhận quy trình supplier và UAT.
3. Claim nhiều Order chưa có refund allocation từng Order: trừ toàn Claim refund liên quan một cách bảo thủ, tránh over-refund nhưng có thể under-refund. Cần chốt phân bổ và nghiệm thu.
4. UAT form policy, support credit và quy trình migration với dữ liệu lịch sử; backup/đối chiếu trước rollout.
5. Debt/Reconciliation còn các hạn chế đã ghi: migration nhiều active Debt legacy, FX/cost feed mapping, báo cáo GP kỳ đã khoá, scheduler lãi độc lập.
6. Support credit được hạch toán riêng vào ledger; phân bổ khoản hỗ trợ vào từng Order/GP hoặc báo cáo chi phí doanh nghiệp chưa bổ sung quy tắc riêng.

## File chính của lượt này
- src/lib/cancellation-config.ts, order-cancellation.ts, credit.ts, reconciliation.ts, control-tower.ts
- src/app/api/service-routes/route.ts, api/cancellation-requests/route.ts
- src/app/cancellation-policy-panel.tsx, service-workspace.tsx, order-workspaces.tsx, financial-workspace.tsx, operations-workspace.tsx
- scripts/verify-order-cancellation.cjs, verify-order-flow.cjs
- docs/Feature/06-cancellation.md và các docs phụ thuộc.
