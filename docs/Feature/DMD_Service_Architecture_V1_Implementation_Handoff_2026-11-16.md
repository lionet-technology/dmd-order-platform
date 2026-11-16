# DMD Order Platform — Service Architecture V1 / Implementation Handoff

**Ngày:** 16/11/2026 · **Phạm vi:** Chuyển phát nhanh GĐ1 và liên kết Order–Finance–Supplier–Warehouse.

## 0. Cách sử dụng và nguồn quyết định

- APPROVED: nghiệp vụ đã chốt, không đồng nghĩa đã có code. OPEN: không tự đặt mặc định. DEFERRED: ngoài phạm vi hiện tại. CHECK: phải kiểm tra repository/test thực tế.
- Ưu tiên quyết định cuối trong hội thoại đến 16/11/2026; đối chiếu `DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md` và `docs/Feature/` trong repo `lionet-technology/dmd-order-platform`. Khi mâu thuẫn, dùng quyết định mới trong tài liệu này; phần không thay đổi giữ baseline đã duyệt.
- Nguồn dữ liệu giá: `Bảng Net Cost Dịch vụ(1)(1).xlsx`; UPS zone: `UPS Zone.pdf`. Work đã báo tìm và xử lý Excel chuẩn; không cần suy đoán giá từ ảnh. Kiểm tra provenance và validation của bản import. Không đưa bảng giá supplier vào tài liệu công khai.
- Đồng bộ `SERVICE-V1-APPROVED-DECISIONS.md`, `DMD_Order_Platform_Service_Architecture_V1_Specification.md`, Feature 23, các Feature Order/Finance/Supplier/RBAC liên quan, Feature index và README. Archive rule đã thay thế, không giữ hai rule hiện hành mâu thuẫn. Mỗi tính năng ghi trạng thái code, commit và test riêng.
- Theo báo cáo Work gần nhất được cung cấp: `0ac0963` cancellation thường + supplier queue, 52 suites và 28 HTTP checks PASS; `7491a72` cập nhật quyết định (chưa code). Trước đó backend pricing VND staged. CHECK HEAD thực tế: không coi Edit, Cancel & Duplicate, Purchase/ledger VND hoặc V1 hoàn chỉnh chỉ vì tài liệu đã duyệt.

## 1. Service Matrix — APPROVED

| Service/Sub-Service | Supplier | Pricing | Carton/Lot | Fulfillment |
|---|---|---|---|---|
| ePacket Standard | DMD | USD input → VND, Net/Base/Retail | 1 carton/order | USPS label tại VN, link PDF, Manifest |
| ePacket Eco | DMD | USD input → VND, Net/Base/Retail | 1 carton/order | nhãn nội bộ, relabel US, Manifest |
| ePacket EU | SGBay | VND theo thị trường và tier cân | 1 carton/order | UK/EU, Canada, Australia; Google Sheet, PDF từ Zalo, không Manifest |
| Yun Express | SGBay | VND theo vùng và tier cân | 1 carton/order | Google Sheet, PDF từ Zalo, không Manifest |
| UPS Saver/Express/Expedited | SBay | tối ưu account SDS/VTT/JD sau công thức | nhiều carton; admin chia Lot | Excel khai báo hàng, template mua cũng là Manifest, PDF từ Zalo |
| Chuyên tuyến | Supplier Basic | Manual Quote, actual/net được báo trước | nhiều carton; admin chia Lot | linh hoạt theo case |

- Client chỉ thấy Service/Sub-Service đã được cấp, không thấy supplier, route nội bộ, UPS account. ePacket có thể cấp Standard, Eco hoặc cả hai; tự định tuyến ngoài US sang ePacket EU nếu thị trường được hỗ trợ (không fallback sai sang US). Không tự chọn Yun thay ePacket EU. Thiên Long ngưng sử dụng.
- 1 Order = 1 service/sub-service + 1 địa chỉ. Các Lot cùng supplier và sub-service; carton là dữ liệu kiện, Lot là nhóm mua đơn supplier, một Lot có một chi phí tính cước. Không yêu cầu admin xác nhận tracking đại diện riêng. Selling Price cấp Order; Net Cost cấp Lot. UPS/chuyên tuyến không giới hạn số carton cố định nội bộ; vẫn tuân thủ điều kiện dịch vụ/supplier. Chia Lot trước khi cấp tracking/label; tính lại cost sau chia.
- Supplier Basic dùng chung registry/ledger, đăng ký tên đơn giản, có balance/payment/adjustment; không yêu cầu tạo route phức tạp cho tuyến ít dùng. Supplier chính có profile và cấu hình route. Không tạo supplier bắt buộc cho Add-on tự do.
- Chuyên tuyến có thể chuyển Draft chưa giá sang Purchasing/Awaiting Quote; admin nhập cost/giá bán sau và xử lý consent/override. Không tạo charge/reserve giả bằng 0.
- Template địa chỉ: người nhận | địa chỉ 1 | địa chỉ 2 | thành phố | bang | ZIP | quốc gia. Nhập tay tối đa 20 order/lượt, Excel dùng cho bulk; không phát triển spreadsheet phức tạp.

## 2. Configuration & Pricing — APPROVED

- VND là đơn vị wallet, order, ledger, báo cáo GĐ1; giữ số lẻ theo rule đã duyệt, không tự thêm rounding tiền. Dữ liệu cũ là demo, được reset trên môi trường test; không cần migration bảo tồn demo bằng mọi giá. Không động dữ liệu thật.
- Markup tuần tự: `Base = Net × (1 + mNB)`; `Retail = Base × (1 + mBR)`; `Selling = Retail × (1 − Client discount)` theo cấu hình offer. ePacket mặc định 6%/16%; Yun, UPS, Chuyên tuyến 12%/32% (không nhân Retail trực tiếp từ Net). Ví dụ Net 100.000, 6%/16% → Base 106.000, Retail 122.960 VND.
- Net Cost Markup: thay Net có hiệu lực cho Estimated Net, đề xuất Base/Retail mới; giữ published selling hiện hành đến khi admin publish. Base Cost Markup: thay Net không tự thay Base/Retail; thay Base đề xuất Retail mới. Cả hai Review & Publish, không tạo thêm mode ‘Fixed Published’. Net version tách selling version. Giữ giá published V1 nếu bỏ qua proposal; cập nhật proposal theo thay đổi mới; có thể publish sau. Không xóa lịch sử.
- Global Auto Apply ngoại lệ cho cả hai mode: ePacket FX, UPS Fuel/VAT/Broker/Customs khi SAVE/CONFIRM áp dụng đồng loạt Net/Base/Retail, không cần review/publish selling riêng. Pending thay đổi account không được lén kích hoạt trong lần update global. Giá đã snapshot của đơn không tự sửa. Admin xem bảng giá đang hiệu lực và proposal ở Service/Route UI.
- Net hiện hành > Base: cảnh báo ưu tiên dashboard Admin/BOD. Selling ≤ Base: alert Sales và báo cáo BOD (kể cả bằng); lưu signed variance, GP Base dùng tính hoa hồng không âm từng Order. Cảnh báo không tự biến thành rule cấm offer.
- Version bất biến, audit actor/time/source, publish atomic, cạnh tranh đồng thời/retry an toàn. Draft tự trả giá hiện hành; snapshot khi Purchase xác nhận và khi cấp label theo logic ở §5; Actual Net không tự đổi Selling Price.

## 3. UPS — APPROVED

- Raw Net UPS đầu vào VND trong Excel chưa qua công thức. `o` = không có giá (không phải 0); ô biến cấu hình trống = 0. Account SDS/VTT/JD; tối ưu giá sau full formula từng account × sub-service × zone × cân; tie-break SDS → VTT → JD, hướng cấu hình priority đơn giản qua UI, kiểm tra triển khai. Không dùng giá thấp nhất raw.
- Zone theo quốc gia destination: tên đầy đủ/tên viết tắt, bỏ ký tự ghi chú nguồn; không xác định Origin. Tránh fuzzy mapping mơ hồ; không có rate/zone hoặc vượt cân → lỗi preview/pending để admin đổi service hoặc huỷ; không tự điền giá 0 hay bắt sửa bảng giá.
- Rate card Min kg/Max kg/Rate type FIXED hoặc PER_KG, cận dưới mở, trên đóng `(min,max]`. VD `(20,44]`: cân sau rounding >20 và ≤44. Hạng FIXED đến 20 kg, trên 20 dùng PER_KG theo dải Excel. Không suy rộng vượt max nguồn. Import validate overlap/duplicate/invalid type; dữ liệu trùng không tự chọn ngẫu nhiên.
- Volumetric divisor 5000 (cm³/kg). Mỗi carton: round actual và dimensional lên 0,5 kg Express/Saver hoặc 1 kg Expedited; lấy max. Tổng carton billable thành cân Lot; ≤20 kg round lên 0,5 kg Express/Saver hoặc 1 kg Expedited; >20 kg round lên 1 kg mọi sub-service. Ngưỡng xét trên tổng Lot, không trên từng carton. VD Saver 2 carton billable 10,5 + 10 = 20,5 → 21 kg, dùng rate PER_KG. Nếu 20 kg đúng thì FIXED.

```text
W = billable weight Lot (kg, sau rounding)
N = Raw Net (FIXED) hoặc Raw Net per kg × W (PER_KG)
D = N × (1 − NetDiscount)
NetCost = (1 + Fuel) × (1 + VAT) × [
    D + ShipmentSurcharge × (1 − ShipmentDiscount)
      + WeightSurcharge × (1 − WeightDiscount) × W
] + USBroker × D + CustomsPerKg × W
```

- Fuel, VAT, US Broker là tỷ lệ (UI %, máy tính decimal); CustomsPerKg VND/kg; ShipmentSurcharge VND/Lot, WeightSurcharge VND/kg. Các discount là tỷ lệ. US Broker 3% trên raw Net sau NetDiscount, không trên tổng Net Cost. VAT hiện 8%, Customs 10.000 VND/kg; Fuel cập nhật đầu thứ 2 hàng tuần. Giá trị hiệu lực lấy từ nguồn đã xác nhận/version, không suy ra Fuel tùy ý.
- Shipment surcharge tính một lần mỗi Lot, không nhân cả công thức với W. Surcharge/discount có thể khác theo account × zone; thay raw net/các biến account review/publish. Global Fuel/VAT/Broker/Customs áp dụng chung account/zone, auto cập nhật đồng bộ như §2.
- Tính lại account tối ưu lúc xác nhận Purchase; sau thay Lot tính lại trước label; snapshot account/rate/variables/zone khi chốt mua. Template mua ghi account cho SBay. Không đổi account lịch sử khi rate đổi.
- UPS oversize/remote/residential và import duty ghi bổ sung khi Supplier gửi số liệu, chưa tự xây engine. Nghiệp vụ gửi tracking cần VAT invoice cho SBay cuối tháng (27–29) lưu ý vận hành; chưa tự đặt automation.

## 4. ePacket & Yun — APPROVED / OPEN

- USD raw rate ePacket Standard/Eco, global FX USD→VND update tự áp dụng cả Net/Base/Retail; không cần Review/Publish riêng. ePacket EU/Yun dùng VND. Không nhầm bảng chú thích khu vực Yun với ePacket EU. Match tier theo mức cân tiếp theo hoặc per-kg theo rate card; giới hạn max khác với ngưỡng per-kg.
- Standard/Eco oversize dựa cạnh dài nhất trong ba kích thước: >55 cm +5 USD; >75 cm +10,5 USD, không cộng dồn; đúng 55 không phí, đúng 75 thuộc bậc 5. Non-cont +15 USD/order, một lần; AK, HI, PR, GU, VI, AS, MP, AA, AE, AP, nhận diện mã và tên đầy đủ/biến thể quân sự trong cột State sau chuẩn hóa. Không cần ZIP lookup hoặc rule carrier phức tạp. Không mua được label thì admin xử lý/huỷ.
- Toàn bộ phí ghi VND. CHECK mức VND chính xác từ workbook/config được duyệt (không tự suy ra mức tỷ giá hay số tiền nếu nguồn chưa xác nhận). OPEN: xác nhận phí VND là cố định hay bám FX riêng khi chưa có nguồn chính thức. ePacket EU/Yun không có surcharge tự động theo thông tin owner; service cap dùng bảng nguồn.
- ePacket DMD: dùng Net table để estimate phase đầu. Chi phí thực tế tương lai = USPS label + mid-mile (handling, customs, broker) phân bổ billable weight. OPEN: component nào đã gồm trong bảng Net, tránh đếm trùng; không làm mid-mile allocation ở V1.

## 5. Order & Purchase — APPROVED

- Draft auto quote luôn dùng giá hiện hành. Chỉ yêu cầu consent nếu Selling Price thay giữa lúc client bấm Purchase và khi xử lý Purchase, hoặc giá đã thay đổi khi đang Purchasing chưa có tracking/label. Không bắt xác nhận lại chỉ vì Estimated Net/account thay.
- Đơn từng bấm Purchase không quay lại Draft bình thường; có status riêng Price Confirmation Required / Awaiting Quote / Awaiting Funds nằm nhóm Purchasing. Client bấm Purchase xác nhận giá mới; Admin/Sales được override consent cho client mình có quyền xử lý, audit actor/giá/lý do; không bypass eligibility hoặc tiền. Nếu bất đồng, xử lý nội bộ ngoài workflow.
- Sức mua = Balance + Credit Limit − Active Reserve. Kiểm tra toàn bộ điều kiện mua (khóa account, credit/debt overdue, dữ liệu, giá, service, consent). Chỉ đủ điều kiện mới reserve, mua supplier, cấp tracking/label. Không đủ tiền → Awaiting Funds, không huỷ, không rollback nghiệp vụ, không charge. Thiếu giá → Awaiting Quote chỉ với service Manual Quote; các service tự động thiếu giá là lỗi admin xử lý.
- Trigger sau nạp tiền hoặc thay đổi khả năng mua: kiểm tra lại giá hiệu lực/consent, toàn bộ eligibility; FIFO theo thời điểm client xác nhận Purchase, từng Order reserve nguyên tử, không overspend nhóm. Có thể huỷ khi còn chờ. Tự tiếp tục Purchase nội bộ khi đủ điều kiện, không đồng nghĩa tự gọi carrier/supplier API. Retry không tạo reserve/charge hai lần; concurrency lock client và order; lỗi kỹ thuật rollback.
- Edit khi chưa có bất kỳ Tracking hoặc Label: Edit Order riêng cho service/dữ liệu vận chuyển, tự tính quote nếu auto; Edit Selling Price riêng cho offer thủ công (không bị price engine ghi đè), Add Tracking/Label riêng. Admin được edit Draft/Purchasing. Khi chờ xác nhận giá giữ reserve cũ, chặn cấp tracking/label; khi xác nhận kiểm tra và thay reserve nguyên tử, thiếu sức mua thì Awaiting Funds. Không giữ hai reserve toàn phần.
- Khi đã có tracking/label dù một phần: cấm Edit Order (server-side), UI gợi ý Huỷ & Duplicate; Edit Selling Price vẫn là Financial Correction riêng, không đặt trên detail view, không mở lại Purchase/Fulfillment, ghi delta Ledger/History. Đơn giá riêng không bị engine ghi đè tự động. OPEN nếu cần đổi service sau một manual offer: hành vi edit service vs giữ offer cần được thể hiện rõ, không âm thầm thay offer.
- Charge cước đúng một lần khi đủ tracking + label theo yêu cầu toàn Order; release reserve cùng transaction. Không charge lại dựa trên re-upload. Route/label upload preview, lỗi từng đơn giữ ở hàng đợi xử lý lại.

## 6. Cancellation / Cancel & Duplicate — APPROVED

- Chính sách hoàn theo service/sub-service/route đã cấu hình, không hardcode 90% toàn hệ thống. Baseline 16/10: ePacket US chưa label/tracking 100%, đã cấp trước vận chuyển 90%; ePacket EU/Yun/UPS đã có label trước ETD có thể 100% tùy supplier (CHECK policy thực trước kích hoạt). Không huỷ khi đã vận chuyển; Cargo sau có policy riêng. Admin được chọn hỗ trợ hoàn 100% thay mức mặc định theo phạm vi đã chốt; Client/Sales dùng policy thường. Quyền override hoàn tiền không phải quyền huỷ đơn đã vận chuyển.
- Cơ sở tính hoàn = tổng khoản Order hiện hành đã thu, gồm selling price sau correction + phụ phí + thuế nếu có. Chưa charge → release reserve, không phát sinh refund tiền ảo. Với đơn charge 200.000 rồi correction +20.000 và phụ phí 10.000, policy 90% → 207.000 VND. Kiểm tra các refund trước để không hoàn vượt tiền thực tế phải hoàn; claim vận chuyển là luồng riêng, không tự tái dùng cancellation policy.
- Huỷ & Duplicate chỉ Admin để hỗ trợ mua đơn (BOD toàn quyền hệ thống, CHECK cách áp dụng quyền thừa kế theo RBAC). Huỷ và refund đơn gốc theo policy, tạo order mới ID riêng + link nguồn; chỉ copy dữ liệu vận đơn thích hợp, không copy label/tracking/charge/reserve/cost snapshot. Đơn mới nằm Purchasing chờ mua, không về Draft. Nếu chưa giá hoặc thiếu sức mua, đơn gốc vẫn huỷ/hoàn hợp lệ, đơn mới chờ điều kiện; lỗi ghi DB thật thì rollback atomic, không tạo nửa giao dịch. Retry cùng tác vụ không sinh duplicate mới.
- Đơn huỷ phải xuất hiện trong Supplier account/filter/queue riêng để follow-up huỷ label/cost; giữ tracking cũ, thời điểm/lý do, link thay thế. Huỷ nội bộ không đồng nghĩa carrier đã void. Supplier refund/cost reversal độc lập với refund khách.

## 7. Fulfillment / Warehouse / Emergency Hold — APPROVED

- Fulfillment là xử lý Order và bàn giao, không tạo service kho độc lập ở V1. Admin mua thủ công theo supplier template, upload PDF hoặc link PDF (SGBay/SBay PDF qua Zalo); mỗi carton có tracking/label. Label kiểm tra nội dung trước khi onboard supplier, không lộ thông tin nội bộ qua API/export/metadata.
- Nhận hàng/scan, cân đo thủ công tùy chọn, declared và measured riêng; phân loại full route, đóng bao/thùng, close, manifest khi service cần và outbound. Không yêu cầu một manifest bổ sung cho SGBay/UPS nếu template mua đã đủ. Chặn route sai, chống scan/cost lặp. Phụ phí trội cân theo rule hiện có, check tránh charge lặp khi đo lại. Tracking state và Case state độc lập.
- Emergency Hold tối giản: thay route/supplier, tracking/label, net cost khi cần; đổi route đơn thuần không bắt đổi tracking/label. Upload lỗi giữ order trong alert Emergency Hold chưa xử lý, không ghi đè nửa bộ dữ liệu. Không dùng Hold để sửa trái phép order đã mua.

## 8. Finance — APPROVED

### 8.1 Tách Purchase và Financial Posting

- Purchase là hành vi mua dịch vụ mới, phải kiểm tra hạn mức. Financial Posting là ghi nhận nghĩa vụ thật: Add-on, phụ phí/thuế, correction, balance adjustment; cho phép Balance âm vượt Credit Limit, alert/rà soát nhưng không chặn posting. Không tự chuyển sang Debt; Debt do Admin chủ động tạo để hỗ trợ dòng tiền. Active reserve không bị xóa ngầm bởi posting. Kiểm tra hậu quả với đơn Awaiting Funds.
- Ledger append-only: actor, thời điểm, reason/reference, idempotency, delta; không sửa transaction cũ. Statement tự động capture kỳ, đã khóa thì không sửa ngược; refund/correction hiện tại reference Order/Statement cũ, ledger/statement hiện hành ghi ngày thực hiện. Balance real-time. Phân biệt performance theo kỳ order và dòng tiền theo thời điểm xử lý.
- Debt đã có baseline riêng (Admin điều chỉnh kỳ hạn/lãi/gốc, không lãi chồng lãi), giữ cơ chế repayment hiện có; không lẫn payment thật với tái cơ cấu. CHECK rule overdue và khóa kỳ hiện hành, không thay đổi tùy tiện.

### 8.2 Add-on / adjustments / corrections

| Nghiệp vụ | Cách ghi |
|---|---|
| Chuyên tuyến | Manual Quote trên Order |
| Order Surcharge | Phí bổ sung và import duty, upload Excel match Order/tracking |
| Balance Adjustment | Thu/chi âm dương ngoài doanh thu dịch vụ, reference Order ID/Add-on ID hoặc bỏ trống |
| Add-on Service | Khoản doanh thu dịch vụ bổ sung, cùng khu vực Balance Adjustment, có tên bắt buộc, note tùy chọn, cost và supplier free text |

- Add-on revenue >=0 (cho phép 0 hoặc thấp hơn cost); âm dùng adjustment, cost chưa có đánh dấu pending không giả 0. Không bắt tạo Supplier Basic cho supplier free text. Sales/Admin/BOD có thể ghi Add-on; Sales được thấy/sửa cost và supplier riêng Add-on của client mình (ngoại lệ hẹp), Client tuyệt đối không thấy.
- Cho sửa Cost/Supplier/Note theo history; việc thay cost không tự thay client balance. Quyết định mới thay rule khóa doanh thu tuyệt đối: sửa doanh thu Add-on và giá bán Order bằng Financial Correction delta, ghi history ở entity và Ledger; không overwrite giao dịch gốc. Revenue hiện hành không âm với Add-on; adjustment không bị nhầm là doanh thu/GP. Cho phép thu bổ sung vượt hạn mức. Nút sửa Selling tách khỏi Edit Order và Upload Label. Không đòi client consent lại sau khi charge. Không dùng correction làm claim refund/cancellation giả.

### 8.3 Client claims/refund

- Claim sự cố sau vận chuyển dựa chứng từ giá trị hàng và tổng doanh thu (gồm phụ phí), admin duyệt số tiền, không tự đặt công thức bồi thường. Gom claim nhiều order, optional note mỗi order nếu cần, không engine phân bổ. Theo dõi refund approved vs executed tổng trên từng client; phương thức bank và balance, nhiều đợt. Chặn vượt tổng duyệt, không tự clamp, không refund nếu chưa duyệt. Negative approved/recovery xử lý qua Refund Adjustment tường minh Admin/Finance chọn bank hoặc balance, không tự thu ngân hàng. Tách quyết định và thực chi; bank refund không giả tăng wallet. Statement cũ không bị viết lại.

### 8.4 Supplier finance

- Supplier balance = DMD phải trả; estimated tham khảo, chỉ actual đã đối soát/chốt mới tạo payable. Supplier có tổng quan và từng profile; Supplier Add-on BUY/SELL, balance adjustment/payment/kỳ hạn. Không chặn nghiệp vụ quá phức tạp. Supplier Basic cùng ledger tối giản.
- Import template cấu hình mapping Excel theo supplier/service; tracking match Lot. Actual lệch estimate → review, làm việc supplier rồi chốt actual; admin có thể thu client surcharge hoặc DMD chịu chênh; không tự chuyển cost nhà cung cấp vào client charge. Actual duplicate tracking trong file hoặc đã có → tự pending, giữ old cost; admin/finance chọn giữ cũ, nhận mới hoặc chờ xác nhận. Không cộng dồn trong màn duplicate. Phụ phí bổ sung template `tracking | cost bổ sung | lý do`, duplicate payload cảnh báo yêu cầu xác nhận hợp lệ/skip, idempotency retry không cộng hai lần. Khóa kỳ Supplier giữ statement cũ; adjustment tham chiếu kỳ gốc vào kỳ hiện tại.
- Supplier claim nội bộ: theo dõi quyết định tổng refund, Refund Receivable riêng sau duyệt chờ thu; chuyển sang Balance khi credit thực hoặc ghi nhận bank khi tiền thực nhận; theo dõi nhiều đợt, không credit hai lần. Supplier claim không tự refund client. CHECK rule kế toán chốt hiện hành để không ghi supplier payable trước reconciliation.

## 9. Reporting & roles — APPROVED

- Sales attribution theo Client đã gắn Sales từ khi tạo account; snapshot attribution vào Order lúc mua, không sửa lịch sử khi đổi Sales. BOD báo cáo tháng, chọn tháng cũ và trend theo tháng; breakdown Sales, Client, Service/Supplier; cash flow theo posting/payment, performance theo order period.
- Doanh số cước không gồm phụ phí/thuế NK. GP Base = Selling cước − Base, signed variance để theo dõi; GP Base cho commission max(0, signed) từng Order, không bù âm vào đơn khác. GP Net dùng actual nếu chốt, estimate riêng minh bạch. Không auto commission rate/payout V1. Báo cáo Sales theo tháng có doanh số, GP Base, Refund, GP Base − Refund. Nhóm non-refund và nhóm refund riêng: cancellation (không commission), shipping issue gồm bất khả kháng, reconciliation error; admin tự xử lý tổng theo nhóm, chưa cần xét từng order hay tự phân bổ refund. Refund là tiền hoàn trên tổng phải thu, không ép tách doanh số/phụ phí/thuế; pending claim chưa duyệt không coi refund đã phát sinh.
- Internal Expense BOD/Finance: nhóm lương/hoa hồng Sales nhập tay, mặt bằng, văn phòng, dự án; nhiều installment với due date và số tiền, total/paid/outstanding; khoản nhất thời category/note; chưa nhiều cấp phê duyệt hay tự phân bổ kế toán. BOD tạo trực tiếp.

| Role | Quyền chính |
|---|---|
| BOD | Toàn quyền, báo cáo doanh nghiệp |
| Admin | Toàn quyền vận hành/service/supplier/net/order/finance; không xem báo cáo doanh nghiệp BOD-only |
| Finance | Tài chính + view order/service/add-on cần thiết, không thao tác cấu hình dịch vụ |
| Sales | Client được gán, offer/discount trong phạm vi; Base để tính GP; không sửa Net/Base, không thấy supplier hoặc net thông thường, ngoại lệ Add-on riêng |
| Client | Chỉ account mình và selling price/charge, không Base/Net/Supplier/account UPS |

- RBAC phải enforce server-side object scope, API, export, template, history, alert/error, bulk preview; không chỉ CSS. Supplier login riêng chưa quyết định chi tiết quyền external, không mở mặc định.

## 10. DEFERRED / OPEN

- GĐ2: wallet USD & VND, Label platform integration (USPS Domestic/GDE/UPS Domestic), US/CN warehouse dịch vụ chuẩn hóa, Cargo air/sea + mid-mile allocation, deal pricing khách theo volume và freight, commission automation, supplier add-on catalogue, VAT automation. Liên kết một Client–Supplier cùng pháp nhân, sau service xây màn riêng và offset auditable; không tự netting hai ledger khi chưa làm tính năng.
- OPEN tại điểm cần: bảng giá thật/zone không đầy đủ; service cap/tier/markup initial do bảng cấu hình xác nhận; ePacket fee VND/FX relation và cost components; cancellation policy chính xác từng supplier, carrier void; điều kiện credit term còn thiếu trong baseline; chi tiết claim policy khi đến phase. Không hỏi lại những quyết định đã chốt chỉ vì Work chưa có code. Chỉ chặn phần phụ thuộc; fixture tự đặt phải ghi TEST.

## 11. Kế hoạch thực hiện và nghiệm thu

1. P0 Documentation: đọc file này + Feature docs + HEAD; lập bảng APPROVED vs implemented/staged/missing; sửa mâu thuẫn, commit docs và index trước code. Source file này là handoff, không tự chứng nhận hiện trạng repo.
2. P0 Order–Finance: consent/override, Awaiting Funds/FIFO, atomic reserve/charge, Edit Order vs Edit Selling Price, Cancel & Duplicate, policy refund cấu hình, supplier cancellation queue; regression concurrency/idempotency và rollback lỗi kỹ thuật.
3. P0 Service/Pricing: hoàn thiện Configuration/Rate Excel import, publish/global auto apply, Draft resolver weight/zone, UPS optimization + ePacket FX + surcharges; nối version/quote vào Purchase và Lot snapshot. Đảm bảo client discount và manual quote. Không bypass service cap.
4. P0 VND operational cutover trên DB test mới hoặc bản sao, reconcile opening balance/ledger/reserve/statement/report. Không dùng dữ liệu USD demo lẫn VND; không bật production khi chưa kiểm tra xuyên module.
5. P1 Fulfillment + Supplier reconciliation: template, split Lot, label release, Manifest, Emergency Hold, actual cost/import duplicate + payable/claim. P1 Add-on + corrections + permissions/reporting/expenses.
6. P1 UAT UI: Admin/BOD/Sales/Finance/Client đăng nhập riêng; tối ưu UI sau khi logic ổn. Dữ liệu mẫu đầy đủ các service/edge cases. Chạy full build/typecheck/lint/domain/HTTP/browser tests trên cùng commit và lưu report. Commit/push theo quy trình repo; không tuyên bố production ready khi chỉ staged.

### Acceptance tối thiểu (regression xuyên module)

- UPS: cận 20/20,5/21/44/44,5; Expedited rounding, split lots; rate `o`, no zone, tie priority; formula fixed/per kg và surcharge mỗi Lot; pending account + global auto update; account đổi giữa Draft/Purchase; snapshot không đổi sau publish.
- ePacket: max dimension 55/75/75,01; non-cont mã/tên/AA AE AP; một phí mỗi rule; unsupported country; FX cập nhật toàn bộ pricing; một carton; EU auto route đúng thị trường.
- Order: giá đổi lúc click vs Net-only; consent/override scoped; thiếu funds, top-up FIFO chạy đồng thời, retry, reserve delta; đủ label charge once; partial label cấm edit; cancel + duplicate thiếu funds, không copy label, refund đúng policy theo service, queue supplier. Cancel trước/sau ETD. Revenue correction sau charge không reopen order, không sửa statement cũ.
- Finance: Add-on/adjustment/surcharge/correction vượt credit vẫn post, không auto Debt; purchase tiếp theo bị hold; cost sửa không đổi balance; refund bank vs balance nhiều đợt, vượt approved bị chặn, recovery âm; statement immutable và cash/performance timing đúng.
- Supplier: duplicate cùng file/cũ pending không đổi cost; old/new, surcharge riêng và retry; approved actual mới phải trả; credit/receivable/payment nhiều đợt không double count. Order cancellation nội bộ không tự void/cost reverse.
- RBAC: Sales/Client thử direct ID, export, history, bulk & API lấy Net/Supplier; chỉ Sales Add-on scope riêng cho cost/supplier; BOD-only report; Finance không sửa service. UAT từng role với dữ liệu VND; full ledger reconciliation phải bằng tổng giao dịch. Lưu commit SHA, test logs, gaps OPEN, actual/expected và lỗi còn tồn tại.
