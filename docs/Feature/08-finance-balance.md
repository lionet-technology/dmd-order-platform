# Balance, Credit & Statement

## Delta quyền 18/10/2026
BOD/FINANCE không có quyền sửa Client wallet qua API Ledger/Financials; chỉ scope Supplier đã chốt. Operational Admin không được ghi SERVICE_COST vào Client ledger. Payload tài chính vận hành lọc Supplier Net/GP và dòng SERVICE_COST; migration dữ liệu legacy cần rehearsal riêng.

## Chốt nghiệp vụ 14/10/2026 — backend đã cập nhật
- Một Debt đang mở/client. `debt` tăng gốc Debt hiện tại và lưu nguồn statement trong `credit_debt_sources`; trả hết mới mở Debt mới. Nhiều Debt legacy đang mở: từ chối top-up và yêu cầu đối chiếu, không tự ghi đè lịch sử.
- Chuyển operational receivable sang Debt giải phóng sức mua mặc định, không tạo ledger Payment; `exclude_room` không còn là lựa chọn chính sách. Thanh toán Debt không tăng sức mua lần hai, kể cả phần trả lãi.
- Deadline trong hạn; top-up/`extend_debt` chỉ gia hạn có lý do và audit. Debt quá hạn tự block Purchase.
- Lãi %/ngày trên gốc còn lại, làm tròn cent mỗi ngày; event gốc/lãi hiệu lực từ ngày thay đổi, lãi từng ngày đã kết thúc lưu riêng bất biến. `debt_rate` đổi mức lãi từ hôm nay, không hồi tố. Mức mặc định 0 nếu Admin không cấu hình; Debt legacy bắt đầu ghi lịch sử từ khi gặp lần đầu, không backfill lãi tùy ý.
- Payment tự trả Debt (lãi trước gốc), rồi statement FIFO deadline/kỳ/id. Admin `allocate`/`apply_credit` override có reason + audit và chống retry trùng.
- Schema bổ sung `debt_interest_events`, `debt_daily_interest`, allocation `interest_cents`; interest không sinh operational charge hoặc giả Payment. Debt receivable gồm gốc và lãi, sức mua bù phần Debt đúng một lần.
- Reserve/charge triggers theo [Purchase](./04-purchase-engine.md).


**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Balance Ledger phản ánh giao dịch tiền; statement tuần (thứ Hai–Chủ nhật) là chứng từ công nợ; allocation nối khoản thanh toán/hạn mức với khoản phải thu.
- Credit limit mặc định 0; hạn thanh toán mặc định 14 ngày sau kết thúc kỳ; quá hạn hoặc khóa mua ảnh hưởng khả năng tạo purchase.
- Purchase versioned reserve trước khi charge; tiền được hạch toán khi đủ tracking/label, refund/điều chỉnh cần audit và chống ghi trùng.
- Payment tự phân bổ Debt trước rồi statement FIFO; Admin được override và tái cơ cấu khoản nợ có audit. SERVICE_COST nội bộ không tác động purchasing balance của Client.
- Request key cho payment/allocation đảm bảo replay đúng payload trả kết quả cũ, đổi payload cùng key phải reject; receipt cùng transaction.
## Nguồn & kiểm tra
- `src/lib/credit.ts`, `src/lib/finance.ts`, `src/lib/money-command.ts`, `src/lib/transaction-taxonomy.ts`, `scripts/verify-credit.cjs`, `scripts/verify-balance-idempotency.cjs`, `scripts/verify-domain-finance.cjs`.
## Cần quyết định
- Backfill dữ liệu legacy và multi-currency/FX trước production.

## API và kiểm thử bổ sung
- `POST /api/financials`: action `debt` (statement_id, amount, deadline, reason, daily_rate_pct tùy chọn), `extend_debt`, `debt_rate` (debt_id, daily_rate_pct, reason). Hiệu lực hôm nay; không nhận ngày hồi tố.
- `scripts/verify-debt-reconciliation.cjs`: top-up nhiều source, retry, interest segments, payment interest-first, audit override, room không double restoration, overdue block.
- UI đã có đổi lãi, top-up và gia hạn có lý do; còn cần browser UAT; chưa có scheduler độc lập, accrual được materialize khi thao tác/đọc tài chính. Chưa hỗ trợ FX.

- Override trong Debt: allocation `debt_order: PRINCIPAL_FIRST` cho Admin; mặc định `INTEREST_FIRST`. Reason/audit vẫn bắt buộc.

## Cancellation — 15/10/2026
- Refund tự động theo policy, không Admin approval; tổng đã charge gồm phụ phí, trừ refund trước. Trước charge chỉ release reserve. Hỗ trợ ngoài policy qua form Balance Adjustment Credit (Admin, Finance controls); POST /api/financials action balance_credit với amount, reason, request_key bắt buộc. Ghi ADJUSTMENT_CREDIT/audit cùng transaction, retry không ghi trùng, không đổi Actual Supplier Cost hoặc kết quả huỷ. Phân bổ support vào GP doanh nghiệp/Order cần quy tắc báo cáo riêng. Xem [Cancellation](./06-cancellation.md).

## Rà soát bổ sung 15/10/2026 — refund theo Order
- Claim mới nhiều Order bắt buộc Admin nhập phân bổ từng Order, tổng bằng refund Claim; không tự chọn tỷ lệ nghiệp vụ. Claim một Order tự gán toàn bộ. Compensation vẫn ghi riêng theo Claim.
- Bảng additive `claim_refund_allocations` lưu cents cho mọi Order trong Claim (kể cả 0), trong cùng immediate transaction với ledger, decision và audit. Kiểm tra đúng tập Order, không trùng, không âm và không vượt charge còn hoàn được từng Order, gồm phụ phí Order/Lot. Retry không thêm payout.
- Cancellation và Claim dùng chung `order-refunds.ts` để trừ refund theo Order. Claim lịch sử chưa phân bổ vẫn trừ toàn Claim bảo thủ; không backfill đoán tỷ lệ. Cần Owner đối chiếu trước migration lịch sử.
- UI Admin nhập tổng và số tiền từng Order. Regression: verify-operations (allocation, overlap, legacy, cancellation ledger). Browser UAT chưa thực hiện.

## Delta 16/10
- APPROVED: phụ phí cân đo hợp lệ tự debit không cần confirm/duyệt lần hai; phải kiểm tra idempotency/đo lại và nối statement/refund/report trước xác nhận hoàn thành. `inbound.ts` còn approval tại thời điểm đầu ngày; xem delta lượt tiếp tục bên dưới cho ePacket auto charge. Phụ phí Supplier Reconciliation vẫn theo D15.
- Supplier account/Balance/Statements/Payments là phạm vi DEFERRED với permission spec riêng, không tái sử dụng Client Balance như thể đã triển khai. GP-Net chỉ BOD/authorized finance; quyền ADMIN hiện chưa đủ phân tách. Xem [Operational Flow](OPERATIONAL-FLOW.md).

## Delta lượt tiếp tục 16/10/2026
Phụ phí cân đo tự động đã có cho ePacket có giá khóa: WEIGHT_ADJUSTMENT debit, public note/audit cùng transaction; statement/refundable total dùng shippingChargeCents, reconciliation revenue thêm khoản đã debit (không cộng hai lần khi Order đã hủy). Legacy/manual route còn pending. Sổ [phải trả Supplier](13-supplier-payables.md) là GĐ1 D24, độc lập Client Balance/Cost/Recovery; portal login sau GĐ1.

## 18/10 — tổng quan kiểm soát Client và review giao dịch
Admin/Sales có tổng quan trong phạm vi quyền, gồm Wallet, Credit Limit, AR, overdue, reserves, room mua, lý do khóa và warning allocations lịch sử; tìm/lọc rủi ro rồi drill-down. Mobile dùng thẻ Client. GET overview dùng accountFinancials hiện có (có thể materialize FIFO/interest như màn chi tiết), không đổi công thức tiền. Form chi tiết có review và kết quả trước/sau trong cùng transaction; sheet Balance có review từng dòng và snapshot trước/sau batch, không dự đoán phân bổ. Import Excel chưa có preflight mới. Xem [UAT mới và giới hạn](UAT-BULK-LEDGER-2026-10-18.md).
