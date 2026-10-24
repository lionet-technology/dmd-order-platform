## Emergency đơn giản hóa — 24/10/2026
Đổi Route trên Order gốc, Tracking/Label và Net Cost optional; blank giữ nguyên. Nếu thay Tracking thì thay đủ bộ ACTIVE. Cost Supplier cũ/mới tách chứng từ, không tự COMPLETE chỉ vì giữ label; cost import sau Switch không sửa Charge. Order upload lỗi còn HOLD, lưu alert để retry; từng Order thành công được giữ. Bất kỳ carton đã export Manifest thì toàn Order xử lý thủ công. [Quy tắc hiện hành](18-emergency-route-hold.md).

# Supplier Cost & Reconciliation

## Continuation — 24/10/2026
Reconciliation now stores `actual_gp` separately from approved/finalized GP. It uses the same commercial revenue and aggregate actual cost calculation (including old + new Supplier costs after Emergency Switch). Known loss remains visible during REVIEW without approving GP or charging the Client. Missing actual remains null. BOD/FINANCE can filter GP Orders by `loss_only=1` and `emergency_only=1`, independently of Lot filters, through UI/API. These filters do not rewrite history or Ledger. New field is removed from operational projections. Existing rows acquire values when normally reconciled; no historic backfill was run. Supplier Management, exports, payables integration and complete BOD/Add-on scope remain pending.

## Quyền hiện hành 18/10/2026
API Costs/Reconciliation và nhập Excel kind=costs chỉ BOD/FINANCE; Admin vận hành bị chặn. BOD/FINANCE không được import Orders/Balance/Tracking. Các hướng dẫn “Admin” phía dưới là thuật ngữ lịch sử cho người xử lý đối soát; quyền tài chính hiện hành xem feature 01. Không thay đổi scope coverage/FX đang pending.

## Chốt nghiệp vụ 14/10/2026 — backend đã cập nhật
- Đối soát theo Order + số Lot, không cần tracking đại diện. Supplier feed tracking vẫn được ghép vào Lot khi có mapping carton; thiếu mapping không tự đoán Lot.
- Actual > Estimated luôn Review trước khi Admin duyệt. Actual không vượt → Pass khi đủ cost/estimate. Thiếu cost Pending; thiếu estimate Review. Single Lot dùng estimate của Order; nhiều Lot cần estimate riêng, không tự chia đều.
- Sales Price đã chốt không đổi. Feed không tự tạo khoản phụ phí thu khách; Admin chọn `customer_surcharge` có public note, amount >0 và request_key, hoặc `absorb_loss` có lý do. Charge bổ sung độc lập trong ledger, đi vào statement kỳ hiện tại.
- Admin `replacement_cost` khi thiếu giá supplier, có audit; feed thực tế đến sau thay thế cost tạm và mở version mới. `estimate` đặt estimate Lot có audit.
- Bulk 1–200 Lot nguyên tử, reject Lot trùng/không hợp lệ. Version chỉ append khi số cost/estimate thay đổi hoặc phê duyệt; thay đổi sau phê duyệt đánh giá lại, không sửa version cũ.
- Finalized GP chỉ khi mọi Lot Pass/phê duyệt và actual coverage COMPLETE; `finalized_gp` và `finalized_margin_pct` nullable khi Pending/Review. GP dùng sales_price + surcharge doanh nghiệp hưởng + phụ phí Admin đã thu − total_net_cost. Revenue=0: margin N/A. Thuế/pass-through không tính vào revenue thương mại.

## API
- `POST /api/costs`: `{order_id: <DB ID>, lot_number, total_net_cost, ...}` không cần tracking; không nhập đồng thời tracking và Lot. Feed theo tracking hiện hành vẫn được hỗ trợ.
- `GET /api/reconciliation?granularity=lot`: Lot, estimate/actual cent, version, status, decision/reason. GET mặc định giữ shape Order cho màn hình hiện có.
- `POST /api/reconciliation`: `{request_key, order_id, lot_number, action, amount?, reason, public_note?}` hoặc `{request_key, items:[...]}`. Actions: `estimate`, `replacement_cost`, `absorb_loss`, `customer_surcharge`, `cost_adjustment` (amount USD có dấu, cost sau điều chỉnh không âm, request_key bắt buộc). Chỉ Admin.
- `src/lib/reconciliation.ts`, `src/lib/order-operations.ts`, `src/lib/order-shipments.ts`, `src/lib/finance.ts`; test `scripts/verify-debt-reconciliation.cjs`.


**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Supplier Cost nhập theo Lot trực tiếp hoặc import tracking; theo tài liệu MVP có thể xuất hiện trước Order rồi liên kết khi tracking tương ứng được thêm.
- Reconciliation đối chiếu estimated Net và actual supplier cost; phụ phí/thuế có thể về sau, vì vậy tránh ghi đè snapshot giá bán đã chốt.
- Phải phân biệt chi phí nội bộ, tiền thu Client, phụ phí bán lại, thuế, và Supplier Recovery; việc supplier trả tiền không tự động credit Client.
## Nguồn
- `src/app/api/costs/`, `src/app/api/reconciliation/`, `src/lib/order-operations.ts`, `src/lib/finance.ts`, `docs/legacy-logic/logic.md` (legacy).
## Chưa chốt
- Chuẩn hóa cost feed inclusive/fee/tax: backend dùng total_net_cost như cost thương mại đã chuẩn hóa; không tự cộng các cột phí thu khách vào cost tránh double count. Cần mapping supplier cụ thể/FX trước release.
- Màn UI Admin Lot/bulk/nhập cost đã bổ sung, cần browser UAT; báo cáo estimated/finalized đồng bộ toàn hệ thống, phân kỳ báo cáo GP đã khóa và export revision chưa nghiệm thu. Version audit hiện có không thay thế quy trình đóng kỳ báo cáo.
- Feed retry theo source_key giữ cơ chế hiện hành; cần bổ sung acceptance payload conflict và quy tắc chỉnh giảm/hoàn phụ phí đã thu. Không tự refund khi cost giảm.

## Lịch sử / late adjustments
- `GET /api/reconciliation?history_lot_id=<Lot DB ID>` trả các version bất biến cho Admin.
- `lot_cost_adjustments` append-only ghi tăng/giảm cost đến muộn, có actor/reason; không sửa supplier feed gốc. Cost sau điều chỉnh không âm; tổng cost đổi làm đánh giá lại trạng thái và giữ version cũ.
- `estimated_gp`/`estimated_margin_pct` riêng với finalized; ưu tiên tổng estimate Lot nếu đủ, fallback estimate Order. Pending không xác nhận finalized. Các cột GP legacy giữ số ước tính cho tương thích; báo cáo phải dùng trường finalized + status khi xác nhận lợi nhuận.

## Cancellation revenue — 15/10/2026
- Khi Order đã huỷ, phụ phí đã charge được tính trong refundable total và số tiền giữ lại; GP không cộng lại surcharge Lot lần hai. Actual Supplier Cost không tự thay đổi bởi cancellation/support credit. Regression Cancellation và Debt/Reconciliation được chạy lại.

## Delta 16/10 — cost coverage và phạm vi quyền
- IMPLEMENTED local: component/coverage model đã bổ sung sau delta đầu ngày; ePacket dùng estimate cho thành phần thiếu actual và không cộng chồng cùng phạm vi. Aggregate ePacket chưa mapping vẫn UNKNOWN; xem phần Cost components bên dưới. Mapping/UAT vẫn APPROVED chưa hoàn tất.
- Last-mile gắn Tracking, phí kho theo carton; actual Mid-mile Manifest/Air Cargo phân bổ chargeable weight Order/Lot DEFERRED. Thay placeholder tương ứng khi actual có, giữ chứng từ/tổng phân bổ/revision và chống trùng.
- D15 Supplier Cost surcharge vẫn cần Admin xử lý; D19 auto surcharge cân đo là trigger riêng.
- GP-Net chỉ BOD/authorized finance (APPROVED); ADMIN-only endpoint hiện chưa tách Admin vận hành, là release blocker. Supplier login/balance/statements/reconciliation/missing-cost/claims/payments DEFERRED, cần permission spec.
- Xem [Operational Flow](OPERATIONAL-FLOW.md), không tự kích hoạt Cargo hay Supplier portal.


## Cost components triển khai local — 16/10/2026
- Additive schema: lot_cost_components (LAST_MILE, MID_MILE, WAREHOUSE, OTHER), version.cost_snapshot_json; Order.actual_cost_coverage, effective_net_cost, cost_coverage_json. Không reset/xoá dữ liệu hoặc sửa pricing snapshot. Không backfill finalized GP lịch sử: phải reconcile trước khi xác nhận fully actual trên báo cáo cũ.
- POST reconciliation action cost_components cần Admin, reason, request_key, đủ bốn components `{component, estimated, actual: number|null, reference}`. Tổng estimate bằng estimate Lot. Reference cho tracking/Lot, allocation chứng từ tương lai, carton/order, other supplier. Không ép nhập decomposition trong UI GĐ1; UI vẫn nhập tổng estimate/actual, thêm nhãn coverage.
- Effective cost = tổng actual từng component nếu có, fallback estimate phần thiếu; zero actual hợp lệ. Actual Mid-mile thay estimate cùng phần, không cộng trùng. Thiếu component actual: PARTIAL, finalized GP null. Đủ actual: COMPLETE. PASS đối soát riêng với fully actual profit; finalized GP chỉ PASS + COMPLETE.
- Aggregate ePacket chưa có mapping: UNKNOWN, effective cost null (không suy đoán phần Mid-mile bằng 0 hoặc cộng nguyên estimate vào aggregate). PASS có margin_status PROVISIONAL. Estimated GP giữ riêng.
- Snapshot coverage/component bất biến trong từng reconciliation version. Đổi coverage tạo version dù tổng không đổi; đánh giá lại approval. Retry không tạo version trùng. Bulk lỗi rollback. API GET Order/Lot/history trả coverage/snapshot.
- Không trộn component với aggregate supplier/replacement/adjustment đã có. Direct/tracking aggregate feed vào component model bị reject; adapter Cargo sau này phải mapping phạm vi trước. Không tự vận hành Cargo allocation.
- Regression bổ sung tại scripts/verify-debt-reconciliation.cjs: partial/full coverage, zero, Mid-mile replacement không double count, retry, rollback, schema rerun, snapshot lịch sử và giá bán bất biến.
- Còn lại: supplier mapping/FX, phân bổ Cargo theo chargeable weight, browser UAT, quyền GP-Net BOD/finance D22, đóng kỳ/export revision và rà soát dữ liệu lịch sử. Chưa push/deploy, chưa chạy migration trên database thật.

## Rà soát canonical 16/10
- Warehouse component có reference carton/order nhưng chưa tự tính/phân bổ phí theo đơn vị carton/order. Supplier Cost và Supplier Recovery không phải sổ phải trả/thanh toán Supplier.
- Lọc payload Orders cho các trường cost/GP mới đã sửa trong lượt tiếp tục; D22 chưa hoàn thành. Xem [Operational Flow](OPERATIONAL-FLOW.md) và [audit](AUDIT-OPERATIONAL-FLOW-2026-10-16.md).

## Delta lượt tiếp tục 16/10/2026
Sổ [phải trả Supplier](13-supplier-payables.md) được Owner đưa vào GĐ1 D24, đã có module/API/UI local; không suy thanh toán từ cost hoặc tạo lại cost từ invoice. Reconciliation revenue bổ sung WEIGHT_ADJUSTMENT thực charge; cancellation revenue không cộng lại. Orders payload non-Admin đã lọc các trường GP/cost mới; D22 vẫn blocker.

## Internal UAT tiếp tục 18/10 — tìm và chọn dữ liệu Finance

- Supplier Cost: search Order/DMD ID/Tracking/khách/service, filter Supplier và trạng thái đối soát hoặc chưa ghép Order, phân trang 50 dòng. GET costs thêm `system_order_code`, `lot_number`; direct Lot cost không còn mất ngữ cảnh khi tracking trống. Các quyền BOD/FINANCE giữ nguyên.
- Lot: search không dấu theo Order/DMD ID/khách/route, dán danh sách ID ngăn bởi dòng mới, dấu phẩy hoặc chấm phẩy (match bất kỳ ID). Filter status/route/coverage kết hợp AND. 50 Lot mỗi trang, chọn cả trang, tối đa 200 Lot; đổi filter bỏ selection cũ. Chọn trang khác giữ selection, tổng selection hiển thị rõ; action áp dụng toàn bộ Lot đã chọn.
- GP có phân trang riêng 50 Order, ghi rõ không dùng bộ lọc Lot. Không thay đổi giá, cách tính tiền, eligibility, coverage hoặc hành vi đối soát.
- Regression pure filter/selection gồm nhiều ID, tiếng Việt không dấu, tổ hợp filter, giữ/bỏ selection theo trang, ranh giới 200; HTTP và browser verification xem biên bản Internal UAT.
- Bộ đếm Unmatched cost ở Tổng quan dùng `matched_order_id`, không so tracking chính của Order; cost ghép trực tiếp Lot hoặc tracking thay thế không bị đếm nhầm là chưa ghép.
