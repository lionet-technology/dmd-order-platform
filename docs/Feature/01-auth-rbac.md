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
- ADMIN: vận hành Orders/Tracking/kho/account/Client Balance; không xem Supplier Net/GP-Net, không gọi Supplier Costs, Reconciliation hoặc Supplier Payables.
- SALES, CLIENT, WAREHOUSE: giữ scope ownership/vận hành hiện có; không xem Supplier Net/GP-Net.
- BOD và FINANCE: role riêng; chỉ đọc/ghi Supplier Costs, đối soát Lot, invoice/payment Supplier. Có import Excel **costs**. Không có quyền Admin khác, không sửa Client wallet hoặc import Orders/Balance/Tracking.
- Root Owner cấp role BOD/FINANCE tường minh. Admin thường không được tạo, đổi role, reset password hoặc sửa tài khoản tài chính. Không tự nâng root thành BOD.
- Supplier portal/login: DEFERRED.

## Bảo vệ dữ liệu trên server
- Mọi JSON API qua financial-privacy.ts: lọc Net/GP-Net/margin, snapshot/coverage, audit ADMIN và JSON lồng dạng chuỗi. Ghi chú có timestamp được giữ.
- Chỉ /api/costs, /api/reconciliation, /api/supplier-payables trả dữ liệu tài chính riêng cho BOD/FINANCE; /api/import chỉ cho họ nhập kind=costs và trả kết quả import.
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
