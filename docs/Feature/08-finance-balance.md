# Balance, Credit & Statement

## Payment Adjustment application continuation — 20/10/2026

Finance can now append linked actual-receipt adjustments through the Payment Reconciliation UI/API. Original Payment and adjustment ledger/history are immutable; reductions consume the Payment's Balance portion, then reverse principal and interest; increases settle current Debt interest/principal before surplus. Client/Sales notifications, optimistic versions and atomic actor-scoped receipts are implemented. Existing Payment allocations into Statements are **blocked pending reviewed migration**; the global legacy FIFO and Statement-dependent Debt conversion remain. This is a verified partial delivery, not completion of the Owner financial cutover. See [Payment feature](15-payment-reconciliation.md) and [current evidence](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).


## Payment reconciliation continuation — 20/10/2026

Finance bulk confirmation/discrepancy is connected to real Payment ledger rows through a dedicated API and UI. It appends immutable reconciliation history, atomic Client/Sales notifications and optimistic version checks without moving money or allocations. Payment Adjustment and the approved Payment/Debt/Statement cutover remain incomplete. See [Payment reconciliation](15-payment-reconciliation.md) and [verification/migration/UAT](VERIFICATION-PAYMENTS-2026-10-20.md).


## Owner financial update — 20/10/2026

Claims/Refund application adapter is implemented: decisions change signed Refund Balance, Finance actual Balance payout credits ledger once, Bank payout never credits ledger, Admin manual recovery debits ledger. Public Balance projects signed net ledger. Recovery is excluded from legacy service-fee receivables. Payment/Debt/Statement still need cutover. See [Refund Management](14-refund-management.md) and [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md).

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

## Owner chốt 19/10/2026 — Balance ròng / Debt
- `balance_cents` giữ nguyên số dư ledger lịch sử. `net_balance_cents` = ledger balance + phần Debt được loại khỏi sức mua theo công thức hiện hành (outstanding Debt trừ tổng lãi đã ghi nhận). Giữ semantics trả lãi đã kiểm chứng: tiền trả Debt/lãi không tăng room lần hai. Không ghi bút toán credit/Payment khi chuyển Debt.
- Credit Limit áp dụng Balance ròng; Reserve giảm room. Số âm vượt limit vẫn lưu đầy đủ, không cap ledger và không tự tạo Debt. API `available_to_buy_cents` tiếp tục là headroom có thể âm; lệnh mua phải qua `purchase_blocked` và kiểm tra số tiền, không dùng riêng headroom làm quyền mua.
- Admin `debt` chỉ chuyển tối đa phần Balance ròng âm và phần Statement chưa trả, trong cùng immediate transaction. Reserve không phải nguồn Debt. Retry cùng request key trả receipt, payload khác bị từ chối. UI gửi key; domain vẫn chấp nhận lệnh legacy không key, các caller mới phải dùng key.
- Debt trong hạn không chiếm Credit Limit; deadline là ngày cuối còn được mua, chỉ `deadline < ngày hiện tại tại Asia/Ho_Chi_Minh` mới quá hạn. Gia hạn không gỡ các khóa độc lập. Admin đổi lãi lưu old/new rate, ngày hiệu lực, actor/reason; gia hạn lưu old/new deadline.
- Full reject Payment vẫn chỉ Admin, không thay/xóa Payment gốc, tạo PAYMENT_REVERSAL và khôi phục allocation gốc theo hành vi hiện tại. Audit bổ sung snapshot allocations trước khi xóa quan hệ live, số tiền và reversal ID. Đây **không** là luồng Finance xác nhận thực nhận một phần.
- Regression: `scripts/verify-owner-credit.cjs` (32 assertions, DB mới tự tạo trong temp), `scripts/e2e-owner-credit.cjs` (localhost rõ ràng, dùng fixture trên; quyền và requests đồng thời). Xem [báo cáo 19/10](VERIFICATION-OWNER-CREDIT-2026-10-19.md).
- **Blocker:** `debt` hiện yêu cầu nguồn Statement; phần Balance âm thuần do PAYMENT_REVERSAL (bị loại khỏi credit_items để tránh nhân đôi AR đã khôi phục) chưa có nguồn chuyển phù hợp. Không tạo phí/Statement giả để lách. Cần thiết kế nguồn Balance Adjustment và conservation invariant trước khi hỗ trợ chuyển toàn bộ loại số âm.
