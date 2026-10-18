# Tài khoản & phân quyền
**Hiện hành: 18/10/2026.** Supersedes các delta 16/10 về role chưa triển khai. Xem [verification](VERIFICATION-COMMIT-2026-10-18.md).

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
