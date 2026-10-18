# DMD Report — Kết quả lượt tiếp tục GĐ1, 16/10/2026

Source: `/Users/quan/Desktop/report`, nhánh `main`, HEAD `cebd058`. Chỉ Owner và ChatGPT quản lý source. **Đã cập nhật source local; chưa nghiệm thu toàn bộ GĐ1. Không commit, push, deploy hoặc mở/migrate DB thật.**

## Đối chiếu tài liệu

Đã tìm thấy bản xuất `DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md` ở outputs của chat trước (`…this-is-an-3/outputs`). Bản đó phản ánh canonical trước lượt tiếp tục; hiện thiếu D24 và các thay đổi dưới đây. Các báo cáo cũ nói “không tìm thấy file” là thông tin tại thời điểm khảo sát cũ.

Canonical hiện hành: `/Users/quan/Desktop/report/docs/Feature/OPERATIONAL-FLOW.md`. Đã cập nhật Decisions, Roadmap, README và feature 01/02/03/07/08/09/12; thêm `13-supplier-payables.md`. Các trạng thái IMPLEMENTED local / APPROVED còn thiếu / DEFERRED được giữ riêng. Kết quả chạy mới nằm ở `VERIFICATION-CONTINUATION-2026-10-16.md`.

## Đã sửa và triển khai

### Bảo vệ dữ liệu Orders

- Lọc `estimated_gp`, `estimated_margin_pct`, `finalized_gp`, `finalized_margin_pct`, `effective_net_cost`, `cost_coverage_json` khỏi Orders list/detail và response tạo Order của Sales.
- Regression dùng giá trị non-null để kiểm tra không lộ field; kiểm tra ownership detail. Đây không thay thế việc tách quyền BOD/finance khỏi Admin vận hành: D22 vẫn chưa hoàn tất.

### Warehouse / Tracking

- Với ePacket Standard/Eco DMD có snapshot và bảng giá khóa: tự ghi debit phần phụ phí đo thực tế dương chưa thu, public note/audit/statement cùng transaction. Không cần duyệt lần hai.
- Đo lại cùng mức hoặc thấp hơn không thu trùng, không tự hoàn. Tăng tiếp chỉ thu delta còn thiếu. Chiều dài phát sinh phụ phí trong cùng tier vẫn được tính. Không sửa snapshot hoặc Sales Price đã khóa.
- Vượt service hoặc thiếu phiên bản giá: giữ measurement làm bằng chứng và tạo Case HOLD chặn outbound; chỉ Admin được đóng Hold. Không tự đổi route/label. Kho vẫn không bắt buộc cân đo lại.
- Reconciliation revenue gồm phụ phí cân đo đã ghi debit; refundable charged total đã bao gồm WEIGHT_ADJUSTMENT. Order đã hủy không cộng lại phụ phí vào tiền giữ lại.
- API cấp tracking từ chối Lot khác Lot của Carton; không âm thầm ghi nhận về Lot carton trong khi người dùng nhập Lot khác. Fixture HTTP khai báo đúng Carton/Lot trước khi cấp tracking.
- Shipment FAILED độc lập Case đã được regression lại, không tự refund hoặc đóng Case.

### Supplier Payables — quyết định mới D24

Owner chọn **đưa sổ phải trả nội bộ vào GĐ1**, còn portal/login Supplier để sau.

- Đã thêm invoice USD, chứng từ, ngày/hạn trả, số còn phải trả theo Supplier; payment trả một phần/toàn phần và allocation nhiều invoice qua API.
- Chặn overpayment, allocation trùng/khác Supplier, sai tổng, số tiền sai cent, duplicate chứng từ và retry đổi payload. Actor từ session.
- Đảo payment và hủy invoice chưa trả theo lịch sử append-only, có lý do/audit; không xóa chứng từ hoặc tự chuyển/hoàn tiền ngân hàng.
- Ghi invoice/payment không sinh lại Supplier Cost, không thay GP/coverage hoặc Client Balance. Supplier inactive vẫn có thể trả nghĩa vụ cũ; Supplier có invoice không được rename làm mồ côi lịch sử.
- Có UI trong Supplier Costs & Phải trả và API `/api/supplier-payables`. Hiện theo ADMIN Finance Controls; SALES/CLIENT/WAREHOUSE bị chặn. Quyền finance chuyên biệt trước release còn phải hoàn tất.

### Cost coverage / Mid-mile

Đã chạy lại regression component hiện có: estimate phần thiếu actual được giữ; actual thay estimate cùng thành phần; không cộng chồng Mid-mile, phân biệt zero/null, PARTIAL/COMPLETE/UNKNOWN, snapshot/version/rollback và giá bán bất biến. Aggregate ePacket chưa mapping không tự có effective cost hay finalized GP. Không triển khai phân bổ actual Cargo/Mid-mile.

Đã sửa test Order Flow lỗi thời vốn mong GP thực tế từ tổng cost ePacket chưa rõ coverage; giữ kiểm tra estimate, finalized null và provisional. E2E cancellation lỗi thời đã thay bằng policy route explicit trong DB test, kiểm tra Client/Sales tự xử lý; không dùng tỷ lệ 100/90 làm mặc định sản phẩm.

## Kiểm chứng thực tế

Node 20.20.2 có sẵn, khớp native SQLite. Test DB ở thư mục tạm hoặc `.smoke`, build/server dùng `DMD_DB_PATH` test được đặt tường minh; không dùng `data/dmd-finance-ops.db`.

| Bộ kiểm tra | Kết quả cuối |
|---|---:|
| RBAC API smoke | PASS 65 |
| Operations / Warehouse / Claims | PASS 72 |
| Purchase Engine | PASS 45 |
| Order Flow | PASS 25 |
| Credit | PASS 48 |
| Balance idempotency | PASS 6 |
| Debt / Reconciliation / cost coverage | PASS 58 |
| Domain Finance | PASS 69 |
| ePacket Pricing hiện hành | PASS 159 |
| Manifest Cartons | PASS 57 |
| Route Segmentation | PASS 36 |
| Supplier Payables mới | PASS 48 |
| Cancellation domain | PASS 128 |
| Migration fixture legacy | PASS 14 |
| Orders qua HTTP | PASS 29 |
| Finance qua HTTP | PASS 19 |
| Operations qua HTTP | PASS 23 |
| Cancellation qua HTTP | PASS 86 |

**Tổng 987 checks/assertions trong 18 suite**, tính mỗi suite theo kết quả cuối, không cộng lần chạy lỗi/retry. Các suite có phạm vi giao nhau; số lượng không chứng minh toàn bộ GĐ1 đáp ứng yêu cầu.

- TypeScript `--noEmit --incremental false`: PASS.
- Next production build local sau thay đổi: PASS, 37 static pages; không deploy.
- ESLint các file source/test được sửa trong lượt này: PASS, 0 errors/warnings.
- `git diff --check`: PASS.
- Migration 14 assertions là fixture tổng hợp từ baseline cũ; chưa rehearsal toàn bộ trên bản sao DB thật, chưa xác nhận mọi module/history. Supplier Payables riêng có schema rerun/immutability/rollback tests.

## Kiểm tra UI/role

Trên ứng dụng local port 3126, DB test mới:

- Admin đăng nhập, mở sổ phải trả, tạo invoice mô phỏng 125 USD; ghi nhận trả 25 USD; màn hình hiển thị còn 100 USD và lịch sử payment. Không có chuyển tiền thực tế.
- Sales và Client thấy Orders/Control Tower/Balance, không có Supplier Costs/Reconciliation/Payables. Warehouse thấy Manifest/Control Tower, không có màn tài chính Supplier.
- API Supplier Payables đã kiểm tra read/write role, 401/403 và chống spoof actor. RBAC Orders list/detail dùng fixture dữ liệu riêng; không lấy việc ẩn UI làm bằng chứng server bảo mật đầy đủ.
- Đã xem bố cục mobile hiện tại, lưu ảnh bằng chứng. Đây là smoke test giao diện, chưa phải biên bản UAT đầy đủ cho mọi route/thiết bị/quy trình.

Ảnh: `supplier-payables-uat-full.jpg` trong outputs của chat này.

## Còn phải triển khai / blockers

| Ưu tiên | Việc còn lại | Phân loại |
|---|---|---|
| P0 | D02 Base Rate độc lập Net: `epacket-pricing.quote` vẫn tier.net → Base/Retail; cần bảng giá bán độc lập, cấu hình/import/snapshot/migration và regression giá lịch sử | APPROVED, chưa triển khai đầy đủ; test ePacket xanh chỉ xác nhận công thức hiện hành |
| P0 | D22 quyền BOD/authorized finance: hiện ADMIN vẫn có full quote, Orders, Reconciliation, dashboard/report; phải tách server permission và tất cả đường có thể suy Net | APPROVED, release blocker; lỗ hổng sáu field non-Admin đã sửa không đồng nghĩa hoàn tất |
| P0 | Mapping supplier cost/coverage: phạm vi estimate Mid-mile, Last-mile, Warehouse, Other, quy tắc FX; report/export/history chưa xác minh đồng bộ | Cần chứng từ/mapping thực tế; không tự coi aggregate fully actual |
| P1 | D19 auto surcharge cho route chưa có giá version; reroute/label cũ-mới/return end-to-end và quy tắc charge khi đổi route | APPROVED còn thiếu; ePacket giá khóa và Hold evidence đã có |
| P1 | Supplier Payables: UAT với chứng từ thực, quyền finance riêng, đối chiếu invoice ↔ cost feed; prepayment/credit note/FX/export/đóng kỳ chưa có | Module cơ bản local đã có; phạm vi nâng cao cần chốt trước triển khai |
| P1 | Policy Cancellation từng Supplier/route và xử lý hủy label tại carrier | Cần dữ liệu/quy trình vận hành thực; hủy trong app không chứng minh carrier đã hủy |
| P1 | Backup, migration/rollback rehearsal trên bản sao được cho phép: Debt legacy, Claim thiếu allocation, pending cancellation, GP/cost lịch sử | Chưa nghiệm thu; không sửa/backfill số tiền lịch sử bằng suy đoán |
| P1 | UAT ePacket/UPS/khách công nợ đầy đủ và báo cáo BOD/Sales, kỳ chốt/export | Chưa hoàn tất; HTTP smoke không thay UAT |
| Sau GĐ1 | Actual Mid-mile allocation/Cargo; Supplier portal/login | DEFERRED |

## Thứ tự tiếp theo

1. Hoàn thiện Pricing D02 và permission D22 trên nhánh thay đổi có kiểm soát; chưa đưa vào sử dụng tiền thật.
2. Chốt mapping từ chứng từ Supplier cho estimate/actual coverage, đồng bộ report/export; giữ actual Cargo allocation sau GĐ1.
3. Hoàn thiện Warehouse trên các route còn lại và flow đổi route/label/return, bảo toàn tiền đã charge/refund.
4. UAT Supplier Payables và Cancellation với bộ chứng từ mô phỏng sát thực tế; cấu hình policy từng tuyến theo căn cứ Supplier.
5. Rehearsal backup/migration/rollback trên DB staging được cấp, đối chiếu totals/audit trước-sau; hoàn tất UAT theo role.
6. Review toàn diff hiện có, chọn phạm vi đã nghiệm thu để commit. Không stage bản sao `Codex/`, cache, DB hoặc secrets. Push/deploy chỉ khi Owner yêu cầu rõ.

Chưa tạo commit vì còn nhiều thay đổi local từ các lượt trước và release blockers chưa khép lại; không gộp toàn bộ thành một commit được coi là đã nghiệm thu.
