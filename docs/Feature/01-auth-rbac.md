## VNĐ Claim / Supplier continuation — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md): Client/assigned Sales/Admin create Claim; Admin decisions; Finance payouts; Admin/Finance recovery. Supplier costs for Admin/Finance/BOD; payable/approval/payment for Finance/BOD; keep-old for Admin/Finance. Enterprise report stays BOD-only. No broader inheritance inferred.

## VND continuation — 17/11/2026
New VND shipping edit/Cancel & Duplicate are explicitly Admin-only. Add-on writes are Sales/Admin/BOD scoped to the Client; Sales cost/supplier visibility is limited to that Client's Add-ons through the dedicated endpoint. Client projections omit Add-on cost/supplier and private history. VND enterprise monthly report remains BOD-only; configuration remains root Admin pending broader target reconciliation.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

## Current requirements — handoff 16/11/2026
[Canonical full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [audited HEAD gaps](31-service-v1-build-gap.md) supersede contrary dated requirements below. Earlier dated sections are historical where inconsistent, not concurrent current rules.
- APPROVED: cancellation policy per Service/Sub-Service/Supplier route; no global 90/100. Admin may support 100%, never bypass shipment denial. Claim refund is separate. Combined Duplicate uses policy with optional Admin support, not unconditional 100%.
- APPROVED: Edit Order shipping/service only before any Tracking OR Label; separate manual Edit Selling Price offer and Add Tracking/Label. Selling correction after charge appends delta/history without reopening Purchase.
- APPROVED: Add-on revenue correction replaces old absolute revenue lock. Financial posting/adjustment may exceed Credit Limit without creating Debt; Purchase still gates funds.
- APPROVED: VND fractional values retained; UPS divisor 5000, bands (min,max], priority SDS→VTT→JD. Global FX/UPS variables update new Net/Base/Retail without promoting pending account versions.
- IMPLEMENTED / STAGED / MISSING: use the linked HEAD gap, not old baseline tables. Operational USD is not VND simply by changing labels. OPEN supplier policy values, ePacket FX/fee relation, source price/zone validation and manual-offer service change stay OPEN.

## Quyền xử lý Supplier Cost — 06/11/2026

Admin và Finance có quyền xem/nhập chứng từ Supplier Cost, xử lý Tracking trùng, ghi/xác nhận Supplier Cost Adjustment và xem lịch sử trong hai màn hình chuyên biệt. Admin vẫn bị chặn khỏi báo cáo GP, API Reconciliation, Supplier Account và Supplier Payables. BOD giữ quyền xem/nhập chứng từ gốc và đối soát hiện có. Hai thao tác xử lý Tracking trùng và Supplier Cost Adjustment giới hạn ở Admin/Finance.

## Content egress continuation — 27/10/2026

Sales/Client JSON projection now sanitizes catalogued Supplier names and explicitly labelled private financial values within prose, error bodies, string arrays and nested serialized JSON. Additional cost aliases and internal `source_code` are excluded. Private/inline Label or attachment URLs are withheld; ordinary safe links remain. Order notes retain safe text in the same paragraph, replacing confidential spans instead of dropping paragraphs. Admin Supplier operations and Finance/BOD endpoint permissions remain unchanged. Original audited rows are preserved. [Reproductions, exact coverage and remaining remote-document/content gates](AUDIT-EGRESS-BULK-2026-10-27.md).

## Supplier privacy audit — 27/10/2026

Sales/Client JSON projections remove all Supplier-named fields and Supplier enum rows, including nested serialized JSON. This closes `/api/enums` and `/api/client-services` (`default_supplier`, including `view=setup`) disclosures; Admin routing configuration remains available. Assigned-Client checks remain in the endpoint. `scripts/verify-supplier-privacy.cjs` uses a disposable DB and tests both roles, nested JSON, unassigned Sales and Admin preservation. Base Cost permission is not explicitly granted to Sales by current pricing decisions: existing Base/guidance/markup exclusions remain fail-closed pending Owner clarification. This is not a claim that arbitrary notes, uploaded label contents, CSV or all APIs have been proven free of confidential content.

## Owner continuation — 27/10/2026 · Refund / Internal Expenses

[Chi tiêu nội bộ](22-internal-expenses.md): BOD và FINANCE đều được tạo/sửa/thanh toán/đảo và xem audit; ADMIN/SALES/CLIENT/WAREHOUSE bị chặn GET/POST trên server. Không cấp quyền mới vào Client Ledger.

## Owner continuation — 25/10/2026
Current Sales snapshots, BOD monthly trends and Statement batch close: [approved behavior and integration](20-sales-monthly-close.md). This delta supersedes conflicting historical notes below. No background scheduler is configured.

# Tài khoản & phân quyền

## Payment Adjustment application continuation — 20/10/2026

Finance can now append linked actual-receipt adjustments through the Payment Reconciliation UI/API. Original Payment and adjustment ledger/history are immutable; reductions consume the Payment's Balance portion, then reverse principal and interest; increases settle current Debt interest/principal before surplus. Client/Sales notifications, optimistic versions and atomic actor-scoped receipts are implemented. Existing Payment allocations into Statements are **blocked pending reviewed migration**; the global legacy FIFO and Statement-dependent Debt conversion remain. This is a verified partial delivery, not completion of the Owner financial cutover. See [Payment feature](15-payment-reconciliation.md) and [current evidence](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).


## Payment reconciliation continuation — 20/10/2026

Finance bulk confirmation/discrepancy is connected to real Payment ledger rows through a dedicated API and UI. It appends immutable reconciliation history, atomic Client/Sales notifications and optimistic version checks without moving money or allocations. Payment Adjustment and the approved Payment/Debt/Statement cutover remain incomplete. See [Payment reconciliation](15-payment-reconciliation.md) and [verification/migration/UAT](VERIFICATION-PAYMENTS-2026-10-20.md).


## Owner financial update — 20/10/2026

Refund Management now has a dedicated authenticated API: Finance executes actual payouts, Admin alone decides/revises Claim obligations and recovers overpayment; BOD reports, Sales assigned-Client reads and Client own reads. Bank details are private to Finance/BOD. Legacy Payment permissions remain unchanged. See [Refund Management](14-refund-management.md) and [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md).

## Role và phạm vi
- ADMIN: vận hành Orders/Tracking/kho/account/Client Balance. Có quyền xem chứng từ và xử lý trong màn hình Supplier Cost. API Reconciliation, GP-Net và Supplier Payables dành cho BOD/Finance.
- SALES, CLIENT, WAREHOUSE: giữ scope ownership/vận hành hiện có; không xem Supplier Net/GP-Net.
- BOD và FINANCE: role riêng; chỉ đọc/ghi Supplier Costs, đối soát Lot, invoice/payment Supplier. Có import Excel **costs**. Không có quyền Admin khác, không sửa Client wallet hoặc import Orders/Balance/Tracking.
- Root Owner cấp role BOD/FINANCE tường minh. Admin thường không được tạo, đổi role, reset password hoặc sửa tài khoản tài chính. Không tự nâng root thành BOD.
- Supplier portal/login: DEFERRED.

## Bảo vệ dữ liệu trên server
- Mọi JSON API qua financial-privacy.ts: lọc Net/GP-Net/margin, snapshot/coverage, audit ADMIN và JSON lồng dạng chuỗi. Ghi chú có timestamp được giữ.
- `/api/costs` (GET/POST) và `/api/import` (kind=costs) cho Admin/Finance/BOD. `/api/costs` (PATCH) và `/api/costs/adjustments` cho Admin/Finance. Reconciliation và Supplier Payables vẫn giới hạn Finance/BOD. Finance/BOD chỉ được dùng kind=costs trên API import chung.
- Chặn Excel placeholder lot.net_cost và placeholder ngoài allowlist, kể cả template cũ; không chỉ ẩn UI.
- Màn hình tài chính riêng, không cấp lại quyền Orders/Control Tower cho Finance.
- Password scrypt + salt; session cookie 7 ngày. Khóa/reset user giữ quy tắc hủy session hiện hành.

## Migration và giới hạn
- CHECK role users được nâng cấp, giữ mọi cột/ID/session/index, kiểm tra FK và rollback khi lỗi. Không cấp quyền tự động.
- Fixture legacy/rerun đã test; chưa rehearsal trên bản sao DB vận hành hoặc trigger tùy biến ngoài repo.
- BOD GP-Net tại Reconciliation phụ thuộc coverage/estimate; chưa chứng nhận báo cáo BOD, Sales GP-Base/commission hoặc UAT đầy đủ.

## Bằng chứng
src/lib/auth.ts, finance-role-schema.ts, financial-privacy.ts; src/app/api/; finance-role-workspace.tsx.
Tests: verify-rbac.cjs, verify-release-gates.cjs, verify-supplier-payables.cjs.

### Order detail authorization before refresh — 27/10/2026
`GET /api/orders/[id]` now checks current Client ownership before `refreshDraft`. Previously an unassigned Sales received 403 only after the active quote updated another Client's draft. The regression seeds an active approved Base Rate, asserts the quote exists, then compares the full Order row before/after the denied read. No schema or Balance semantics changed; authorized draft refresh behavior remains as before.
