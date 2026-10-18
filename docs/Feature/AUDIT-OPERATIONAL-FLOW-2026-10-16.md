# Rà soát Operational Flow — 16/10/2026

Source: `/Users/quan/Desktop/report`, branch `main`, HEAD `cebd058`. Chỉ Owner và ChatGPT làm source. Đây là audit source local, không xác nhận production. Không commit/push/deploy hay mở/migrate database thật.

## Nguồn và giới hạn
- Đọc hội thoại “Báo cáo tình trạng dự án” được Owner tham chiếu; chỉ dùng làm bằng chứng quyết định của Owner, không coi lời khẳng định triển khai của assistant là bằng chứng code.
- Không tìm thấy file `DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md` trong project, kể cả thư mục bản sao `Codex/`. Không có attachment từ lần đọc hội thoại để tải nội dung gốc; chưa thể xác nhận diff nguyên văn file xuất trước đó.
- Đối chiếu canonical [OPERATIONAL-FLOW](OPERATIONAL-FLOW.md), README, Decisions, Roadmap, CONTRIBUTING, feature 06/09/10, verification 16/10 và source hiện tại. Không tự đổi quyết định nghiệp vụ theo code.
- IMPLEMENTED = tìm thấy trong source local; APPROVED = Owner đã chốt nhưng còn thiếu hoặc chưa nghiệm thu; DEFERRED = chủ động để sau. Không có trạng thái nào tự chứng minh đã deploy.

## Còn đúng
| Quy tắc | Trạng thái / bằng chứng |
|---|---|
| Cân đo kho thủ công, tùy chọn | IMPLEMENTED: warehouse-guard không bắt buộc MEASURED; không nhầm dữ liệu khai báo để quote |
| Giá bán độc lập Net Cost; reserve khác charge | IMPLEMENTED trong route-pricing/credit/order-operations; cần UAT theo route |
| Tracking FAILED khác Purchase FAILED và Case đóng | IMPLEMENTED: shipment-status API có FAILED, filter riêng và loại khỏi active; không tự refund |
| Debt/payment và đối soát từng Lot | IMPLEMENTED local; verify-debt-reconciliation PASS; migration/UAT còn thiếu |
| Cancellation theo policy route, refund trên tiền đã charge; Claim refund phân bổ Order | IMPLEMENTED local; cancellation/operations regression PASS; policy thực và huỷ label Supplier còn thiếu |
| Mid-mile thực tế phân bổ theo chargeable weight | APPROVED về nguyên tắc, DEFERRED triển khai cùng Cargo; không là gate GĐ1 |
| Supplier portal/login/Balance/Statements | DEFERRED, cần đặc tả quyền; không dùng Client Balance thay thế |

## Đã lỗi thời trong tài liệu
- OPERATIONAL-FLOW mục 5 và bảng mục 7 vẫn nói chưa có component model. Code đã có LAST_MILE/MID_MILE/WAREHOUSE/OTHER; đã sửa canonical và delta cũ trong feature 09.
- Effective cost fallback estimate phần thiếu actual; actual thay cùng component. Zero khác null. PARTIAL/COMPLETE/UNKNOWN; ePacket aggregate chưa mapping không tự có effective total.
- GP finalized cần mọi Lot PASS và coverage COMPLETE. Snapshot/version đã có; không tự coi PASS là fully actual.
- Báo cáo verification đầu ngày (48 checks và ghi thiếu component) là lịch sử; cost coverage verification sau đó ghi 58 checks. Audit này chạy lại 58, không cộng số cũ vào kết quả mới.
- README có thống kê Git ngày 13/10, chỉ là lịch sử. Hiện nhiều thay đổi source/docs local, gồm docs/Feature chưa tracked. HEAD và origin/main local hiện 0/0 divergence; chưa fetch remote nên không xác nhận trạng thái GitHub hiện thời.

## Thiếu / chưa triển khai / chưa nghiệm thu
| Mức ưu tiên | Nội dung | Đối chiếu source / tác động |
|---|---|---|
| Blocker GĐ1 | Quyền GP-Net D22 | auth.ts chỉ ADMIN/SALES/CLIENT/WAREHOUSE; ADMIN vẫn nhận full Order và Reconciliation. Cần quyền BOD/finance tách khỏi Admin vận hành |
| Blocker GĐ1 | Trường tài chính mới lọt qua blacklist Orders | GET Orders spread Order, stripPricingInternals chỉ bỏ snapshot/commission/version. estimated_gp, estimated_margin_pct, finalized_gp, finalized_margin_pct, effective_net_cost, cost_coverage_json chưa bị lọc cho Sales/Client. Bằng chứng tĩnh; cần regression API thực |
| GĐ1 | Auto surcharge cân đo | inbound.ts vẫn tạo PENDING_APPROVAL; approve_adjustment mới debit. Trái D19 đã duyệt |
| GĐ1 | Vượt giới hạn service | quote không eligible throw trong transaction, rollback measurement; chưa hoàn tất lưu evidence rồi hold/reroute/return |
| GĐ1 | Mapping chi phí | Component API có nhưng UI chỉ tổng, chưa adapter supplier decomposition/FX; aggregate cũ không tự chuyển component; cần nguồn estimate Mid-mile rõ phạm vi |
| GĐ1 | Warehouse tính theo Carton/Order | Có component lưu theo Lot + reference text; chưa bộ tính/phân bổ tự động theo carton/order, chưa liên kết FK carton; không đánh dấu toàn workflow IMPLEMENTED |
| Cần chốt scope GĐ1 | Supplier payables | Chưa thấy sổ invoice/payment allocation/outstanding riêng. supplier_costs là cost; supplier_recoveries/receipts là thu hồi, không phải phải trả. Portal DEFERRED không có nghĩa payables đã hoàn tất; Owner chốt quản lý ngoài hệ thống hay sổ nội bộ |
| GĐ1 | Claim/cancellation thực tế | Thiếu policy từng Supplier/route và tích hợp huỷ label carrier; app cancellation không chứng minh carrier đã huỷ. Claim legacy thiếu allocation cần đối chiếu, không tự chia |
| GĐ1 | Report/export/lịch sử | Chưa chứng minh toàn bộ nơi đọc GP cũ dùng coverage; không backfill finalized lịch sử tự động; cần đóng kỳ/revision và kiểm tra dữ liệu |
| GĐ1 | UAT/migration | Chưa nghiệm thu browser, chưa rehearsal toàn bộ migration/rollback trên bản sao dữ liệu thực |
| Sau GĐ1 | Cargo allocation và Supplier portal | DEFERRED; rounding/residual, FX, zero weight, split manifest, late invoice/reversal, quyền Supplier phải đặc tả trước |

Cargo được Owner gọi GĐ2 trong phản hồi mới; Roadmap cũ gọi GĐ3 (GĐ2 Label). Chưa tự thay thứ tự; giữ Cargo sau GĐ1.

## Kiểm chứng lượt audit này
Node 20.20.2 có sẵn; không cài dependencies. Database test ở thư mục tạm, không dùng data/dmd-finance-ops.db.
- Debt/Reconciliation: PASS 58 checks.
- Operations: PASS 57 checks.
- Cancellation: PASS 128 assertions. Chỉ chuyển đường dẫn DB test `.smoke` sang thư mục tạm trong bộ chạy ở bộ nhớ; file test gốc không sửa.
- Tổng ba suite: 243 checks/assertions, không đồng nghĩa toàn bộ regression.
- TypeScript --noEmit --incremental false: PASS.
- git diff --check trước cập nhật docs: PASS. Link Markdown local: 63 liên kết trong docs/Feature được kiểm tra, không có đích bị thiếu.
- Chưa chạy lại production build/browser UAT; các kết quả build ở verification trước là lịch sử. Không chạy ứng dụng với DB thật vì module import có thể kích hoạt schema migration.

## Thứ tự tiếp theo GĐ1
1. Dùng baseline DB tạm; sửa quyền và payload rò GP/cost, kiểm thử allow/deny tất cả role, list/detail/export/dashboard.
2. Hoàn thiện auto surcharge và service-invalid hold/reroute/return; kiểm thử retry/remeasure, ledger/refund/giá khóa.
3. Nghiệm thu Mid-mile estimate fallback/replacement, supplier mapping/FX, Warehouse theo Carton/Order, Other và report coverage; actual Cargo allocation để sau.
4. Chốt supplier payables tối thiểu GĐ1, chứng từ và quy trình vận hành; không tự mở portal.
5. Cấu hình policy Supplier, xác nhận huỷ label thực tế; UAT Claim/Cancellation chồng nhau, compensation/recovery, idempotency.
6. Backup và rehearsal migration/rollback trên bản sao: Debt legacy, Claim thiếu allocation, pending cancellation, aggregate/component, GP lịch sử; đối chiếu tổng tiền và audit trước/sau.
7. Regression phù hợp + production build DB tách biệt, rồi browser UAT xuyên Order → Purchase → kho → Tracking → Cost/Reconciliation → Balance/Payment/Claim theo role/route. Ghi biên bản và xử lý blockers.
8. Review diff/docs/links; stage chọn lọc, bỏ bản sao Codex/cache/DB/secrets; commit phần đã nghiệm thu. Chỉ push khi Owner yêu cầu. Deploy riêng sau nghiệm thu, backup/rollback. Không thực hiện commit/push/deploy trong audit này.

## Lượt tiếp tục mới hơn
Đã tìm được bản xuất Business Rules trong outputs chat trước; đóng lỗ hổng sáu field Orders, thêm auto weight surcharge/Hold evidence ePacket, validation Tracking/Carton Lot và Supplier Payables GĐ1 D24. Các mô tả chưa triển khai tương ứng ở audit này là lịch sử. Xem [kết quả mới](VERIFICATION-CONTINUATION-2026-10-16.md); các blocker Pricing D02 và quyền D22 vẫn chưa hoàn tất.
