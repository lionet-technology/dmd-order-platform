## Claim và Refund NEXT — 18/11/2026
[Feature 42](42-vnd-claim-refund-next.md) ghi đặc tả Claim/Refund, hiện trạng, checklist pilot và phần truy vết case chưa phân bổ trong báo cáo BOD.

# Supplier period close, GP reconciliation and VNĐ exceptions
**Status: implemented bounded continuation; verification evidence in [build report](../../artifacts/vnd-v1-close-reconciliation-2026-11-17/VERIFICATION.md). Not production or real-document pilot acceptance.**
Owner continuation 17/11/2026; canonical repo /Users/quan/Developer/report. Supersedes earlier missing-period and no-reference-formula notes only within this VNĐ scope.

## Supplier close and late adjustments
Finance/BOD use existing GET/POST /api/service-v1/suppliers; action=close_period, Supplier, period_start/end, expected_previous_period_id, reason, request_key. Admin remains documentary only; Sales/Client/Warehouse cannot read this financial journal. UI is in Supplier finance VNĐ; load period history before submitting. No reopen command exists.
- Only days already ended in Asia/Ho_Chi_Minh can close. Dates must be valid and ordered; subsequent periods start the day after the last closed end. Optimistic previous-period ID, immediate transaction and actor/payload-bound request receipt protect concurrency/replay.
- Immutable snapshot contains original journal rows, approved and open Claim state as of the cutoff, cost evidence, unresolved import rows, opening/movement/closing payable and receivable. First close explicitly includes pre-start payable/receivable in opening; no opening is invented or silently dropped. Snapshot is posting-day based, not bank execution-day based.
- Snapshot records can neither UPDATE nor DELETE. Journals reject inserts backdated into a closed Supplier period. Recording late bank evidence uses the current posting day while preserving executed_day separately.
- Existing manual total review and Excel TOTAL/SUPPLEMENT approval remain unchanged. Actual corrections append only replacement delta; supplement appends its explicit cost once. If the same Lot and fulfillment attempt has approved Actual in a frozen period, a correcting ledger entry links to that period and original frozen entry. Claim correction/settlement/reversal similarly links to the frozen Claim source. Late first evidence without a frozen financial source is a new current-period posting, not a retrospective invented cost.
- Free-form payable adjustment after a close requires original_ledger_id referencing this Supplier's frozen entry. Missing/wrong reference rolls back the command and its audit. Links record source type/ID, original period/source, reason, actor and timestamp atomically.
- Receivable and payable remain separate. Claim approval/correction changes receivable only; Bank collection does not change payable; explicit Offset and reversal use existing payable journal. Neither close nor settlement creates revenue/GP or Client money.
- Closing does not certify pending costs or resolve an import/Claim. Unresolved rows remain visible and are captured as pending evidence. No new Claim/watchlist lifecycle is introduced.

## GP and commission reconciliation
GET /api/service-v1/reporting remains BOD-only. Historical purchase-month/Sales attribution and exact decimal VNĐ remain the basis. No legacy USD relabeling.
- Commission freight revenue = ORDER_CHARGE + ORDER_CORRECTION, signed appropriately. Surcharge and tax are excluded. Signed GP-Base = freight revenue minus snapshotted Base; eligible GP-Base is max(signed,0) per Order before aggregation. Cancellation/unpaid = 0; missing Base/attribution = unavailable, never guessed.
- Latest Owner continuation explicitly requests the reference formula: when freight sales > Base, reference = sales × 0.001 + max(sales−Base,0) × 0.12; otherwise zero. Cancellation always zero. Version OWNER_CONTINUATION_2026_11_17_REFERENCE_ONLY. This supersedes earlier no-rate reference notes, and does not authorize payout, payroll accrual or automatic financial posting.
- Pending Claim or latest approved total zero does not classify an Order as refunded. Positive latest approvals produce SHIPPING_ISSUE/FORCE_MAJEURE/RECONCILIATION_ERROR groups; multiple categories surface explicitly. All linked IDs remain visible, avoiding an arbitrary first-Claim classification.
- Whole approved Claim total can be reported once at Sales/cohort/group level only when every referenced Order belongs to that complete group. Across Sales/month/group boundaries, group Refund and GP-Base-minus-Refund are null with UNALLOCATED_CROSS_COHORT_OR_GROUP. No proportional allocation to Orders and no automatic final commission adjustment. GP-Base-minus-Refund uses signed original GP and may be negative. Executed Bank/Balance payouts settle the pool and are not deducted again.
- Commercial performance revenue includes freight, surcharge and tax. Signed GP-Base uses freight only. The live `order_profitability` view applies [Feature 42](42-vnd-claim-refund-next.md) to recognized revenue after Refund and approved Actual after allocated Supplier Recovery. Each posted fulfillment attempt contributes its latest approved Actual once. The view requires approved Actual for each Lot’s current attempt and identifiable historical postings.
- Supplier Recovery is attributed to the Order/Sales and reported by approval month. Bank and Offset are settlement events. The legacy reconciliation field `gp_reconciliation` stays available for existing consumers as a before-Refund baseline. The estimates and live order profitability are separate views; overall `actual_gp` stays null pending reconciliation of unallocated historical claims.
- Reporting performs no ledger/Statement/financial writes. Sales/Client cannot access reporting, Supplier Actual, period history or cost import evidence.

## Control Tower VNĐ
Read-only /api/service-v1/exceptions with active-role validation and scoped Client ownership. Included in /vnd and existing Operations Control Tower.
- Purchasing: Awaiting Quote, Price Confirmation Required, Awaiting Funds, pricing-error indicator without private raw error text.
- Financial flags: negative available headroom, without automatic Debt or retry.
- Pricing flags: selling at/below snapshotted Base for authorized Admin/BOD/assigned Sales; no Base amount disclosed.
- Internal Admin/Finance/BOD only: charged Orders lacking approved Lot Actual, and all pending Supplier import rows with typed errors or AWAITING_REVIEW status. Errors/unmatched rows are retained, never accepted implicitly.
- Sales/Client responses omit Supplier and Actual queues/content. Unassigned Sales sees no scoped Orders. UI offers refresh, queue counts, status labels and contained tables on mobile. No automatic Claim, carrier operation or financial action.
This is a bounded exception view, not a new scheduler, SLA escalation or Complete Claim/watchlist workflow.

## Code and validation
src/lib/vnd-supplier-periods.ts; existing vnd-supplier/claims/import/schema; vnd-commission.ts; vnd-reporting.ts; vnd-exceptions.ts; period/exception UI and existing Supplier/report UI.
New verify-vnd-period-close and verify-vnd-exceptions suites; expanded commission/Supplier suites. scripts/e2e-vnd-v1.cjs exercises five roles in real headless Chrome on a production build and owned disposable DB. scripts/rehearse-vnd-pilot-restore.cjs compares eight journal/snapshot tables after synthetic backup/restore; it does not restore the deployment target.

## Remaining V1 / operational evidence
- Real Supplier documents, rate/policy/carrier evidence and operator acceptance; synthetic fixtures never certify the real pilot.
- Deployment-target backup/restore, operational backup destination/retention/scheduler and deployment acceptance remain unverified. No Jenkins/production action is authorized or performed.
- Supplier tax/pass-through accounting import, large-volume queue pagination/performance, comprehensive legacy cutover remain separate gaps.
- Group-spanning Client Refund remains explicitly unallocated; final commission decisions/payments remain manual. Before-Refund GP reconciliation does not certify final GP after whole-Client pool adjustments.
- Claim/watchlist/case creation/Complete Claim/manual Client–Supplier linking are deferred to the NEXT phase. Existing financial Claim journal is retained.

## Lot trống sau sửa kiện

Đối chiếu Actual sử dụng Lot có kiện và Lot có chi phí Supplier đã lưu. Slot Lot trống do đánh số hoặc bỏ kiện không tạo yêu cầu Actual. Những lượt có chứng từ của Lot tiếp tục tham gia đối chiếu theo quy tắc lịch sử ở trên.

## Cảnh báo nghĩa vụ Supplier cấp Order

Control Tower nội bộ hiển thị các Order có tổng Actual Supplier đã ghi cao hơn doanh thu có thể thu, kể cả sau khi dòng cuối cùng đã duyệt. Nghĩa vụ cộng delta của toàn bộ Lot, lượt fulfillment và Supplier của Order. Căn cứ doanh thu và cách xử lý Claim thiếu phân bổ xem [Feature 40](40-vnd-post-shipping-import-reconciliation.md#supplier-reconciliation-v2--đợt-2).
