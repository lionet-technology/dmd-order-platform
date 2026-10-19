# Control Tower, Cases, Claims & SLA

## Owner financial update — 20/10/2026

Current Claim finalization/revisions now change only signed Refund Balance and require request keys; the older automatic wallet credit, per-Order refund allocation and shipping-charge caps below are historical. Actual Finance refunds and Admin recovery are separate. Legacy Claim Clients require migration before new financial actions. See [Refund Management](14-refund-management.md) and [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md).

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Control Tower tập trung purchase failed, hold, exception/case, claim, weight adjustment, inventory chưa nhận dạng, nợ quá hạn, supplier recovery và request huỷ.
- Claim của Client có thể áp dụng cho nhiều Order; việc tạo claim không tự hoàn tiền. Admin finalization tách shipping refund và compensation; supplier recovery là công nợ độc lập.
- SLA trong demo: purchase failed 4h; warehouse hold 24h; weight adjustment 24h; Client Claim phản hồi đầu 48h; supplier recovery 72h; unidentified inbound 24h; exception mặc định 24h.
- Thời hạn nhập bằng ngày được xét đến cuối ngày Việt Nam; phản hồi nội bộ không tính là public first response.
## Nguồn & kiểm tra
- `src/lib/control-tower.ts`, `src/lib/cases.ts`, `src/lib/claims.ts`, `src/lib/sla.ts`, `src/app/api/control-tower/`, `scripts/verify-operations.cjs`, `scripts/verify-sla-demo.cjs`.
## Cần xác nhận
- Mức SLA thực tế theo hợp đồng; quy trình escalation/notification ngoài app.

## Cập nhật 14/10/2026
- Phụ phí Admin duyệt từ Reconciliation có reference `LOT_RECONCILIATION`, liên kết Lot → Order trong statement để mở Claim theo Order. Feed cost không tự tạo public fee notice; public note chỉ đi cùng phụ phí được duyệt.

## Rà soát bổ sung 15/10/2026 — refund theo Order
- Claim mới nhiều Order bắt buộc Admin nhập phân bổ từng Order, tổng bằng refund Claim; không tự chọn tỷ lệ nghiệp vụ. Claim một Order tự gán toàn bộ. Compensation vẫn ghi riêng theo Claim.
- Bảng additive `claim_refund_allocations` lưu cents cho mọi Order trong Claim (kể cả 0), trong cùng immediate transaction với ledger, decision và audit. Kiểm tra đúng tập Order, không trùng, không âm và không vượt charge còn hoàn được từng Order, gồm phụ phí Order/Lot. Retry không thêm payout.
- Cancellation và Claim dùng chung `order-refunds.ts` để trừ refund theo Order. Claim lịch sử chưa phân bổ vẫn trừ toàn Claim bảo thủ; không backfill đoán tỷ lệ. Cần Owner đối chiếu trước migration lịch sử.
- UI Admin nhập tổng và số tiền từng Order. Regression: verify-operations (allocation, overlap, legacy, cancellation ledger). Browser UAT chưa thực hiện.

## Delta 16/10
- Shipment FAILED độc lập Case SOLVED (code RESOLVED/CLOSED), không tự resolve Claim, không refund tự động và không đưa shipment về IN_TRANSIT khi đóng Case. Admin có filter Failed riêng.
- APPROVED: vượt giới hạn service cần Admin hold/reroute/return, khác trội cân hợp lệ tự tính phụ phí; nhánh inbound quote hiện throw/rollback, chưa hoàn tất lưu evidence/flow ngoại lệ. Xem [Operational Flow](OPERATIONAL-FLOW.md).
