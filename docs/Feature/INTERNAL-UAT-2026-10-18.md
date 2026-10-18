# Internal UAT DMD Report — 18/10/2026

**Trạng thái: Partial acceptance, chưa nghiệm thu toàn GĐ1.** Baseline `7511c22`. Kết quả dưới đây là thao tác và kiểm tra thực hiện trong lượt này, không kế thừa PASS từ báo cáo cũ.

## Môi trường và bảo vệ DB

- Bản làm việc riêng `dmd-uat` trong project mirror; clone từ `/Users/quan/Desktop/report`. Không sao chép `.env.local`, `data/`, `.next/`, `.smoke/` hoặc `Codex/` vận hành. Dependencies được sao chép riêng sau khi Turbopack từ chối symlink ra ngoài root; đây là lỗi bố trí môi trường đầu tiên, không phải lỗi source.
- Node 20.20.2; production build và `next start` trên localhost. Browser UAT: `127.0.0.1:3119`, DB `.smoke/internal-uat-test-oct18-v3.db`. HTTP regression dùng DB khác và port 3120. Build cũng chỉ nhận đường dẫn DB test tường minh.
- Không chạy migration, seed, reset, hoặc app process nào của lượt này trên DB vận hành. Không sửa source reference trong `sources/`. Checkout Desktop giữ nguyên; commit của lượt này ở bản làm việc riêng.
- Seeder mới `scripts/seed-internal-uat.cjs` chỉ chạy với `NODE_ENV=test`, file **chưa tồn tại** trong `.smoke`, tên `internal-uat-test-*.db`; từ chối DB cũ và đường dẫn khác trước khi import module khởi tạo DB. Test safeguard xác nhận hash DB cũ không đổi khi bị từ chối; môi trường production bị từ chối mà không tạo file.
- Hai lần thử xây fixture ban đầu bị chặn bởi Client khóa và service chưa cấp quyền. Không bypass business guard: seeder cuối dành Client mới cho luồng mua thành công, giữ fixture Client khóa riêng và cấp quyền dịch vụ cho draft manual. DB thử dở được giữ riêng, không dùng làm bằng chứng PASS.

## Dữ liệu tái tạo

Tạo DB mới bằng:

```sh
NODE_ENV=test DMD_DB_PATH="$PWD/.smoke/internal-uat-test-<ten-moi>.db" node scripts/seed-internal-uat.cjs
```

Seeder đã chạy lại thành công trên DB `internal-uat-test-reproduce.db`: 544 Order; 15 Client; 3 Sales; Admin, Warehouse, FINANCE, BOD mỗi role một tài khoản; 300 Supplier Cost; 40 Order có 3 Carton/2 Lot; 354 PURCHASED, 32 PENDING_PURCHASE, 157 SALES_DRAFT, 1 CANCELLED. Dữ liệu ePacket US Standard/Eco, vùng CA/NY/TX/HI/AK/APO trong fixture nền, balance, credit/debt/overdue lock, reserves/failure, claims/hold, inbound unknown/measured, tracking IN_TRANSIT/DELIVERED/ALERT, thùng OPEN/PAUSED/CLOSED.

Synthetic Base Rate chỉ dùng DB test, không phải bảng giá Owner duyệt. Route có adapter hoàn chỉnh trong fixture là ePacket US Standard/Eco DMD. UPS Saver/KILOSHIP, Yun Express/KILOSHIP và Chuyên tuyến/KILOSHIP có draft nhiều Lot để kiểm cấu trúc; **không coi đó là route được nghiệm thu pricing/purchase**. Không dựng giả EU/SGB hoặc Supplier mới chưa có cấu hình được duyệt.

Sau browser UAT có 574 Order, 407 ledger entries, 329 Supplier Cost. Không tính số lượng seed là số lượng thao tác browser.

## Thực tế đã thao tác bằng browser

| Luồng | Thao tác và bằng chứng | Kết quả |
|---|---|---|
| Client desktop | `uat.client.4` nhập 30 dòng TSV vào UI (29 đơn 0,2 kg và 1 đơn 12 kg), lưu Draft, xem chọn giá 7,48 USD/đơn | 29 đủ điều kiện, dòng 30 bị disable và có lý do quá 10 kg |
| Client mua hàng loạt | Chọn 29 Draft hợp lệ, bấm mua; đóng modal, filter `UI-UAT-` | 29 PENDING_PURCHASE; Draft lỗi giữ riêng; reserve tổng 216,92 USD |
| Admin spreadsheet | Route filter ePacket/Standard; copy 29 dòng TSV Tracking + Label rồi paste trực tiếp vào ô Tracking của `UI-UAT-001` | Paste đúng dòng đến `UI-UAT-029`; phát hiện lỗi UAT-01 bên dưới |
| Admin sau fix | Reload bản build mới; paste lại cùng 29 dòng và lưu khi queue vẫn chứa Client khóa | 29 tracking/label, 29 PURCHASED; query DB xác nhận đúng 29 ORDER_CHARGE tổng 216,92 USD; không charge trùng |
| Warehouse scan liên tục | `demo.warehouse`: mở thùng mới, scan 29 UI-TRACK từng lần qua form, kiểm trạng thái sau từng lần | 29 kiện vào cùng thùng Standard; không modal giữa các lần thành công. Chưa kiểm bằng máy scanner vật lý hoặc đo latency thực |
| Ngoại lệ kho | Scan lại UI-TRACK-001 và một tracking Eco vào thùng Standard | Chặn duplicate và ROUTE_MISMATCH, số kiện không tăng |
| Kho bulk | Dán thêm 71 tracking Standard seed qua “Nhập nhiều đơn cùng lúc” | 100 kiện; thông báo thêm 71; không có lỗi dòng |
| Close/Manifest | Chốt thùng 005, UI chuyển thùng 006; chọn lại thùng 005, xuất Manifest | CLOSED, 100 items; file `EPACKET-20261018-005.xlsx` có đúng 29 UI tracking + 71 seed tracking, 100 tracking duy nhất; kiểm parser, chưa mở Excel native/in label |
| Finance Excel | `uat.finance` upload workbook 29 dòng Supplier Cost bằng file chooser, bấm nhập | UI “Đã nhập 29 dòng chi phí”; DB có 29 dòng match tracking, tổng 104 USD |
| Reconciliation | UI-UAT-029 actual 20 USD, estimate 7,12 USD, REVIEW; chọn Lot 1, absorb loss với lý do | PASS, decision absorb_loss và thông báo lưu lịch sử. Coverage UNKNOWN vẫn hiển thị; không coi PASS là actual cost đầy đủ |
| Payables | Ghi invoice UAT-INV-100 104 USD, ghi payment nội bộ 25 USD | UI còn 79 USD và “Đã trả một phần”; query DB xác nhận invoice/payment đã lưu. Không có chuyển tiền thật |
| Client mobile | Search riêng UI-UAT-030, Sửa 12 kg thành 0,2 kg, lưu Draft, báo giá mới 7,48 USD, mua riêng đơn này | Reserve 7,48 USD, chưa có label/charge; 29 đơn trước vẫn chỉ charge một lần |
| Responsive | Warehouse và Finance Payables tại 390×844; Client search/edit/mua ở 390 px; Admin desktop 1280×900 | document width = viewport = 390, bảng scroll riêng; đã lưu ảnh. Không tương đương test thiết bị thật/Safari/Android |

Ảnh, audit JSON và workbook Manifest được giữ tại `../outputs/uat-2026-10-18/` của project mirror (ngoài Git). Workbook cost là fixture tạm, không phải chứng từ Supplier.

## Bug và mức độ

| ID | Mức | Phát hiện | Xử lý |
|---|---|---|---|
| UAT-01 | P1 | Lưu sheet gửi mọi row trong queue, kể cả Order trống không thao tác; Client khóa ở nhóm khác làm rollback 29 tracking hợp lệ. Export cũng persist cả queue | Đã sửa: save chỉ gửi Order có tracking; giữ đầy đủ Carton cùng Order; export chỉ persist Order đã chọn. Browser retest 29 đơn PASS; regression scope gồm 5 assertions |
| UAT-02 | P2 | `load()` xóa thông báo thành công ngay sau save/export, nhân viên khó biết đã xong | Đã sửa: refresh nội bộ giữ notice; đổi filter xóa notice cũ. Retest bản cuối ghi trong phần verification |
| UAT-03 | P2, còn mở | Reconciliation thiếu search/filter/status selection và chọn hàng loạt theo nhóm; hàng trăm Lot khó tìm, phải cuộn dài | Cần cải thiện UX trước vận hành số lượng lớn; chưa đổi API/report/pagination trong lượt này |
| UAT-04 | P2, còn mở | Supplier Cost ghi theo Lot không có tracking, list chỉ hiện ô tracking trống và thiếu Order/Lot context | Cần thêm cột Order/Lot và filter. Không phải bằng chứng mất mapping; DB đã match trực tiếp Lot |
| UAT-05 | P1 release gate, đã biết | Adapter/gate Base Rate cho UPS/Yun/custom chưa hoàn tất | Không tự sửa business policy hoặc dùng synthetic fixture để tuyên bố PASS; cần Owner và implementation riêng |

Không phát hiện P0 trong phạm vi đã chạy; không suy rộng thành không có P0 toàn hệ thống.

## Regression và giới hạn kiểm chứng

- Domain: 18 suites PASS, 1.000 assertions (995 hiện có + 5 scope mới). `npm test` tích hợp scope regression.
- HTTP: Order 32; acceptance 42; Finance 19; Operations 23; Excel import 20; validation 8; Manifest 16; cancellation 86. Tổng 246. Có một lần Operations ban đầu fail vì thiếu statement fixture; sau Finance tạo receivable thì PASS. Đây là phụ thuộc harness, không giấu lần fail và không tính retry vào tổng.
- Lint, TypeScript, production build, diff whitespace, DB integrity và foreign key checks: xem kết quả cuối bên dưới.
- Kiểm query dữ liệu UAT: 29 charge = 216,92 USD; 29 cost = 104 USD; 29 reserves CHARGED + 1 RESERVED 7,48 USD sau sửa Draft; thùng CLOSED có 100 items; integrity `ok`, FK violations = 0.
- HTTP automated tests kiểm multi-lot, đổi tracking, phân quyền, import rollback/replay, claims, cancellation/refund retry; không mô tả là thao tác browser. Credit/debt, ePacket Eco đầy đủ, hold/measurement, route segmentation đã qua domain tests/fixture; chưa chạy toàn bộ các nhánh này liên tục bằng UI trong lượt này.
- Browser chưa kiểm đầy đủ Sales/BOD, mọi filter combination, keyboard-only, scroll ngang spreadsheet trên mọi mobile, hàng nghìn đơn, concurrent nhiều nhân viên, mạng chậm/ngắt kết nối, tải lại giữa bulk, máy scan/in thực tế. BOD account được seed, không tính là BOD UAT.
- Chưa rehearsal migration/rollback trên bản sao DB vận hành. Không có kết nối carrier, mua label thật, gửi Manifest thật, void label thật, FX thật hoặc dữ liệu khách thật.

## Owner cần chốt / cung cấp

1. Base Rate được duyệt và Supplier/route thật (EU/SGB, UPS, Yun, custom), điều kiện hàng và surcharge; label mẫu thật để kiểm in.
2. Credit Term bắt đầu/kết thúc trong cửa sổ đối soát tuần, policy quá hạn và tình huống Debt.
3. Cancellation/void label theo từng Supplier, bằng chứng hoàn/không hoàn và mức phí giữ lại.
4. Mapping cost/coverage/FX/chứng từ, tiêu chí xác nhận đủ Mid-mile và GP thực; không suy từ PASS thành đủ cost.
5. Chấp nhận UX bulk hiện tại hay yêu cầu filter/search Finance, nội dung cột Order/Lot và thao tác của máy scanner; thử Owner UAT trước pilot.

**Kết luận:** đã chứng minh một lô Standard xuyên Client → Admin → Warehouse → Finance trên UI với dữ liệu giả lập ở quy mô queue hàng trăm đơn, sửa lỗi queue có thể chặn vận hành. Chưa đủ bằng chứng nghiệm thu toàn GĐ1 hoặc triển khai DB thật.

## Verification cuối trước commit

- Bản build cuối sau cả hai sửa UI: PASS compile + TypeScript + generate 37/37 static pages. Lint PASS, `npm run typecheck` PASS, `git diff --check` PASS.
- 18 domain suites / 1.000 assertions PASS. 8 HTTP suites / 246 assertions chạy lại toàn bộ trên DB mới `.smoke/http-uat-final-test.db` theo thứ tự Orders → acceptance → Finance → Operations → imports → validation → manifest → cancellation: tất cả PASS.
- UAT-02 retest trên build cuối: chọn riêng UI-UAT-030 bằng bàn phím desktop, export trả file `Purchase_ePacket_Standard_DMD_1-orders.xlsx`, thông báo **“Đã xuất file mua đơn.”** còn hiển thị sau refresh queue. Parser xác nhận đúng một UI-UAT-030, không có UI-UAT-001…029. Client bị khóa ở queue không chặn export này.
- Chọn checkbox cuối sheet ở viewport mobile 390 px bằng automation không đổi trạng thái; đổi desktop và dùng Space thành công. Chưa đủ bằng chứng phân biệt vùng bị che bởi sticky footer với giới hạn browser automation. Ghi là **mobile bulk sheet chưa đạt acceptance**, cần kiểm tra thao tác tay/scroll trên thiết bị thật; không tuyên bố mọi chức năng mobile PASS.
- Logs, ảnh và audit cuối được giữ trong thư mục evidence ngoài Git. DB, `.env`, dependencies và dữ liệu thử không được commit.
