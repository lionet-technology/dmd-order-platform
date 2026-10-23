# Huỷ đơn & hoàn tiền — GĐ1

## Emergency Hold — 23/10/2026
Ordinary cancellation of an emergency-held order is blocked transactionally, preserving money. Emergency cancellation/replacement is NOT implemented and must not call the normal refund flow. [Safe stage 1 and phase 2 requirements](18-emergency-route-hold.md).
**Trạng thái:** Implemented local; chưa UAT/production. **Cập nhật:** 2026-10-15.

## Quyết định được triển khai
- Policy riêng từng Service Config/route: Service + Sub-Service + Supplier. Admin cấu hình tại tab **Hoàn / Huỷ** trong Cấu hình dịch vụ, kèm lý do/căn cứ Supplier.
- Trạng thái PRE_PURCHASE (chưa mua), PURCHASED (đang PURCHASING chưa cấp tracking/label), ISSUED (đã cấp tracking/label hoặc hoàn tất mua), SHIPPED (đã bàn giao/bắt đầu vận chuyển). Mỗi rule có allowed và refund_percent 0–100. Trạng thái thiếu rule hoặc route chưa có policy: từ chối huỷ, kể cả Admin. Không seed 100/90 theo giả định supplier.
- Đủ rule → Client/Sales có quyền trên Order hoặc Admin huỷ và hoàn tự động. **Không cần Admin phê duyệt. Không có Manual Cancellation Override.**
- Đã vận chuyển/bàn giao chỉ huỷ nếu rule SHIPPED cho phép; thiếu rule sẽ từ chối. Đã giao/kết thúc hoặc Cargo không hỗ trợ huỷ tự động GĐ1. Kiểm tra tracking cũ/replaced, lịch sử và fulfillment latch để không bypass khi reset tracking.
- Hỗ trợ ngoài policy dùng form Balance Adjustment Credit tại Finance controls (Admin), action balance_credit trên /api/financials, amount dương, reason và request_key bắt buộc, audit/receipt chống retry; không sửa policy outcome hoặc Actual Supplier Cost.

## Tiền, transaction và audit
- Tổng đã charge gồm ORDER_CHARGE, PURCHASE_DELTA, late ORDER_RECONCILIATION, WEIGHT_ADJUSTMENT và ADDITIONAL_FEE theo Order/Lot. Không lấy Sales Price hay reserve làm khoản đã charge.
- Refund = max(0, min(total charged − prior refunds, total charged × refund rate / 100 − prior refunds)), làm tròn cent. Trừ Claim REFUND và ORDER_CANCELLATION REFUND trước đó; compensation và hỗ trợ balance riêng không thuộc refund.
- Claim mới có phân bổ refund từng Order; Claim lịch sử thiếu phân bổ vẫn trừ bảo thủ. Xem cập nhật cuối tài liệu.
- Chưa charge: giải phóng RESERVED, không tạo credit giả. Đã charge: REFUND CREDIT vào Balance, tổng phải thu còn lại trừ cả refund cũ.
- Cancellation, release reserve, ledger, public note, audit và recompute trong SQLite immediate transaction; lỗi audit rollback toàn bộ. Order CANCELLED và unique ledger index chống retry ghi tiền/audit trùng.
- Audit lưu route_id, policy_version, policy_stage, tỷ lệ/số tiền và prior refunds. Policy history append-only qua API, lưu reason/actor/version.
- Đã huỷ giữ số tiền lịch sử, không tính lại khi policy đổi. Doanh thu reconciliation không cộng lại phụ phí đã nằm trong số tiền giữ lại sau cancellation.

## API / migration
- GET /api/service-routes trả cancellation_policy={rules,version} hoặc null.
- POST /api/service-routes thêm cancellation_policy={PRE_PURCHASE:{allowed:true,refund_percent:100},...} và cancellation_reason. Giá trị chỉ là ví dụ payload; tỷ lệ thực tế phải theo Supplier. ADMIN only. Lưu cùng transaction của route.
- POST /api/orders/:id/cancel thực thi rule hiện tại; quyền Client/Sales vẫn kiểm tra ownership.
- Migration additive tạo route_cancellation_policies và route_cancellation_policy_history khi module được load.
- Yêu cầu PENDING cũ chuyển POLICY_RECHECK và ghi audit một lần. Giữ requester/thời điểm; không tự huỷ hoặc hoàn khi khởi động. Control Tower hiển thị “Huỷ cũ cần kiểm tra policy”; nút thực hiện huỷ theo rule hiện tại, không duyệt ngoại lệ.
- /api/cancellation-requests giữ tương thích Admin: GET danh sách cần recheck; POST áp dụng rule hiện tại. AUTO_COMPLETED khi huỷ thành công.
- Không reset dữ liệu. Chưa áp migration lên DB thật. Rollback ứng dụng cần backup DB và đối chiếu các cancellation đã thực thi; không khôi phục approval cũ trên giao dịch đã hoàn tiền.

## Nguồn / regression / giới hạn
- src/lib/cancellation-config.ts, order-cancellation.ts, reconciliation.ts; service-routes API; cancellation-policy-panel.tsx, order-workspaces.tsx, Control Tower.
- scripts/verify-order-cancellation.cjs: quyền, automatic refund mọi role hợp lệ, custom rate, surcharge, prior refund, reserve, denied/missing policy, migration/retry, audit rollback, restart.
- Supplier carrier API huỷ label chưa tích hợp; hiện huỷ tracking availability trong app. Cần xác nhận quy trình supplier thực tế và nhập policy từng tuyến trước vận hành.
- Cargo/usage GĐ2/GĐ3 cần ma trận riêng. Browser UAT và migration dữ liệu lịch sử chưa nghiệm thu.

## Rà soát bổ sung 15/10/2026 — refund theo Order
- Claim mới nhiều Order bắt buộc Admin nhập phân bổ từng Order, tổng bằng refund Claim; không tự chọn tỷ lệ nghiệp vụ. Claim một Order tự gán toàn bộ. Compensation vẫn ghi riêng theo Claim.
- Bảng additive `claim_refund_allocations` lưu cents cho mọi Order trong Claim (kể cả 0), trong cùng immediate transaction với ledger, decision và audit. Kiểm tra đúng tập Order, không trùng, không âm và không vượt charge còn hoàn được từng Order, gồm phụ phí Order/Lot. Retry không thêm payout.
- Cancellation và Claim dùng chung `order-refunds.ts` để trừ refund theo Order. Claim lịch sử chưa phân bổ vẫn trừ toàn Claim bảo thủ; không backfill đoán tỷ lệ. Cần Owner đối chiếu trước migration lịch sử.
- UI Admin nhập tổng và số tiền từng Order. Regression: verify-operations (allocation, overlap, legacy, cancellation ledger). Browser UAT chưa thực hiện.
