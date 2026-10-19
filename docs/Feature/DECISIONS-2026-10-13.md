# Các quyết định sản phẩm — 2026-10-13

**Trạng thái:** APPROVED BUSINESS SPEC, không đồng nghĩa IMPLEMENTED. Quyết định này ưu tiên hơn các tài liệu legacy; code vẫn cần được dev điều chỉnh và test.

| ID | Quyết định | Tham chiếu |
|---|---|---|
| D01 | Reserve lúc Purchase; Charge theo trigger từng dịch vụ, không mặc định khi tạo Purchase. Express/ePacket/UPS/YunExpress khi tracking+label; Cargo tại ETD; scan active/relabel khi ghi nhận usage. | [Purchase](./04-purchase-engine.md) |
| D02 | Base Rate của mỗi service config → Retail (markup) → Sales Price (discount); Net Cost ước tính/thực tế tách biệt và không chi phối giá bán. | [Pricing](./03-service-route-pricing.md) |
| D03 | Giá bán đã chốt không tự động đổi khi Actual Net khác Estimated; Admin được thu bổ sung phụ phí độc lập, có giải trình. | [Reconciliation](./09-supplier-reconciliation.md) |
| D04 | Finalized GP/Margin chỉ khi đối soát sạch hoặc Admin phê duyệt. Estimated GP/Margin trình bày riêng, Pending không được coi là Finalized. | [Reconciliation](./09-supplier-reconciliation.md) |
| D05 | GP gồm doanh thu dịch vụ/phụ phí thực hưởng trừ chi phí dịch vụ/supplier thực gánh chịu; thu hộ/chi hộ không tính vào revenue/cost thương mại. | [Reconciliation](./09-supplier-reconciliation.md) |
| D06 | Order duy nhất một địa chỉ giao. Không cần mô hình giao từng Lot đến các địa chỉ/thời điểm riêng. | [Orders](./02-orders-drafts.md) |
| D07 | Cancellation Policy cấu hình theo dịch vụ/trạng thái, không áp 100/90/0 một cách tổng quát. | [Cancellation](./06-cancellation.md) |
| D08 | Quá hạn tự chặn Purchase; Admin có thể chuyển sang Debt có deadline và audit, giữ nguyên Balance/Credit rule bình thường, không bypass tùy ý. | [Finance](./08-finance-balance.md) |
| D09 | Phase 1: Express (ePacket, UPS, YunExpress, Chuyên tuyến custom), account/Balance/pricing/operations cơ bản. Phase 2: kết nối dữ liệu dịch vụ Label production khác domain. Phase 3: Cargo và workflows/integrations/alert nâng cao. | [Roadmap](./ROADMAP.md) |

## Chưa quyết định — không suy luận
- Cụ thể hóa charge tại ETD: múi giờ, ETD sửa/lùi, no-show, partial cargo và dữ liệu làm bằng chứng.
- Đơn vị usage/bảng phí, correction/reversal, late-arriving events khi tích hợp Label.
- FX và quy tắc điều chỉnh báo cáo đã phát hành; granularity và threshold đã được chốt ngày 14/10 bên dưới.
- Cancellation matrix riêng từng Service/Sub-Service và Supplier.
- Mức độ phân bổ phí chung, thuế là pass-through hay chi phí chịu, thời điểm ghi nhận earned revenue theo báo cáo thực tế.
- Migration nhiều Debt legacy cần đối chiếu thủ công; không tự hợp nhất nghĩa vụ lịch sử.

## Quyết định bổ sung — 2026-10-14
- D10: Một active Debt/client; chuyển thêm operational receivable tăng gốc khoản hiện tại, lưu nguồn từng statement; gia hạn không lùi deadline. Debt đã trả hết lưu lịch sử.
- D11: Chuyển sang Debt giải phóng sức mua, không tạo Payment/credit ledger giả. Trả Debt không giải phóng sức mua lần hai. Debt quá hạn chặn Purchase.
- D12: Lãi %/ngày trên gốc còn lại, làm tròn cent cuối mỗi ngày (Owner xác nhận 14/10). Tăng gốc/đổi lãi chỉ hiệu lực từ ngày thay đổi, không sửa lãi đã ghi nhận; không nhập hiệu lực hồi tố. Ghi lãi ngày đã kết thúc khi có hoạt động tài chính; ngày hiện tại chưa kết thúc không ghi lãi. Thời điểm cuối ngày Asia/Ho_Chi_Minh.
- D13: Payment tự phân bổ Debt trước (lãi đã ghi nhận → gốc), rồi operational receivable FIFO theo deadline/kỳ/id. Admin override có lý do và audit, giữ override qua refresh.
- D14: Reconciliation theo số Lot trong Order, không yêu cầu tracking đại diện. Actual > Estimated luôn Review trước phê duyệt; không vượt tự Pass khi có đủ cost và estimate. Thiếu cost Pending; thiếu estimate Review. Order chỉ Finalized khi tất cả Lot sạch hoặc Admin duyệt.
- D15: Admin nhập cost thay thế khi thiếu supplier cost, có lý do/audit; chọn phụ phí độc lập có public note hoặc absorb loss. Không tự đổi Sales Price hoặc thu phí theo supplier feed. Bulk nguyên tử; retry phụ phí có request_key. Late cost thêm version và mở Review lại khi vượt estimate.

**Bằng chứng triển khai:** backend `credit.ts`, `debt-interest.ts`, `reconciliation.ts`, nhập supplier cost theo Lot; regression `scripts/verify-debt-reconciliation.cjs`. Chưa xác nhận UAT/production. UI thao tác mới, migration legacy và các báo cáo còn cần acceptance.

## Quyết định bổ sung — 2026-10-15
- D16: Policy riêng từng Service Config/route theo Supplier và trạng thái; đủ rule tự động huỷ/refund, không Admin approval. Không có Manual Cancellation Override; hỗ trợ ngoài policy bằng Balance Adjustment Credit riêng có lý do.
- D17: Refund tỷ lệ trên tổng Order đã charge có thể gồm phụ phí; trừ refund trước và không vượt phần còn hoàn được. Pre-charge release reserve; post-charge refund credit; transaction/idempotency/audit.
- Triển khai local: [Cancellation](./06-cancellation.md). Ma trận tỷ lệ thực tế từng Supplier cần Admin cấu hình; không tự áp mặc định 100/90. Pending approval legacy chuyển policy recheck, không tự phát sinh tiền.

## Quyết định bổ sung — 2026-10-16
- D18 APPROVED: cân đo kho thủ công, không bắt buộc; dữ liệu khai báo phục vụ giá vẫn theo eligibility dịch vụ.
- D19 APPROVED: trội cân hợp lệ tự động tính phụ phí khách, không confirmation/approval lần hai. Vượt giới hạn service → Admin hold, reroute hoặc return. D15 vẫn áp dụng phụ phí từ chênh Supplier Cost, không nhầm trigger cân đo.
- D20 APPROVED: ePacket dùng Estimated Net Cost làm placeholder Mid-mile; không double count cùng cost coverage. Actual Mid-mile từ Manifest/Air Cargo phân bổ chargeable weight từng Order/Lot: DEFERRED cùng Cargo.
- D21 IMPLEMENTED local: shipment FAILED có filter riêng và loại khỏi queue active; không đồng nghĩa purchase FAILED hoặc Case SOLVED/RESOLVED.
- D22 APPROVED: GP-Net chỉ BOD/authorized finance, cấm Sales/Admin vận hành/CSKH thông thường. Quyền ADMIN hiện tại chưa đáp ứng.
- D23 DEFERRED: Supplier account/login riêng với balance/statements/reconciliation/missing-cost/claims/payments; permission spec trước triển khai.
- Chi tiết và bằng chứng: [Operational Flow](OPERATIONAL-FLOW.md). Cargo sau GĐ1; chưa renumber roadmap cũ vì phản hồi mới gọi GĐ2 trong khi D09 gọi GĐ3.

- D24 APPROVED 16/10 (chat tiếp tục): Owner chọn sổ phải trả Supplier nội bộ trong GĐ1 (invoice, payment allocation, outstanding); Supplier portal/login DEFERRED. Triển khai local xem [13-supplier-payables](13-supplier-payables.md), quyền finance riêng và UAT còn pending.

## Quyết định Owner 17–18/10/2026
- D25: BOD và FINANCE là role riêng. Được xem/nhập cost, đối soát, ghi invoice/payment Supplier; không có quyền Admin khác. Root cấp role tường minh; không nâng quyền tự động.
- D26: Nhập bảng Base Rate được Owner duyệt; chặn mua route chưa cấu hình. Không tự chụp giá Net thành Base Rate thật. Code gate ePacket đã có; route manual khác vẫn cần adapter/gate. Không dùng fixture giả lập làm giá vận hành.

## Owner chốt 19/10/2026
- D27: Credit Limit là giới hạn Balance ròng âm được phép mua; Reserve giảm sức mua, ledger vẫn ghi đủ số âm vượt hạn mức. Chuyển phần Balance âm sang Debt chỉ Admin thao tác, có deadline/lãi riêng; không Payment giả, không tự động, không tăng room lần hai khi trả Debt. Debt trong hạn không chiếm Credit Limit; còn nợ sau deadline khóa từ 00:00 ngày tiếp theo tại Asia/Ho_Chi_Minh. Admin gia hạn/đổi lãi có audit.
- D28: Sales ghi Payment ngay; Finance cần bulk xác nhận/báo sai lệch và thông báo Client/Sales. Đây là yêu cầu cần triển khai, chưa phải tính năng hiện hành. Partial allocation reversal cần rule xác định và bảo toàn nghĩa vụ; không xóa Payment gốc hay tự tạo Debt. Chi tiết proposal/blocker trong báo cáo 19/10.
