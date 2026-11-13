# HISTORICAL ONLY

# DMD Order Platform — Service Architecture V1
**Trạng thái:** APPROVED requirements available; implementation NOT complete.
**Audit:** 2026-11-13, repository `lionet-technology/dmd-order-platform`, branch main, baseline `2302d06`.
**Nguồn:** yêu cầu Owner hiện tại và xác nhận tỷ giá 1 USD = 25.910 VNĐ; hội thoại 6ad35267-1ad8-83ec-a691-9d80c58281df (5 lượt cuối truy xuất được); bản đồng bộ read-only `sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md`.
Đã tìm thêm hai chat “Công thức tính Net Cost UPS” (6af5587f-90ac-83ec-856e-2562aa9b8da3) và “Thông tin phụ phí UPS” (6af4441f-5c24-83ec-9175-51b33810f336). Vẫn chưa có toàn bộ phần thiết kế Service Matrix trước đó trong dữ liệu hội thoại trả về. Không dùng code USD cũ hoặc tài liệu legacy để tự quyết định thông số V1.

## 1. Service Matrix V1 — phạm vi xác nhận được
| Service | Route / Supplier | Pricing V1 | Fulfillment / charge | Trạng thái audit |
|---|---|---|---|---|
| ePacket Standard / Eco | US DMD; EU theo route/supplier cấu hình, không suy EU từ US | VNĐ; Net→Base→Retail→Sales; oversize và non-continental | Express: reserve tại mua, charge tracking+label; carton/manifest theo route | Adapter hiện chỉ Standard/Eco DMD US, USD, 1 carton, tối đa 10kg; thiếu V1 |
| UPS | Supplier theo route; nhiều account với rate/zone/surcharge riêng | Tính đầy đủ Net từng account trước chọn tối ưu; rounding carton rồi Lot; global Fuel/VAT/Broker/Customs | Nhiều carton/Lot; tracking+label; giữ một Order/một địa chỉ | Hiện request chưa có giá → Admin giá USD tổng Order; chưa có UPS auto optimizer |
| YunExpress | Theo thị trường/route/supplier được cấp quyền | VNĐ và pricing được publish; không suy bảng ePacket | Express tracking+label; route/manifest đầy đủ | Không có auto adapter được xác minh cho V1; fail closed |
| Chuyên tuyến | Supplier bắt buộc trong Route; case-by-case | Cấu hình/manual theo rule được duyệt, VNĐ | Theo route Express; không tự triển khai Cargo | Hiện manual USD; cần V1/currency cutover |
| Add-on thu Client | Catalogue/phạm vi Client; Sales được phép thấy nội bộ Add-on có quyền | Revenue khóa sau ghi nhận; Cost có thể pending, Cost/Supplier/Note sửa được | Ghi nhận Revenue/Cost/GP và Client debit đúng một lần | Chưa có module Client Add-on tương ứng; Supplier BUY/SELL không thay thế |

Service Configuration phải giữ danh tính Service + Sub-Service + Supplier, lifecycle/Hold, cấp quyền Client và discount. Không tự kích hoạt giá mẫu, không tự thay Supplier trên Order lịch sử.
Cargo/ETD và usage services chưa có thông tin V1 đầy đủ; không suy thành phạm vi đã triển khai.

## 2. Pricing & Financial Rules — bắt buộc
1. Giai đoạn đầu chỉ VNĐ. Không đổi nhãn USD thành VNĐ hoặc cộng USD và VNĐ vào cùng số dư. Owner đã xác nhận chuyển tạm dữ liệu USD theo 25.910 VNĐ/USD; ePacket sẽ có bảng VNĐ chính thức sau. Chưa thực hiện migration. Cần rehearsal có manifest phân loại monetary columns, không chuyển weight/percent/quantity hay nhân hai lần; snapshot/Statement lịch sử cần giữ chứng cứ USD gốc và audit conversion.
2. Net→Base→Retail markup **tuần tự**: Base = Net × (1 + Net Cost Markup%); Retail = Base × (1 + Base Cost Markup%); Sales = Retail × (1 − discount%). Ví dụ Net 100.000, hai markup 10% và 20% → Base 110.000, Retail 132.000 trước discount. Quy tắc làm tròn tiền từng bước chưa có trong nguồn truy xuất.
3. Cả Net Cost Markup và Base Cost Markup phải Review & Publish. Pending không tham gia giá bán. Net hiện hành và selling-price version published độc lập. Thay net không được tự publish selling price; snapshot đã mua bất biến.
4. UPS global Fuel/VAT/Broker/Customs auto apply **sau Admin xác nhận**; không phải sau save hoặc upload. Account net/surcharge phải publish. Lưu version, actor, thời gian; invalidation quote cho đơn chưa mua. Không thay snapshot Order đã mua.
5. UPS tính đủ Net từng account theo đúng zone, cân, phụ phí trước chọn tối ưu; không chọn theo base rate đơn thuần. Rounding theo carton rồi Lot. Đã khôi phục công thức và bước cân tham khảo ở mục 7. Mapping shipment→Lot, tie-break, service/account/rate/zone thực tế và phụ phí ngoài công thức chưa có bản chốt đầy đủ.
6. ePacket oversize/non-cont phải giữ quy tắc đã chốt; không nhập lại mức USD hiện hành thành VND. Không double-count phụ phí đã nằm trong Supplier inclusive Net.
7. Fulfillment phải dùng Order/quote/snapshot được mua, reserve/charge đúng một lần; lỗi cấp tracking/label phải rollback tiền và dữ liệu liên quan. Giữ kiểm tra Hold, route, Client, Balance/Credit và overdue Debt của Purchase.
8. Add-on Revenue ghi một lần, khóa sau ghi nhận; không sửa/xóa giao dịch gốc. Không cần workflow Draft/Posted lưu lâu dài; xem lại/xác nhận trước ghi nhận.
9. Cost/Supplier/Note Add-on được chỉnh theo quyền, có history và kiểm tra stale version. Sửa Cost đổi Cost/GP, không đổi Client Balance. Cost pending không được coi là cost bằng 0 đã finalized. Kỳ đã khóa giữ nguyên số liệu kỳ cũ, chênh cost vào kỳ hiện tại.
10. Balance Adjustment có căn cứ được vượt credit limit/thiếu Balance, có actor/reason/reference/history; không tăng limit và không vượt qua Purchase gate. Adjustment **không sửa Revenue/GP Add-on**. Related Add-on ID nên có nếu đơn giản; hiển thị giới hạn này rõ ràng. Revenue Correction chuẩn hóa để sau.
11. Sales được truy cập Cost/Supplier của Add-on **trong phạm vi được phép**, không mở quyền Supplier Net/Cost dịch vụ vận chuyển. Client không nhận các trường nội bộ qua API, exports, history hoặc nội dung tự do.
12. Idempotency, global source uniqueness, transaction rollback và immutable snapshots là acceptance bắt buộc; không chỉ kiểm tra happy path.

## 3. Gap analysis — code as-is đã đọc
| Nhóm | Bằng chứng code | Giữ / thay / thêm |
|---|---|---|
| Service Configuration | `src/app/api/service-routes/route.ts`, `src/lib/route-lifecycle.ts`, `carton-policy.ts` | Giữ identity/lifecycle, cancellation/segmentation/route variables. Thiếu cấu hình V1 thống nhất và mapping các adapter mới |
| Pricing hiện hành | `src/lib/route-pricing.ts`: createPriceVersion yêu cầu base_rate độc lập; activatePricing cấm base_markup khác 0, chỉ USD | Xung đột trực tiếp với V1 tuần tự/VNĐ. Phải version hóa, không sửa lại snapshot lịch sử |
| Review/Publish | `route_price_versions`, configs, activations; upload/activate Root Owner | Có nền immutable/version/effective date; chưa có hai tầng markup review/publish và net-current/sell-published V1 |
| UPS | `manual-route-price.ts`, `route-pricing.ts`, docs Feature 03/04 | Chỉ manual Order USD. Cần account/rate/zone/config/global confirmation/optimizer và integration consent/purchase |
| ePacket | `epacket-pricing.ts` | Có tier/volumetric/oversize/non-cont USD; legacy formula retail từ net còn dùng snapshot cũ. Không coi là công thức V1 |
| Fulfillment | `credit.ts`, `order-operations.ts`, `order-shipments.ts`, manifest/purchase templates | Tái dùng reserve/charge/tracking/carton/Lot với regression; bổ sung snapshot/version/account và gates V1 |
| Add-on | `supplier-account.ts`, `supplier-account-workspace.tsx` | Chỉ Supplier BUY/SELL, Finance/BOD, USD; không có Client Add-on Cost revision / Sales scope |
| Balance Adjustment | `finance.ts:addLedgerEntry` | Ghi ledger qua moneyCommand, không gọi purchase gate tại đây; cần test HTTP/quyền và related Add-on. Không suy rằng toàn luồng đã được nghiệm thu |
| Privacy/RBAC | `auth.ts`, `financial-privacy.ts`, `private-content.ts` | BOD/Finance riêng; Sales/Client mask vận chuyển. Không tắt wrapper chung để mở Add-on |
| Currency/data | `credit.ts:cents`, `finance.ts:money`, UI/docs USD, ledger không có currency trên từng entry trong schema đã đọc | Thiếu migration/cutover có căn cứ. Không nhân tỷ giá/đổi unit hoặc mở VND posting vào ledger USD |

Audit này là source review, không phải xác nhận production, full browser UAT hay full data migration.

## 4. Acceptance matrix phải chạy khi triển khai
| Nhóm | Ca bắt buộc |
|---|---|
| Configuration | identity/lifecycle/Hold; Client enabled scope; route có lịch sử không rename; legacy data nguyên vẹn |
| Publish | save/review không đổi giá; publish cả hai markup; pending net khác published selling; effective date; stale publish/concurrent writer; retry không duplicate |
| UPS | hai account đảo thứ hạng sau surcharge; zone thiếu/không hợp lệ; từng carton khác cân; carton rounding trước tổng Lot; Fuel/VAT/Broker/Customs confirmation; account draft không áp dụng; locked snapshot không đổi |
| ePacket | đúng tại/bên trên các ngưỡng oversize; non-cont positive/negative; stack và supplier-inclusive net không trùng; reject unsupported route |
| Fulfillment | reserve→label charge; duplicate label/retry; multi-Lot/carton; insufficient credit; rollback khi cấp label lỗi; stale Client quote; không reprice đã mua |
| Add-on | create/retry/cross-key duplicate; reject revenue edit; pending→cost; stale/concurrent Cost edits; Supplier/Note audit; không đổi Balance khi sửa cost; closed-period delta; related Adjustment không đổi Revenue/GP |
| Financial | debit Adjustment vượt limit vẫn ghi; Purchase mới bị chặn; giữ reason/actor/history; ledger/Balance/Statement đối chiếu; rollback và independent writer |
| Roles | Admin quyền vận hành theo policy; BOD/Finance xem finance theo quyền hiện hành; Sales đúng Client/Add-on và không Cost/Supplier vận chuyển; Client không có trường nội bộ; anonymous/khác Client bị chặn; kiểm API/export/history/UI |

## 5. Thứ tự triển khai / data safety
1. Service Configuration: schema additive, legacy route/snapshot giữ nguyên, adapter gates chưa đủ dữ liệu fail closed.
2. Pricing Markup & Review/Publish: immutable reviewed versions, expected-version guard và quote consent; test net/sell độc lập.
3. UPS Rate/Zone/Account optimization & globals: mapping/surcharge source rõ ràng; global confirm, account publish; rounding oracle trước integration.
4. Fulfillment: nối vào engine hiện có, không tạo ledger/financial core song song hoặc bypass credit.
5. Client Add-on/ledger: revenue immutable, scoped internal projection và cost history/current-period adjustments.
6. Migration rehearsal trên bản sao có backup: so sánh số hàng, FK/integrity, từng số dư/ledger/reserve/statement/snapshot trước-sau; retry migration; rollback bằng restore bản sao; không reset database đang chạy.
7. Chạy domain/API và browser roles Admin/BOD/Sales/Client, lint/typecheck/build. Chỉ commit/push sau khi phần triển khai thành công và có bằng chứng. Không Jenkins.

## 6. Phụ thuộc cần Owner bổ sung trước phần triển khai phụ thuộc
- USD lịch sử: Owner đã chốt chuyển tạm theo 25.910 VNĐ/USD. Chưa áp dụng; cần kiểm kê Balance, Debt, Reserve, Statement, Supplier và snapshot/giá lịch sử, bảo toàn chứng cứ gốc, chống chạy lặp. Không tự thay bảng ePacket thành bảng giá chính thức.
- Phần Service Matrix/ePacket/Fulfillment trong hội thoại trước 5 lượt cuối; UPS đã khôi phục được rounding/formula tham khảo nhưng chưa có đầy đủ cấu hình service/rate/zone/account thực tế hoặc phê duyệt các đề xuất phụ phí.
- Không giả định Admin vận hành được thấy Net vì được xác nhận globals; quyền xem Cost/GP-Net vẫn theo policy hiện hành cho tới khi có chỉ định mới.

## 7. Nội dung khôi phục từ các chat liên quan
### Công thức UPS
Nguồn: [Công thức tính Net Cost UPS](chatgpt-conversation://6af5587f-90ac-83ec-856e-2562aa9b8da3), user turn `7cbdd8fd-84de-4e09-b3d0-b13c83f689b6` và assistant response `2176fd55-0101-42a1-9b60-881c8992e703`.
Công thức Owner đưa: NetCost = (1+Fuel)×(1+VAT)×[(1−ND)×T + ShipmentSurcharge×(1−SD) + WeightSurcharge×(1−WD)×W] + Broker×T×(1−ND) + CustomsPerKg×W.
T = NetRate nếu dòng giá VND/shipment; T = NetRate×W nếu dòng giá VND/kg. Không nhân tổng NetCost với W; không discount lần hai nếu nguồn đã là discounted net.
Các tỷ lệ trong công thức là thập phân. Không hardcode ngưỡng VND/kg theo cân; đọc unit từ rate row.

### Rounding được mô tả trong chat
Nguồn cùng chat, turn `8a7eb753-90a0-4286-8b30-0c1e8eaf0efb`, response `41f3c594-8a67-4b70-8c22-e956a48d868c`.
- Express/Saver: actual và dimensional mỗi carton round UP 0,5kg, lấy max; tổng carton ≤20kg round UP 0,5kg, >20kg round UP 1kg.
- Expedited: actual/dimensional từng carton và tổng đều round UP 1kg.
- Divisor 5.000; giữ carton billable và shipment billable riêng. Không lấy max của hai tổng actual/dimensional.
Đây là dữ liệu hội thoại khôi phục, chưa là bằng chứng mapping đã được Owner chốt cho mỗi Lot/account của DMD. Không có rate card để nghiệm thu end-to-end.

### Phụ phí UPS — chưa coi đề xuất là phê duyệt
Nguồn: [Thông tin phụ phí UPS](chatgpt-conversation://6af4441f-5c24-83ec-9175-51b33810f336).
Chat nói rõ các ngưỡng AHC/LPS/OMS được bàn là **UPS nội địa Mỹ**, không áp nguyên xi quốc tế. Đề xuất LPS loại trừ AHC và OMS chặn tự mua chưa có lượt Owner chốt trong phần đọc được. Không nhập các mức tiền USD công bố vào UPS quốc tế DMD hoặc tự activate.

## 8. Kết quả thực tế phiên audit
- Đã viết tài liệu này và thêm index Feature README; chưa thay đổi application behavior, chưa chạy currency migration.
- Có sẵn `next-env.d.ts` modified và `Codex/` untracked trước khi làm; giữ nguyên.
- `npm run typecheck`: PASS sau tăng thời gian chờ; lần đầu timeout 60s.
- `npm test` với Node 22 Intel: FAIL trước suite RBAC do native SQLite ARM không tương thích. Không phải functional assertion failure.
- Node 20 ARM với temporary TypeScript transpile loader ngoài repository: RBAC PASS 65 assertions; Operations PASS 65; Purchase Engine PASS 46; ePacket PASS 170; legacy migration regression PASS 14/14. Native SQLite in-memory PASS. Không sửa node_modules hay DB vận hành. Full npm test với loader timeout 60s khi bắt đầu Purchase; các suite nêu trên được chạy riêng thành công, không báo toàn bộ test suite PASS.
- Chưa migration, chưa browser UAT Admin/BOD/Sales/Client, chưa commit/push, không Jenkins.
