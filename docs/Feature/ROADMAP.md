# Roadmap triển khai — đã được Product chốt 13/10/2026

## Emergency Route Switch — 23/10/2026
Safe first-stage Hold/Undo, status/export and database guards implemented; emergency cancellation/replacement remains disabled pending liability carry-forward and cross-module financial recovery tests. Full Route lifecycle, optional-order Add-on, Statement name and remaining agreed modules remain approved backlog, not completed by this change. [Scope and QA](18-emergency-route-hold.md).

## 23/10 — Debt Aging/Action Dashboard
Đã bổ sung immutable per-Statement aging index, lấy hạn từ period_end, tách lãi dự phóng, tuần đã sử dụng/credit term, Admin one-time legacy aging opening có audit, Action Dashboard cho thiếu giá/Label/tuổi nợ. Không tự backfill Statement lịch sử; cần cutover reconciliation. Các gate còn mở: browser end-to-end Admin/Finance/Client mới, legacy cutover có chứng từ thật (happy path synthetic 17 assertions PASS), quy mô Dashboard nhiều Client và pilot thực. Xem `VERIFICATION-DEBT-AGING-2026-10-23.md`.


## Owner continuation — 22/10/2026 (current delta)

See [implementation, debt-age assumptions, test evidence and explicit remaining gates](OWNER-EXECUTION-2026-10-22.md). Five horizontal financial task tabs; read-only financial GETs; deterministic frozen-period debt aging; Tracking/Label before manual price; price/finalization gate; auditable partial-label override; server Ledger pagination. This delta supersedes contrary historical behavior below. No deployment or full production acceptance.


## Ledger UX / concurrency continuation — 20/10/2026

Implemented snapshot-first Ledger, one filterable scoped transaction table, task-based Payment/Refund/Statement access, refresh recovery and signed before/after receipts. New owned-DB HTTP race test proves two distinct manual-priced Orders cannot overspend and concurrent retries cannot charge twice. See [evidence and untested cases](VERIFICATION-LEDGER-UX-2026-10-20.md). This is substantial pre-UAT delivery; the remaining full browser cross-module matrix, real carrier/policy evidence and Owner acceptance are still release gates.


## Chrome UI UAT follow-up — 20/10/2026
Đã điều khiển Chrome headless thật trên **database synthetic riêng**: Client mở form UPS, chọn Multiple Cartons, thêm Carton 2/3, Carton Quantity tự tăng và khóa, xóa Carton giữa; Admin đăng nhập, vào Orders và quan sát header `Giá bán USD (Order)` tại bulk Tracking. Sửa UX chuyển Single→Multiple để giữ dữ liệu đã nhập và xác nhận khi quay về Single có mất Carton bổ sung. Test domain 29/29 PASS, TypeScript/lint/build PASS. **Chưa full browser end-to-end 5 role**, chưa thực nghiệm Admin nhập giá/Tracking rồi Statement ngay từ click UI. Xem `VERIFICATION-BROWSER-CARTON-2026-10-20.md` và bằng chứng ảnh Client.


## UPS/Chuyên tuyến manual GĐ1 — 20/10/2026
Bổ sung hardening trước UAT: Admin chỉ được nhập giá khi Order đã gửi mua và không đang Hold (cấp Order/Case/Kho/Route); Client không sửa Carton Quantity dẫn tới sai số Carton khi chọn Multiple, và file import phân nhóm phải sửa từ file gốc thay vì thay đổi cục bộ một dòng. Đã bổ sung regression tương ứng; full browser click-through vẫn mở vì browser companion chưa paired.

Thực hiện request Owner: cho submit Order chưa có giá, Admin nhập tổng giá bán khi cấp Tracking/Label (Reserve/Charge idempotent), Client nhập tay có Single/Multiple Cartons, API multi-carton public để sau; mở rộng regression E2E từ XLSX→Draft→Client submit→Admin price/Tracking→Manifest/Statement và single-Order detail. Chưa hoàn tất Owner browser UAT, real UPS prices/Supplier templates, triển khai database đích/pilot. Xem `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.


## P1 đơn giản hóa Client Order/Carton Import — 20/10/2026
Thống nhất mỗi dòng Client Excel là một Carton, ID bắt buộc và trùng liền nhau, Carton Quantity chỉ dòng đầu; cấu hình giới hạn 1 tham số per Route; không thêm cờ multi-carton riêng. Đã nối nhóm Excel vào Draft/Carton/Lot, thêm domain/API regression và UI cấu hình; giới hạn Carton dùng chung được chặn ở cả lúc lưu Carton và Purchase. Đã tạo fixture UAT mới 500 Order, gồm 40 multi-carton UPS/chuyên tuyến (Yun luôn 1), integrity OK. **Chưa chốt RC1:** API multi-carton nested/nhập tay, báo giá đúng cho UPS/chuyên tuyến, E2E xuyên Charge/Statement và browser UAT vẫn là release blockers. Xem `11-import-templates.md`.


## P1 continuation — 20/10/2026 (latest)

Bulk Tracking retry now preserves an omitted sub-service instead of clearing the locked route. New 19-assertion recovery regression covers second-group transaction rollback, exact retry and explicit failed-Draft reselection; no automatic Balance Adjustment. Statement synchronization reuses its prepared lookup. Final test/lint/typecheck/build pass; 27 domain suites. New HTTP runner verifies 10k-entry concurrency (600 requests, zero errors), signed financial writes, 12 concurrent finalizations and application restart from a verified backup restored into a new synthetic DB. Five-role desktop/mobile browser smoke is recorded separately from full workflow acceptance. Priced UPS/Yun multi-carton reserve-to-Statement integration, full workflow UAT, deployment-target rehearsal and real pilot remain open. See [verification and limits](VERIFICATION-P1-CONTINUATION-2026-10-20.md) and [pilot checklist](PILOT-CHECKLIST-2026-10-20.md).

## Benchmark Statement V2 bổ sung 20/10/2026
Đã chạy baseline synthetic-only 100 Client × 100 Ledger = 10.000 dòng; p50 8,21 ms, p95 29,54 ms cho lần preview + history, SQLite integrity OK. Đây không phải HTTP stress test hay tải production. Tiếp theo vẫn cần browser UAT đủ năm role, multi-carton/partial bulk/recovery xuyên luồng, HTTP concurrent load, diễn tập cutover trên đúng DB đích đã xác minh, pilot có phê duyệt. Xem `VERIFICATION-STATEMENT-LOAD-2026-10-20.md`.

## Audit remediation — 20/10/2026

Statement movement drilldown now uses labelled stacked rows at widths ≤640px, retaining signed Balance/Debt/Refund deltas, posting/reporting dates, source, Payment principal/interest and detail. Desktop retains the comparison table. Empty periods explicitly say there are no movements. Browser mobile verified on rebuilt candidate for Admin and Finance; complete role/device acceptance remains open. HTTP harnesses now use a multi-carton UPS fixture and the explicit Issues queue; Finance checks the approved Claim→Refund obligation rule and rejects retired Statement allocation, replacing obsolete auto-wallet expectations.

Operational `available_to_buy_cents` now reports `max(0, net Balance + Credit Limit - Reserve)` as approved. Signed Balance remains unchanged; insufficient signed headroom, Hold and overdue Debt still block independently. Debt repayment does not release room twice. Statement V2 is already operational (immutable snapshots, late postings, Claim dispute and BOD parity); older pending delivery notes below are historical. Current validation and outstanding acceptance: [audit remediation evidence](VERIFICATION-AUDIT-REMEDIATION-2026-10-20.md). No unverified database reset or activation of `fc_*`.


## Consecutive period UI continuation — 20/10/2026

The Statement history API returns `next_period_start` from the checkpoint or last issued end in the same serialized read as history. Selecting a Client automatically loads history and selects that unissued period; a next-period button restores its dates. A future period is labelled as unavailable for Finalize. Captured Credit Limit/Reserve appear separately as references, never added to balances. Client-switch/unmount invalidates pending Statement and Claim responses. Existing role, immutable snapshot, late-posting and Debt-first rules remain unchanged. See [current as-is audit and rerun evidence](STATUS-AS-IS-2026-10-20.md). Legacy migration and complete production acceptance remain open. Older progress sections below are historical.


## Statement V2 operational integration — 20/10/2026 (current implementation)

This section supersedes earlier delivery-status notes below; approved business rules are unchanged. Statement V2 is connected to the active operational Ledger, Debt/allocations, daily interest and Refund events, with API and UI. `fc_*` remains inactive. See [implementation, evidence and remaining gates](VERIFICATION-STATEMENT-V2-2026-10-20.md).

Implemented in active application: Statement V2 API/UI, immutable fees/financial movements and signed three-account openings/closings, late-posting carry-forward, linked Claims/dispute, immediate chronological Payment allocation and BOD period reconciliation. Isolated `fc_*` is not activated.

Remaining release gates: reviewed legacy schema/allocation/Claim migration or verified synthetic reset, complete Admin/Sales/Finance/Client/BOD desktop/mobile acceptance, high-volume performance, operational backup/restore rehearsal, real pilot rates/carrier/evidence and deployment acceptance. Client Bank Refund parity does not certify Supplier/company bank reconciliation. Test success is not production approval.


## BOD Finance Report — cập nhật 20/10/2026
Đã bổ sung một BOD Finance read-only projection lấy số dư từ `accountFinancials` và số Refund từ `RefundService`, tách dòng bank outflow và wallet; màn hình cho BOD/Finance, endpoint riêng kiểm soát quyền. **Chưa triển khai Statement V2 Finalized snapshot; số dư trong BOD là tại thời điểm truy vấn, không phải số dư cuối kỳ**. Xem `16-bod-finance-report.md` và `verify-bod-finance-report.cjs`.

## Cutover tài chính 20/10/2026 — tiến độ mới nhất
- Implemented/tested trên DB sạch: Payment không tự vào Statement, Statement overdue không chặn mua; Admin chuyển Balance ròng âm→Debt độc lập Statement, một Debt Account/Client, audit và tránh phân bổ ngược các Payment cũ. UI Admin Controls đã nối. Chưa gọi đây là toàn bộ Finance release.
- Tiếp theo P1: Statement snapshot bất biến và opening/closing Balance/Debt/Refund Balance, late adjustments và Claim dispute; loại bỏ màn PAID/UNPAID legacy của Statement và chứng minh BOD Balance/Refund reconciliation parity.
- P1 migration: cột `credit_debts.source_statement_id` cũ `NOT NULL` cần migration tường minh hoặc reset dữ liệu TEST đã xác minh, không tác động tự động tới DB không rõ nguồn; test HTTP/browser bổ sung.

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

Final recorded checks and limits: [Owner verification 22/10](VERIFICATION-OWNER-2026-10-22.md).
