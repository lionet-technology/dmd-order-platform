# Roadmap triển khai — đã được Product chốt 13/10/2026

## Payment Adjustment application continuation — 20/10/2026

Finance can now append linked actual-receipt adjustments through the Payment Reconciliation UI/API. Original Payment and adjustment ledger/history are immutable; reductions consume the Payment's Balance portion, then reverse principal and interest; increases settle current Debt interest/principal before surplus. Client/Sales notifications, optimistic versions and atomic actor-scoped receipts are implemented. Existing Payment allocations into Statements are **blocked pending reviewed migration**; the global legacy FIFO and Statement-dependent Debt conversion remain. This is a verified partial delivery, not completion of the Owner financial cutover. See [Payment feature](15-payment-reconciliation.md) and [current evidence](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).


## Payment reconciliation continuation — 20/10/2026

Finance bulk confirmation/discrepancy is connected to real Payment ledger rows through a dedicated API and UI. It appends immutable reconciliation history, atomic Client/Sales notifications and optimistic version checks without moving money or allocations. Payment Adjustment and the approved Payment/Debt/Statement cutover remain incomplete. See [Payment reconciliation](15-payment-reconciliation.md) and [verification/migration/UAT](VERIFICATION-PAYMENTS-2026-10-20.md).


## Owner financial update — 20/10/2026

Claims/Refund API/UI and dedicated refund report are now implemented locally and have isolated domain/API plus role-browser verification. Payment reconciliation/adjustment, Statement-independent Debt, final financial Statement integration, historical migration and full release UAT remain open. See [Refund Management](14-refund-management.md) and [continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md).

## Trạng thái 18/10/2026
Đã triển khai local role BOD/FINANCE trong scope Supplier và gate Base Rate cho ePacket. Chưa hoàn tất adapter/approval Base Rate ở mọi route manual, bảng giá thật, coverage/FX/chứng từ thực và migration/UAT. Test local xanh không thay nghiệm thu GĐ1; xem VERIFICATION-COMMIT-2026-10-18.md.

**Không đồng nhất scope phase với trạng thái code.** Module đã có file/API có thể vẫn chưa đạt tiêu chí UAT và production.

## GĐ1 — Express + tiền và tài khoản
- Ghi nhận đơn và tính tiền cho ePacket, UPS, YunExpress, Chuyên tuyến custom.
- Base Rate riêng giá bán; Estimated/Actual Net riêng Cost; pricing snapshots; reserve/charge trigger tracking+label; Order/Client accounts; Balance/Credit/Debt và đối soát cần thiết.
- Kiểm thử E2E: create Draft → preview → Purchase → reserve → tracking+label → charge → supplier feed → reconciliation → finalized GP; failure/retry/cancel không duplicate ledger.

## GĐ2 — Dịch vụ Label từ production domain khác
- Nhận event usage từ hệ thống Label đang hoạt động (không phát minh là đã tích hợp).
- Mapping account, event ID, timestamps, đơn giá, audit, idempotency, reconciliation, correction & replay.
- Charge khi ghi nhận usage hợp lệ; không trừ dựa trên việc 'có tracking' nếu dịch vụ không tạo tracking.

## GĐ3 — Cargo và giảm ma sát vận hành
- Ghi nhận booking, ETD và event charge theo ETD; cancel policies, reschedule, alert, integration, case workflows và hiệu quả kho.
- Có thể bổ sung nghiệp vụ nâng cao sau khi đã bảo toàn nguồn tiền chuẩn và xác minh GĐ1/GĐ2.

## Release gates mỗi phase
1. Product phê duyệt rule/status/edge cases, tài liệu Feature đồng bộ code.
2. Migration/rollback và dữ liệu demo an toàn; không reset production data.
3. Permission, concurrency/idempotency, money totals, backfill và audit được test.
4. Kiểm tra UI/Admin/Sales/Client/Warehouse theo scope; UAT được ghi biên bản.
5. Quy trình deploy/backup/health và người chịu trách nhiệm vận hành rõ ràng.

## Delta 14/10/2026
- GĐ1: đã bổ sung backend Debt đơn nhất, lãi theo ngày/segment, payment allocation và Reconciliation theo Lot có Admin exceptions/bulk/version.
- Release còn cần UI/UAT, migration legacy có đối chiếu, normalized supplier cost/FX và báo cáo đóng kỳ; kết quả automated checks ghi trong `VERIFICATION-2026-10-14.md`.

## Delta 15/10/2026
- GĐ1 Cancellation đã có policy từng route, bỏ Admin approval, refund tổng đã charge gồm phụ phí, chống trùng và migration pending request.
- Release còn cần policy thực tế từng Supplier, carrier cancellation workflow, migration/UAT; xem 06-cancellation và VERIFICATION-2026-10-15.

## Delta 16/10/2026
- [Operational Flow](OPERATIONAL-FLOW.md) điều phối scope và acceptance mới. Cân đo kho là tùy chọn thủ công, không là gate bắt buộc GĐ1.
- GĐ1 còn phải hoàn thiện auto surcharge cân hợp lệ, hold/reroute/return khi vượt service, quyền GP-Net BOD/finance và cost coverage ePacket tránh double count. Không coi các phần này đã hoàn thành chỉ vì có module/API.
- FAILED tracking đã bổ sung local. Supplier portal/account và actual Mid-mile allocation thuộc giai đoạn sau, cần permission/cost allocation spec.
- Cargo: Owner gọi GĐ2 ở phản hồi mới; roadmap cũ GĐ2 là Label integration, GĐ3 Cargo. Giữ scope Cargo sau GĐ1, chưa tự quyết thứ tự Label/Cargo.

- 16/10: cost component API, coverage/report snapshots đã triển khai local; UI tổng cost giữ đơn giản. Cargo allocation, mapping supplier, quyền D22, UAT và lịch sử còn pending. Xem 09-supplier-reconciliation.md.

## Lượt tiếp tục 16/10 — D24
- Sổ phải trả Supplier nội bộ (invoice/payment allocation/outstanding) nằm trong GĐ1 theo Owner, đã triển khai local và cần UAT. Portal/login vẫn DEFERRED.
- Auto surcharge/invalid-service Hold có cho ePacket có bảng giá khóa; các route chưa có adapter, reroute/return còn thiếu.
- Release blockers: Pricing D02 độc lập Net, quyền D22 BOD/finance, supplier coverage/FX, legacy/migration và UAT.

## Ưu tiên 19/10
1. ePacket US pilot: giá Base/retail và cancellation policy thật được duyệt, carrier credentials/label/tracking, cost coverage/FX/chứng từ thật, migration/backup rehearsal và Owner acceptance.
2. Finance Reconciliation: bulk verify/report discrepancy, durable notification Client/Sales, preview adjustment; chốt thứ tự partial reversal và nguồn chuyển Balance âm ngoài Statement trước khi triển khai ghi tiền.
3. Xem [bằng chứng và blockers 19/10](VERIFICATION-OWNER-CREDIT-2026-10-19.md); test xanh không đồng nghĩa production-ready.
