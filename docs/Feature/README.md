## Audit kỹ thuật GĐ1 · 20/11/2026

[Feature 43](43-gd1-completion-decision-backlog.md#audit-kỹ-thuật-gđ1--20112026) ghi trạng thái Chuyên tuyến nhiều Lot, popup giá khi đổi Service và các việc còn lại để nghiệm thu.

## Chốt hoa hồng VNĐ theo tháng · 20/11/2026

[Feature 45](45-vnd-monthly-commission-closing.md) mô tả chốt tháng tự động, điều chỉnh Order kỳ đã khóa và Excel theo quyền Sales.

## Credit Term và Weekly Statement Client VNĐ · 20/11/2026

[Feature 44](44-vnd-credit-term-weekly-statement.md) mô tả điều khoản theo tuần, cảnh báo và chốt bù tự động.

## Audit kỹ thuật GĐ1 · 18/11/2026

[Backlog GĐ1 cập nhật](43-gd1-completion-decision-backlog.md) ghi luồng nhập Net/Base cho Chuyên tuyến, kiểm chứng Actual Emergency qua Supplier khác và các điểm cần chốt.

## Hoàn thiện Giai đoạn 1 · 18/11/2026

[Trạng thái GĐ1 và backlog quyết định nghiệp vụ](43-gd1-completion-decision-backlog.md) cập nhật hiện trạng theo từng luồng VNĐ, kiểm chứng kỹ thuật và các quyết định cần chốt trước đợt UI/UX và UAT.

## Claim NEXT · Triển khai vận hành 18/11/2026

[Feature 42](42-vnd-claim-refund-next.md) cập nhật Claim Client/Supplier nhiều Order, chronology Processing, Complete, hai watchlist và link thủ công. GP-Net sau Refund liên nhóm còn mở. Hoa hồng tháng theo Feature 45. Pilot chứng từ thật và rehearsal môi trường triển khai tiếp tục chờ xác nhận. Các mốc cũ bên dưới mô tả phạm vi từng đợt trước.

## Claim và Refund NEXT — 18/11/2026
[Feature 42](42-vnd-claim-refund-next.md) ghi đặc tả Claim/Refund, hiện trạng, checklist pilot và phần truy vết case chưa phân bổ trong báo cáo BOD.

## VNĐ V1 continuation — 17/11/2026
[Feature 41](41-vnd-supplier-period-gp-control-tower.md) records immutable Supplier period close/current-period late corrections, freight-only GP-Base and approved reference commission formula, whole-Claim same-cohort group reconciliation, before-Refund GP-Net, and scoped VNĐ Control Tower exceptions. Synthetic verification is separate from real-document pilot/deployment acceptance. Claim/watchlist/Complete Claim linking remains NEXT phase. This supersedes contrary earlier delivery-status notes only for this bounded VNĐ scope.

## Current build continuation — 17/11/2026
[Feature 40](40-vnd-post-shipping-import-reconciliation.md): Supplier VNĐ error queue/bulk review, commercial supplemental-cost import and Client surcharge/tax preview/import. Approved Claim watchlist/case-link direction is documented for the next phase; full V1 remains partial.

## Owner clarification — 17/11/2026 (supersedes earlier OPEN coverage notes)
- CONFIRMED: workbook Net for ePacket Standard/Eco already includes mid-mile + last-mile. Detailed component accounting is deferred to a later phase; it is not a V1 blocker and must not be added again to inclusive Net. Estimated workbook Net remains distinct from Supplier-approved Actual and finalized GP.
- CONFIRMED: Supplier cancellation/void policy and carrier evidence must be set up per service/route. Manual follow-up with Admin choosing a refund percentage/amount is approved. Values/evidence still need operational configuration; no default percentage, automatic carrier void or cost reversal follows from internal cancellation. Supplier money remains explicitly reconciled through its financial workflow.

[VNĐ Supplier receivable continuation](38-vnd-supplier-receivables.md) — separate receivable/offset/reversal and durable scoped Claim notifications; full V1/pilot remain partial.

## VNĐ Claim / Supplier increment — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md): separate Claim approval/pool/Bank/Balance/recovery, Supplier documentary actual-to-payable and payment history, categorized reporting. Partial scope; final gate evidence and remaining implementation are recorded separately. No pilot acceptance.

## Canonical local workspace and VND commission inputs — 17/11/2026
Active repo: `/Users/quan/Developer/report`. [Feature 36](36-vnd-commission-report.md) records copy integrity and bounded per-Order/Sales commission inputs. Claim/refund categories, Supplier Finance and full pilot remain incomplete.

## VND continuation — 17/11/2026
New-account VND continuation: UPS Purchase/account export, destination ePacket EU routing, Admin shipping edit, policy Cancel & Duplicate, scoped Client Add-on, immutable VND Statements, explicit Debt and BOD monthly report now have implementation. Full migration, Claim/Supplier financial cutover and full reporting/pilot acceptance remain incomplete.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

## Final-source automatic Purchase increment — 17/11/2026
[Feature 34](34-service-v1-final-source-purchase.md) extends new-account VNĐ Purchase to ePacket Standard/Eco/EU and Yun via final Excel (2), existing Review/Publish and exact Reserve/FIFO/Charge. It supersedes earlier blanket statements that only Chuyên tuyến is admitted. UPS has a source resolver only; operational UPS, auto EU routing, Shipping Edit, Duplicate, Add-on and financial reporting cutover remain pending. [Source index](SERVICE-V1-SOURCE-INDEX.md) closes source identity and fixed-VND ePacket fee/FX relation only.

## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

# Feature Index — DMD Order Platform

- [Final Excel (2): authoritative source, superseded files and verified cells](SERVICE-V1-SOURCE-INDEX.md). Source/fee-FX OPEN items are closed only as documented there; operational delivery remains separately verified.

- [Exact fractional VNĐ foundation](32-vnd-money-foundation.md) — decimal arithmetic implemented; wallet/Purchase/ledger cutover still missing.

**Current requirements 16/11:** [Full implementation handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [HEAD gap / superseded rules / build order](31-service-v1-build-gap.md). APPROVED is not IMPLEMENTED; OPEN values are not defaults. These override contrary dated sections below.

- [Per-route cancellation and Supplier follow-up](30-supplier-cancellation-followup.md) — configured policy/stage required; Admin support 100% cannot bypass denial. No global 90/100.
- [Atomic reserve/retry hardening](04-purchase-engine.md) — independent writer regression; VND Purchase / consent / FIFO / Edit / Duplicate remain incomplete.
- [UPS approved boundaries and deterministic priority](26-ups-v1-core.md) — divisor 5000, (min,max], SDS→VTT→JD tie; operational integration still pending.
Cập nhật 14/11/2026. **CONFIRMED** = quyết định có nguồn; **CURRENT** = hành vi kiểm qua code; **PROPOSED** = chưa duyệt; **OPEN** = thiếu rule/bằng chứng/số liệu. Không nhãn nào tự chứng nhận production.

- [Edit Order V1: confirmed target, partial locks and integration blockers](28-order-edit-v1.md)

- [Admin-confirmed Rate USD–VND and ePacket source USD quote snapshots](29-service-v1-fx.md)

## Service Architecture V1
- [CURRENT selected-row VND quotes, Client Discount and immutable history; operational Purchase pending](27-service-v1-quotes.md)
Owner 14/11 đã chốt: giữ số lẻ VNĐ; UPS Shipment Surcharge một lần/Lot; Fulfillment là xử lý Order/bàn giao. [Cập nhật và kiểm chứng](../../artifacts/service-v1-2026-11-14/OWNER-CLARIFICATION.md).
- [CURRENT UPS calculator, account Review/Publish and global confirmation](26-ups-v1-core.md)
- [CURRENT staged pricing increment](25-service-v1-pricing.md)
- [CURRENT staged configuration increment](24-service-v1-configuration.md)
- [Approved Decisions và nguồn](SERVICE-V1-APPROVED-DECISIONS.md)
- [Specification chi tiết](DMD_Order_Platform_Service_Architecture_V1_Specification.md)
- [Feature 23: CURRENT, gaps, acceptance và thứ tự triển khai](23-service-architecture-v1.md)
- [Lịch sử cập nhật index trước 14/11](archive/FEATURE-INDEX-BEFORE-2026-11-14.md) — chỉ là lịch sử, không đọc trạng thái cũ như trạng thái hiện hành.

CURRENT baseline 2302d06: ePacket giá USD/Base độc lập; UPS/custom manual; reserve/charge, financial ledger, Statement V2, Debt và Supplier workflows đã có code. V1 VNĐ/sequential markup/UPS optimizer/Client Add-on chưa hoàn tất. Feature docs mô tả phạm vi và verification riêng; cần test theo thay đổi.

## Tài liệu điều hành
- [Operational Flow 16/10 — nguồn chuẩn nghiệp vụ hiện tại](./OPERATIONAL-FLOW.md): cập nhật Owner được ưu tiên hơn quyết định cũ; code/tests mô tả as-is, không thay thế yêu cầu đã chốt.
- [Kiểm chứng 16/10](./VERIFICATION-2026-10-16.md): kết quả thực tế và khoảng trống.
- [Decisions 2026-10-13](./DECISIONS-2026-10-13.md): quyết định nghiệp vụ mới, phân biệt với code hiện có.
- [Roadmap](./ROADMAP.md): 3 giai đoạn và release gates.
- [Quy trình cập nhật](./CONTRIBUTING.md).

## Danh mục
- [Debt Management](17-debt-management.md)
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
