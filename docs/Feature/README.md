# Feature documentation — DMD Report

## BOD Finance report (20/10/2026)
Đã nối báo cáo BOD Client Balance/Debt/Refund theo từng tài khoản, tổng hợp dòng Payment và Refund Bank/Wallet theo kỳ; không dùng `fc_*` song song. Xem [Feature 16](16-bod-finance-report.md). Statement V2 snapshot đầu/cuối kỳ và migration vẫn chưa hoàn tất.

## Tiếp tục tài chính 20/10/2026 — Debt/Statement dependency (Partial)
Ứng dụng hiện cho Admin chuyển Balance âm sang một Debt Account **không cần Statement**, Payment mới chỉ tự phân bổ vào Debt rồi Balance, và Statement quá hạn không khóa mua. Claim/Refund và Payment Reconciliation/Adjustment đã nối app từ các đợt trước. **Chưa hoàn tất** snapshot Statement cuối kỳ, migration legacy DB và BOD financial parity. Xem [Feature 08](08-finance-balance.md) và [Verification 20/10](VERIFICATION-DEBT-STATEMENT-CUTOVER-2026-10-20.md). Nội dung lịch sử phía dưới thể hiện trạng thái của từng đợt trước.

## Payment Adjustment application continuation — 20/10/2026

Finance can now append linked actual-receipt adjustments through the Payment Reconciliation UI/API. Original Payment and adjustment ledger/history are immutable; reductions consume the Payment's Balance portion, then reverse principal and interest; increases settle current Debt interest/principal before surplus. Client/Sales notifications, optimistic versions and atomic actor-scoped receipts are implemented. Existing Payment allocations into Statements are **blocked pending reviewed migration**; the global legacy FIFO and Statement-dependent Debt conversion remain. This is a verified partial delivery, not completion of the Owner financial cutover. See [Payment feature](15-payment-reconciliation.md) and [current evidence](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).


## Payment reconciliation continuation — 20/10/2026

Finance bulk confirmation/discrepancy is connected to real Payment ledger rows through a dedicated API and UI. It appends immutable reconciliation history, atomic Client/Sales notifications and optimistic version checks without moving money or allocations. Payment Adjustment and the approved Payment/Debt/Statement cutover remain incomplete. See [Payment reconciliation](15-payment-reconciliation.md) and [verification/migration/UAT](VERIFICATION-PAYMENTS-2026-10-20.md).


## Owner financial update — 20/10/2026

Refund Management and Claim obligation revisions are now connected to the application and existing wallet ledger. The separate replacement FinancialCore remains inactive for Payment/Debt/Statement. Full Owner financial release remains incomplete. See [Refund Management](14-refund-management.md) and [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md).

## Hiện hành 18/10/2026
Role BOD/FINANCE riêng và Base Rate ePacket độc lập đã có code local. Xem [Verification commit](VERIFICATION-COMMIT-2026-10-18.md), [RBAC](01-auth-rbac.md), [Pricing](03-service-route-pricing.md). Các báo cáo 13–16/10 bên dưới là lịch sử, không thay kết quả mới. Chưa chứng nhận production/UAT toàn GĐ1.

Cập nhật: 2026-10-16. Tài liệu này mô tả hành vi từ code, nguồn kiểm chứng và khoảng trống. **Không phải xác nhận production-ready**.

## Tài liệu điều hành
- [Operational Flow 16/10 — nguồn chuẩn nghiệp vụ hiện tại](./OPERATIONAL-FLOW.md): cập nhật Owner được ưu tiên hơn quyết định cũ; code/tests mô tả as-is, không thay thế yêu cầu đã chốt.
- [Kiểm chứng 16/10](./VERIFICATION-2026-10-16.md): kết quả thực tế và khoảng trống.
- [Decisions 2026-10-13](./DECISIONS-2026-10-13.md): quyết định nghiệp vụ mới, phân biệt với code hiện có.
- [Roadmap](./ROADMAP.md): 3 giai đoạn và release gates.
- [Quy trình cập nhật](./CONTRIBUTING.md).

## Danh mục
- [Claims & Refund Management](14-refund-management.md)
- [Tài khoản & phân quyền](./01-auth-rbac.md)
- [Orders, Draft & cấu trúc kiện](./02-orders-drafts.md)
- [Service Route & Pricing](./03-service-route-pricing.md)
- [Mua đơn & xử lý thất bại](./04-purchase-engine.md)
- [Tracking, Label & trạng thái vận chuyển](./05-tracking-label.md)
- [Huỷ đơn & hoàn tiền](./06-cancellation.md)
- [Kho, scan & Manifest](./07-warehouse-manifest.md)
- [Balance, Credit & Statement](./08-finance-balance.md)
- [Supplier Cost & Reconciliation](./09-supplier-reconciliation.md)
- [Control Tower, Cases, Claims & SLA](./10-operations-cases-claims.md)
- [Import, mẫu mua & export](./11-import-templates.md)
- [Danh mục & cấu hình dùng chung](./12-master-data.md)

## Cách đọc
- **Hành vi:** logic đã tìm thấy trong code/tài liệu, cần kiểm thử khi release.
- **Nguồn:** nơi kiểm tra khi có khác biệt, yêu cầu Owner đã chốt quyết định nghiệp vụ; code/tests là bằng chứng triển khai và không tự thay đổi yêu cầu đó.
- **Chưa triển khai / cần quyết định:** không đưa vào kỳ vọng của người sử dụng như tính năng hoàn thành.
- Xem [CONTRIBUTING](./CONTRIBUTING.md) về vòng đời và tiêu chuẩn cập nhật.

## Báo cáo nhanh 13/10/2026
- Repository branch main, HEAD `cebd058` (2026-10-08), có thay đổi local từ trước ở `next-env.d.ts` và `Codex/` (không động tới).
- Đã có API/modules cho các nhóm tính năng kể trên; chưa chạy lại lint/build/E2E trong lượt khảo sát tài liệu này.
- README ở gốc repository có mô tả MVP cũ; các đặc tả cũ lưu tại `docs/legacy-logic/`. Không dùng làm business source để launch.
- Chưa có bằng chứng hệ thống đã deploy/đã nghiệm thu; deployment guide là hướng dẫn chứ không phải xác nhận đã triển khai.

## Cập nhật 14/10/2026
- Debt và Reconciliation backend được cập nhật theo quyết định D10–D15; trạng thái UI/UAT và pending xem các feature liên quan.
- Giữ nguyên thay đổi tài liệu/AGENTS/README/next-env/Codex từ dev trước; không push/deploy.

## Cập nhật 15/10/2026
- Cancellation policy từng route có UI/API, tự động huỷ/refund theo rule cho role được phép; bỏ approval cũ, migration recheck không tự hoàn tiền. Xem [06-cancellation](./06-cancellation.md).

- Source chỉ do Owner và ChatGPT phát triển; thay đổi local được tiếp tục sau kiểm tra, không giả định có dev khác.
- Bổ sung phân bổ Claim theo Order; TypeScript loại `Codex/` (các bản sao lịch sử) khỏi compilation, không xoá bản sao hoặc bỏ kiểm tra lỗi source chính.

## Cập nhật 16/10/2026 — luồng vận hành chuẩn
- [Operational Flow & Business Rules](OPERATIONAL-FLOW.md) là source-of-truth tổng thể cho phản hồi mới; phân loại IMPLEMENTED / APPROVED / DEFERRED và nêu rõ xung đột code.
- Chỉ Owner và ChatGPT phát triển source; các ghi chú “dev trước” ở báo cáo lịch sử không còn là giả định làm việc.
- FAILED đã bổ sung cho tracking; các nhánh auto surcharge, Mid-mile placeholder và GP-Net permissions còn được đánh dấu APPROVED, không xác nhận hoàn thành.

- 16/10: cost component API, coverage/report snapshots đã triển khai local; UI tổng cost giữ đơn giản. Cargo allocation, mapping supplier, quyền D22, UAT và lịch sử còn pending. Xem 09-supplier-reconciliation.md.

- [Rà soát Operational Flow 16/10](AUDIT-OPERATIONAL-FLOW-2026-10-16.md): sửa delta component đã lỗi thời, phân biệt Warehouse/payables và checklist GĐ1; 243 checks/assertions chạy lại PASS, TypeScript PASS.

## Lượt tiếp tục 16/10
- [Supplier Payables nội bộ GĐ1](13-supplier-payables.md): Owner chốt D24; module/API/UI local, không portal.
- [Verification continuation](VERIFICATION-CONTINUATION-2026-10-16.md): chặn lộ GP/cost, cân đo tự động phạm vi ePacket, Hold evidence, kiểm thử mới và blockers.
- Pricing D02 vẫn còn dùng Net→Base/Retail cũ; chưa hoàn tất Base Rate độc lập. Không coi GĐ1 đã nghiệm thu.

## Internal UAT 18/10/2026
- [Biên bản Internal UAT](INTERNAL-UAT-2026-10-18.md): fixture 544 đơn, lô 29 đơn xuyên Client/Admin/Warehouse/Finance qua browser, thùng 100 kiện, hai lỗi sheet đã sửa và giới hạn còn mở. 18 domain suites và 8 HTTP suites PASS không thay nghiệm thu toàn GĐ1.
- Vòng tiếp tục: hoàn thiện filter/pagination/context Finance và mobile sheet, sửa unmatched counter; thêm Eco xuyên UI, BOD/Sales checks. 19 domain suites / 1.014 assertions và 9 HTTP suites / 268 assertions PASS. Các gate dữ liệu/policy thật vẫn mở; xem biên bản.

- [Bulk & Balance Ledger UAT sau 4a836ea](UAT-BULK-LEDGER-2026-10-18.md): tổng quan Client, kiểm soát trước ghi tiền, mobile cards; phân biệt browser, HTTP và acceptance còn mở.

- [Owner Credit 19/10](VERIFICATION-OWNER-CREDIT-2026-10-19.md): semantics Balance ròng, giới hạn chuyển Debt, regression quyền/concurrency và blockers Finance Reconciliation.
