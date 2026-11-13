# HISTORICAL RECOVERY — superseded by canonical V1 spec

# DMD Order Platform — Service Architecture V1 Specification

**Ngôn ngữ:** Tiếng Việt  
**Ngày tổng hợp:** 13/11/2026  
**Mục đích:** Bàn giao đặc tả nghiệp vụ, công thức, giới hạn và ca nghiệm thu cho nhóm triển khai.  
**Tình trạng:** Bản tổng hợp theo nguồn truy xuất được; **chưa thể chứng nhận bao phủ toàn bộ lịch sử quyết định của hội thoại gốc**. Không phải biên bản nghiệm thu phần mềm.

> **Giới hạn nguồn quan trọng:** Công cụ đọc hội thoại “Cập nhật tiến độ dev” chỉ trả về 5 lượt cuối, `hasMore=false`, không có con trỏ đọc tiếp. Vì vậy tài liệu không tự nhận những chi tiết bị thiếu là “đã chốt”. Các mục VTT/SDS/JD, Rate Card Min/Max, Price Proposal và ePacket vẫn có mặt trong tài liệu, nhưng những quy tắc chưa có bằng chứng được ghi rõ. Muốn hoàn tất một bản đặc tả toàn bộ quyết định cuối cùng, cần bổ sung bản xuất đầy đủ của hội thoại gốc và các bảng cấu hình liên quan.

## 1. Nguồn, mức xác nhận và cách sử dụng

### 1.1. Nguồn đã đọc

| Mã | Nguồn | Giá trị sử dụng |
|---|---|---|
| S1 | [Cập nhật tiến độ dev](chatgpt-conversation://6ad35267-1ad8-83ec-a691-9d80c58281df), 5 lượt cuối | Quyết định cuối về Add-on, Financial Adjustment và bốn kiểm soát triển khai |
| S2 | `sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md` | Bản đồng bộ của file người dùng nêu tại `/mnt/data/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md`; nghiệp vụ ngày 16/10/2026. Không truy cập được bản `/mnt/data` để so byte |
| S3 | `outputs/service-v1-2026-11-13/Service-Matrix-Pricing-Financial-Rules-Gap-Analysis.md` | Bản audit đã có trong dự án; chứa phần khôi phục về markup, global UPS và currency. Đây là nguồn thứ cấp, không thay thế lịch sử phê duyệt gốc |
| S4 | [Công thức tính Net Cost UPS](chatgpt-conversation://6af5587f-90ac-83ec-856e-2562aa9b8da3) | Công thức Owner cung cấp; giải thích FIXED/PER_KG, rounding và thảo luận non-cont |
| S5 | [Thông tin phụ phí UPS](chatgpt-conversation://6af4441f-5c24-83ec-9175-51b33810f336) | Đề xuất phụ phí UPS nội địa Mỹ; không phải bảng account quốc tế DMD đã phê duyệt |
| S6 | Yêu cầu bàn giao ngày 13/11/2026 | Danh mục cần bao phủ; tự nó không xác định giá trị cấu hình hoặc quy tắc chưa được cung cấp |

Tài liệu không kiểm tra lại quy định hãng hiện hành trên Internet: mục đích là tái hiện quyết định trong nguồn, không cập nhật hợp đồng hoặc thay quyết định bằng biểu phí công bố mới.

### 1.2. Nhãn trạng thái

- **CHỐT:** Có quyết định trực tiếp trong S1 hoặc được S2 ghi APPROVED, trừ nội dung đã bị quyết định mới thay thế.
- **GHI NHẬN QUA AUDIT:** S3 ghi là yêu cầu đã xác nhận nhưng chưa khôi phục được lượt quyết định gốc. Tách riêng để người triển khai biết mức bằng chứng.
- **THAM KHẢO/ĐỀ XUẤT:** Giải thích hoặc phương án của trợ lý, chưa có bằng chứng Owner chốt trong phần truy xuất.
- **CHƯA QUYẾT/THIẾU NGUỒN:** Không đủ dữ liệu để xác định rule cuối. Không dùng ví dụ làm mặc định.
- **ĐỂ SAU:** Ngoài phần triển khai hiện tại theo nguồn.

Các công thức và ca test minh họa chỉ giải thích quy tắc tương ứng, không tạo thêm bảng giá, ngưỡng hoặc quyền mới. Tài liệu không sử dụng code legacy làm nguồn quyết định nghiệp vụ.

## 2. Phạm vi và các nguyên tắc nền

**CHỐT — S1, S2:**

1. Thứ tự triển khai được giao: Service Configuration → Pricing & Publish → UPS Calculation/Optimization → Fulfillment → Add-on/Financial Integration.
2. Tái sử dụng cấu trúc hiện có khi phù hợp; không xây tính năng ngoài phạm vi thống nhất.
3. Một Order có một địa chỉ giao; hỗ trợ nhiều Lot và nhiều Carton.
4. Số Lot quyết định số tracking tính phí cần có cost. Không bổ sung bước xác nhận “tracking đại diện”.
5. Service/Route phải phân biệt đầy đủ Service + Sub-Service + Supplier.
6. Net hiện hành và Selling Price đã Published độc lập. Pending không được áp nhầm vào giá bán.
7. Giá và snapshot đã mua không tự đổi theo Actual Supplier Net phát sinh sau đó.
8. Ledger không ghi giao dịch trùng. Balance Adjustment được vượt hạn mức; Purchase vẫn phải kiểm tra điều kiện mua.
9. Quyền nhìn Cost/Supplier Add-on của Sales không mở quyền nhìn Net/Supplier của dịch vụ vận chuyển.

**ĐỂ SAU — S2:** Cargo, mid-mile allocation engine, usage services như scan active/relabel, ví/cash-flow/quỹ và VAT logic chuyên sâu. Cargo charge theo ETD và usage charge theo usage event là định hướng được ghi nhận, không phải luồng Express V1 đã hoàn thiện.

## 3. Service Matrix

| Service/nhóm | Thị trường, Sub-Service và Supplier | Giá và phụ phí | Fulfillment/charge | Tình trạng |
|---|---|---|---|---|
| ePacket US | Standard DMD và Eco DMD; phân tuyến riêng | Có oversize/non-cont cần bảng rule cuối; không lấy bảng USD legacy làm V1 | Reserve khi mua; charge khi có tracking + label; đóng Standard/Eco riêng | Tuyến và charge: CHỐT S2; ngưỡng phụ phí: THIẾU NGUỒN |
| ePacket EU | Theo route/supplier cấu hình; SGB được nêu trong luồng kho | Không suy bảng US cho EU | Express; phân loại EU → SGB theo route | CHỐT S2; rate cụ thể chưa có |
| YunExpress | Theo thị trường/route, thường ngoài Mỹ; SGB được nêu trong luồng kho | Bảng riêng theo cấu hình được cấp quyền | Express, tracking + label | CHỐT S2; rate cụ thể chưa có |
| UPS | Theo route, chuyển SBay trong luồng kho; account VTT/SDS/JD được yêu cầu bao phủ | Net theo từng account/zone/cân/phụ phí; tối ưu sau khi tính đủ Net | Một địa chỉ, nhiều Lot/Carton; Express tracking + label | Tối ưu: CHỐT S1; mapping account: THIẾU NGUỒN |
| Chuyên tuyến custom | Case-by-case nhưng bắt buộc đăng ký Supplier trong Route | Giá/điều kiện có thể cấu hình thủ công | Theo route; không tự suy Cargo | CHỐT S2 |
| Fulfillment | Được yêu cầu là nhóm triển khai riêng | Bảng phí, đơn vị tính và cấu trúc catalogue chưa khôi phục | Luồng Order/kho nền ở mục 9; dịch vụ Fulfillment riêng xem 9.4 | THIẾU NGUỒN cho quy tắc riêng |
| Add-on | Khoản thu gắn Client; Cost/Supplier riêng của Add-on | Revenue ghi nhận một lần và khóa; Cost có thể pending và chỉnh sửa | Ghi nhận Revenue/Cost/GP, ảnh hưởng Balance khi tạo | CHỐT S1 |

Supplier vận chuyển, account hãng, supplier của Add-on và Supplier account/login là các khái niệm khác nhau. Chưa có nguồn cho phép đồng nhất VTT/SDS/JD với các Supplier SBay/SGB/DMD.

## 4. Service Configuration

### 4.1. Quy tắc có bằng chứng

**CHỐT — S2:**

- Sales tư vấn và bật dịch vụ cho Client; Client chỉ được nhìn/chọn dịch vụ được cấp, thường 1–2 dịch vụ, cùng discount riêng.
- Hàng thực phẩm, TPCN, pin, nam châm, chất lỏng và hàng khó có thể cần Admin kiểm tra Supplier trước khi xác nhận nhận vận chuyển.
- Rule vận chuyển, phân loại và cancellation gắn route đầy đủ Service–Sub-Service–Supplier.
- Route custom vẫn phải có Supplier đăng ký.
- Giữ declared weight/dimensions riêng với measured weight/dimensions.
- Cân đo thủ công là tùy chọn trong GĐ1; không bắt buộc để đi tiếp phân loại.

### 4.2. Nội dung cấu hình cần thể hiện trong bàn giao

Đây là danh mục thông tin nghiệp vụ, **không áp đặt schema mới**:

| Nhóm | Nội dung cần có theo nguồn | Phần còn thiếu |
|---|---|---|
| Danh tính route | Service, Sub-Service, Supplier | Mã chuẩn, unique key, quy tắc đổi danh tính |
| Thương mại | Giá Base/Retail/Sales, discount Client; phiên bản Published | Độ ưu tiên discount, effective-time và phạm vi từng policy |
| Khả năng phục vụ | Thị trường, hàng hóa và giới hạn theo route/Supplier | Bảng quốc gia, ZIP, ngưỡng cân/kích thước chính thức |
| Vận hành | Tracking/label, carton/manifest, Hold khi vượt giới hạn | Loại nhãn nội bộ và luồng Fulfillment riêng |
| Cancellation | Policy theo route, ETD và trạng thái charge | Timezone/cutoff và yêu cầu carrier void theo Supplier |
| Quyền | Dịch vụ được cấp cho Client; cost vận chuyển bị hạn chế | Ma trận quyền cấu hình/publish chi tiết |

S3 nhắc lifecycle/Hold và giữ lịch sử route. Chưa có nguồn gốc đầy đủ để quy định tên tất cả trạng thái hay quy tắc activate/deactivate V1.

## 5. Pricing Net → Base → Retail → Sales

### 5.1. Thuật ngữ và tính độc lập

| Giá trị | Ý nghĩa |
|---|---|
| Net / Estimated Net | Chi phí dự tính dùng tính cost và đối soát |
| Actual Net | Cost thực tế được đối soát; dùng GP-Net |
| Base | Giá nền thương mại theo cấu hình |
| Retail | Giá sau markup trên Base |
| Sales Price | Giá khách sau discount được cấp |

**CHỐT — S2:** Base → Retail → Sales; khóa snapshot khi mua. Estimated/Actual Net phục vụ đối soát và GP, không tự thay Base/Retail/Sales sau mua.

**GHI NHẬN QUA AUDIT — S3:** V1 bổ sung tính tuần tự từ Net qua hai markup policies:

```text
mN = Net Cost Markup% ở dạng thập phân
mB = Base Cost Markup% ở dạng thập phân
d  = Client discount% ở dạng thập phân

Base   = Net × (1 + mN)
Retail = Base × (1 + mB)
Sales  = Retail × (1 − d)
```

Hai markup áp dụng tuần tự, không cộng hai tỷ lệ rồi nhân Net. Đây là cơ chế tạo giá/version; không có nghĩa mỗi lần Net hiện hành đổi là tự đổi Selling Price Published.

**Ví dụ minh họa:** Net 100.000 VNĐ, mN=10%, mB=20%, d=5%:

```text
Base   = 110.000 VNĐ
Retail = 132.000 VNĐ
Sales  = 125.400 VNĐ
```

Chưa có bằng chứng để quy định rounding tiền ở từng bước, discount áp trên phụ phí/thuế hay không, markup riêng cho từng component, số tiền tối thiểu hoặc sàn margin. Không tự áp công thức trên cho toàn bộ phụ phí nếu scope chưa rõ.

### 5.2. Hai markup policies và Review & Publish

**GHI NHẬN QUA AUDIT — S3:**

| Policy | Chuyển đổi | Yêu cầu |
|---|---|---|
| Net Cost Markup | Net → Base | Review & Publish |
| Base Cost Markup | Base → Retail | Review & Publish |

Pending không tham gia giá bán. Thay Net không tự publish Selling Price. Net hiện hành và Selling Price version đã Published phải độc lập; Order đã mua giữ snapshot.

**CHỐT — S1:** Pricing Version là ca kiểm soát bắt buộc; phải tránh áp nhầm cấu hình Pending.

**CHƯA QUYẾT/THIẾU NGUỒN:** Hai policy publish chung hay riêng; ai tạo/review/publish; có cấm tự duyệt hay không; lịch hiệu lực; scope theo Service/route/account/Client; xử lý proposal cạnh tranh; expire/reject/withdraw/rollback và tên state chính thức.

### 5.3. Price Proposal và versioning

Yêu cầu bàn giao có Price Proposal, nhưng S1/S2 không cung cấp workflow đầy đủ. Chỉ xác nhận được ranh giới:

- Có version giá bán Published độc lập với Net hiện hành.
- Không dùng version Pending khi tính giá bán.
- Snapshot đơn đã mua không tự thay khi cập nhật cost hoặc cấu hình.
- S3 ghi nhận lưu version, actor và thời gian cho thay đổi global UPS.

**CHƯA CÓ BẰNG CHỨNG CHỐT:** Điều kiện sinh Price Proposal; tự sinh khi import Net hay khi đổi markup; một hay nhiều proposal đang mở; dữ liệu preview/diff; publish nguyên khối hay một phần; price effective date; xử lý quote đã phát ra trước publish; stale/concurrent publish; lịch sử rollback. Không đưa một state machine do người soạn tự đặt vào phần rule đã chốt.

### 5.4. Tiền tệ

S3 ghi nhận GĐ1 dùng VNĐ và Owner đã xác nhận chuyển tạm dữ liệu USD với 1 USD = 25.910 VNĐ; chưa có lượt xác nhận gốc trong nguồn đọc lần này. Vì vậy đây là **GHI NHẬN QUA AUDIT**, không phải lệnh thực hiện migration trong bàn giao này.

Không đổi nhãn USD thành VNĐ hoặc coi bảng ePacket quy đổi tạm là bảng chính thức. Rounding quy đổi, ngày cutover, phạm vi monetary fields và xử lý snapshot lịch sử còn cần hồ sơ migration riêng.

## 6. UPS: account, zone, Rate Card và globals

### 6.1. Tối ưu account

**CHỐT — S1:** Tính Net Cost đầy đủ của từng account theo Zone, cân và phụ phí **trước khi** chọn account tối ưu. Không chọn dựa trên transportation rate đơn thuần.

**Ví dụ kiểm tra nguyên tắc:** A có transportation 100.000 và tổng phụ phí 80.000, B có transportation 120.000 và tổng phụ phí 20.000; nếu các khoản này đã là tổng cost có thể so sánh, B rẻ hơn: 140.000 so với 180.000 VNĐ. Ví dụ không quy định loại phụ phí hay policy tie-break.

| Account cần bao phủ | Điều đã biết | Điều chưa có nguồn |
|---|---|---|
| VTT | Tên được nêu trong yêu cầu bàn giao | Service, rate, zone, discount, phụ phí, Supplier mapping, trạng thái đủ điều kiện |
| SDS | Tên được nêu trong yêu cầu bàn giao | Như trên |
| JD | Tên được nêu trong yêu cầu bàn giao | Như trên |

Chưa xác nhận account dùng chung hay khác zone map; ưu tiên/tie-break khi bằng giá; quyền manual override; điều kiện exclude; fallback khi thiếu rate; account đã chọn có được đổi sau purchase hay không. Không gán các quy tắc này theo suy đoán.

### 6.2. UPS Rate Card: Min/Max kg, FIXED/PER_KG

**S6 yêu cầu cấu trúc này; phần semantics có thể đối chiếu S4:**

| Trường | Đơn vị/ý nghĩa xác định được | Còn cần xác nhận |
|---|---|---|
| Min kg | Cận dưới khoảng cân | Bao gồm hay loại trừ cận |
| Max kg | Cận trên khoảng cân | Bao gồm hay loại trừ cận; vô hạn/để trống |
| Rate | Giá trị dòng giá | Bảng giá thật theo account/service/zone |
| FIXED | Diễn giải tương ứng giá VNĐ/shipment: T=Rate | Mapping tên enum với dữ liệu thực tế |
| PER_KG | Diễn giải tương ứng giá VNĐ/kg: T=Rate×W | Minimum charge, vượt Max, khoảng trống/chồng lấn |

S4 khuyên lấy loại dòng giá thực tế để xác định đơn vị; không hardcode `W > 21 kg` để chọn PER_KG. Ngưỡng rounding >20 kg và ngưỡng đổi đơn vị bảng giá là hai việc khác nhau.

Không có Rate Card gốc để chốt lookup tại đúng Min/Max hoặc giữa hai dòng. Không tự chọn khoảng đóng/mở. Chưa xác nhận cách import, precision kg, độ ưu tiên hay effective date của rate rows.

### 6.3. Zone

**CHỐT — S1:** Zone tham gia tính Net từng account trước tối ưu.

**CHƯA CÓ BẢNG CHỐT:** Mapping destination → zone; zone theo country/state/postal code; ngoại lệ US territories; Service/account có dùng zone khác nhau; xử lý missing zone, wildcard, postcode range và version zone. Không suy zone account này sang account khác.

### 6.4. Global variables và auto-apply

**GHI NHẬN QUA AUDIT — S3:** Fuel, VAT, Broker và Customs là các global variables UPS; auto-apply **sau Admin xác nhận**, không phải ngay khi save/upload. Account Net/surcharge phải publish. Lưu version, actor, thời gian; không thay snapshot đã mua. S3 còn ghi invalidation quote cho đơn chưa mua; workflow cụ thể chưa khôi phục.

| Biến | Đơn vị | Tác động trong công thức |
|---|---|---|
| Fuel `F` | Tỷ lệ thập phân | Nhân bracket transportation + shipment surcharge + weight surcharge |
| VAT `V` | Tỷ lệ thập phân | Nhân cùng bracket, sau factor Fuel theo công thức |
| Broker `B` | Tỷ lệ thập phân | Nhân transportation sau NetDiscount, nằm ngoài Fuel/VAT |
| Customs `C` | VNĐ/kg | Nhân W, nằm ngoài Fuel/VAT |

**CHƯA QUYẾT/THIẾU NGUỒN:** Global theo toàn bộ UPS hay theo thị trường/service/ngày; Broker có chỉ áp US; account override; customs chỉ áp hàng/chiều nào; auto-apply ảnh hưởng Base/Retail hay chỉ Net; global update có sinh proposal hoặc cần publish lại; người được xác nhận có cần quyền xem Net hay không. Không suy quyền xem Net từ quyền xác nhận global.

## 7. UPS: công thức Net Cost và scope

### 7.1. Công thức được Owner đưa ra

**NGUỒN TRỰC TIẾP — S4, user turn `7cbdd8fd-84de-4e09-b3d0-b13c83f689b6`:**

```text
T = Rate                    nếu FIXED / VNĐ trên shipment
T = Rate × W                nếu PER_KG / VNĐ trên kg

TransportationDiscounted = (1 − ND) × T
ShipmentDiscounted       = Ss × (1 − SD)
WeightDiscounted         = Sw × (1 − WD) × W

NetCost = (1 + F) × (1 + V)
          × [TransportationDiscounted + ShipmentDiscounted + WeightDiscounted]
          + B × TransportationDiscounted
          + C × W
```

| Biến | Ý nghĩa | Đơn vị/scope trong công thức |
|---|---|---|
| `Rate` | Đơn giá đầu vào từ dòng bảng giá | VNĐ/shipment hoặc VNĐ/kg |
| `T` | Transportation quy đổi về tổng shipment | VNĐ/shipment, trước ND theo cách đặt biến này |
| `W` | Billable Weight của đối tượng shipment được tính | kg; không phải tổng actual weight thô |
| `ND` | Net Discount | Tỷ lệ trên transportation |
| `Ss` | Surcharge Shipment | VNĐ/shipment |
| `SD` | Shipment Surcharge Discount | Tỷ lệ trên Ss |
| `Sw` | Surcharge Weight | VNĐ/kg |
| `WD` | Weight Surcharge Discount | Tỷ lệ trên Sw |
| `F` | Fuel Surcharge | Tỷ lệ trên tổng trong bracket |
| `V` | VAT | Tỷ lệ; factor (1+F)(1+V) |
| `B` | US Broker | Tỷ lệ trên transportation sau ND |
| `C` | Phụ phí hải quan | VNĐ/kg |
| `NetCost` | Tổng theo biểu thức | VNĐ/shipment |

Tỷ lệ 50% biểu diễn 0,5; 3% biểu diễn 0,03. Nếu Rate đầu vào đã discount, không discount lần hai. Không nhân W vào toàn bộ NetCost: việc đó nhân lặp các khoản đã có scope shipment và weight.

**Ranh giới scope:** S4 mô tả W của shipment/toàn Order trong ví dụ. S2 cho phép một Order nhiều Lot. **Chưa khôi phục được quyết định shipment = Lot hay shipment = Order trong công thức UPS V1.** Không tự thu Ss một lần/Order hoặc một lần/Lot cho đến khi mapping được xác nhận. Tương tự, phụ phí carton riêng không tự nhập vào Ss nếu chưa có quy tắc tổng hợp và discount.

### 7.2. Ví dụ đủ biến, chỉ dùng kiểm tra số học

Giả định: Rate=100.000 VNĐ/kg; W=25 kg; ND=50%; Ss=100.000 VNĐ/shipment; SD=20%; Sw=2.000 VNĐ/kg; WD=10%; F=20%; V=10%; B=3%; C=10.000 VNĐ/kg.

```text
T                         = 100.000 × 25             = 2.500.000
TransportationDiscounted  = 2.500.000 × 0,5          = 1.250.000
ShipmentDiscounted        = 100.000 × 0,8            =    80.000
WeightDiscounted          = 2.000 × 0,9 × 25         =    45.000
Bracket                   = 1.250.000+80.000+45.000  = 1.375.000
Bracket sau Fuel và VAT   = 1.375.000 × 1,2 × 1,1    = 1.815.000
Broker                    = 0,03 × 1.250.000         =    37.500
Customs                   = 10.000 × 25              =   250.000
NetCost                   = 1.815.000+37.500+250.000 = 2.102.500 VNĐ
```

Các giá trị trên không phải cấu hình mặc định VTT/SDS/JD. S4 từng dùng Broker 3% và Customs 10.000 VNĐ/kg trong giải thích; chưa có bằng chứng chúng là global V1 cố định cho mọi thị trường/account.

### 7.3. Phụ phí UPS ngoài công thức

S5 bàn AHC/LPS/OMS và Demand Surcharge cho UPS nội địa Mỹ. Không có bằng chứng Owner đã chọn dùng bảng đó cho UPS quốc tế DMD. Tài liệu không chuyển các mức USD hoặc ngưỡng nội địa Mỹ thành rule V1.

LPS loại trừ AHC, OMS/OML chặn tự mua, minimum billable và bảng Demand vẫn là **THAM KHẢO/ĐỀ XUẤT**, chưa đưa vào rule thi hành. Chưa chốt chúng có nằm trong Ss/Sw, chịu Fuel/VAT hoặc discount nào.

## 8. UPS rounding theo Carton và shipment/Lot

### 8.1. Nội dung khôi phục được

**THAM KHẢO — S4, assistant response `41f3c594-8a67-4b70-8c22-e956a48d868c`:** Quy tắc sau được mô tả trong hội thoại, chưa có lượt Owner xác nhận mapping đến từng account/Lot V1.

Kích thước cm, khối lượng kg:

```text
RU(x, s) = ceil(x / s) × s
DimWeight_i = Length_i × Width_i × Height_i / 5.000
CartonBillable_i = max(RU(Actual_i, step), RU(DimWeight_i, step))
S = sum(CartonBillable_i)
```

| Service | step tại carton | Rounding tổng S |
|---|---|---|
| Express / Saver | 0,5 kg | S ≤20 kg: RU(S;0,5); S >20 kg: RU(S;1) |
| Expedited | 1 kg | RU(S;1) |

Không lấy `max(sum Actual, sum Dimensional)` để thay tổng max theo carton. Không dùng ngưỡng đổi FIXED/PER_KG làm ngưỡng rounding.

### 8.2. Ví dụ

Express/Saver có 3 carton:

| Carton | Actual kg | Dimensional kg | Billable sau round kg |
|---|---:|---:|---:|
| 1 | 3,2 | 4,1 | 4,5 |
| 2 | 5,7 | 3,8 | 6,0 |
| 3 | 10,3 | 9,2 | 10,5 |
| Tổng | 19,2 | 17,1 | 21,0 |

Shipment billable = 21 kg. Nếu S=20,5 thì tổng làm tròn 21 kg; S=20 thì giữ 20 kg. Expedited với một carton actual=3,2 và dimensional=4,1 cho 5 kg.

### 8.3. Chỗ chưa được phép suy ra

- Mapping nhóm carton → shipment → Lot → Order chưa đủ nguồn. Nếu mỗi Lot là một shipment thì công thức chạy trong Lot, nhưng đây là điều kiện cần xác nhận, không phải quyết định mới.
- Chưa có quy tắc round kích thước trước tính volumetric; precision nhập liệu; minimum billable do phụ phí; ngoại lệ account và rounding tiền.
- S3 ghi “rounding carton rồi Lot”, nhưng cũng ghi thiếu bằng chứng mapping. Cần bản chốt gốc trước khi dùng làm oracle nghiệm thu account thật.

## 9. Fulfillment và vận hành Order

### 9.1. Luồng Express nền — CHỐT S2

```text
Sales cấp quyền dịch vụ/discount
→ Client tạo Draft (người nhận, hàng hóa, kiện)
→ kiểm tra route/hàng và giá preview
→ kiểm tra Balance/Credit/overdue/account block
→ Purchase: reserve và khóa snapshot
→ Admin cung cấp tracking + label
→ charge một lần, release reserve
→ khách in nhãn và gửi hàng
→ kho receive/scan; có thể cân đo
→ phân loại đúng route
→ đóng carton/túi, Close và mã thùng
→ Manifest/Outbound/Supplier
→ tracking/case
→ Supplier Cost theo Lot, reconciliation
→ tất cả Lot PASS thì Order Finalized
```

Các bước vận chuyển, cost và thanh toán bất đồng bộ; không ép toàn bộ thành một chuỗi trạng thái tuần tự duy nhất.

### 9.2. Kho, đo lại và Hold — CHỐT S2

- Receive được đi thẳng phân loại nếu không cân đo.
- Giữ declared và measured riêng.
- Có measurement và trội cân nhưng trong phạm vi dịch vụ: tự tính phụ phí hợp lệ, không cần Admin approve.
- Vượt giới hạn: Hold, Admin xử lý đổi route hoặc trả hàng.
- Chống thu trùng khi scan/đo lại. Cách lấy latest accepted measurement hay thao tác điều chỉnh riêng vẫn OPEN.
- Hỗ trợ tìm hàng loạt bằng Tracking/Client Order ID dán từ Sheets/Excel.
- ePacket Standard và Eco đóng riêng; EU/Yun → SGB, UPS → SBay, custom → Supplier đã đăng ký theo route.
- Close, in mã thùng, Manifest trước Outbound; ePacket Standard gửi Manifest cho Product trước chuyển tiếp.
- Phân vùng East/West, mua last-mile label thùng Eco: ĐỂ SAU. Dán hộ nhãn/đóng gói bổ sung có thể thao tác ngoài app.

### 9.3. Tracking, case và claim — CHỐT S2

Tracking vận chuyển độc lập Case status; giải quyết Case không ghi đè trạng thái hãng. FAILED cho đơn thực sự thất bại/kẹt dài ngày cần actor, reason, time, audit và mở lại; S2 yêu cầu kiểm tra thực tế, không xác nhận đã code xong.

Case gồm Delay Mid-mile, Delay Last-mile, Customs Clearance, Pending Delivery, Other Error. Một Case có thể gắn nhiều Order. Claim credit phân bổ đúng Order, tránh trùng cancellation refund. Supplier recovery được ghi riêng; Supplier trả DMD không tự credit Client.

### 9.4. Fulfillment như một dịch vụ riêng

S1 giao triển khai nhóm Fulfillment, nhưng không có phần lịch sử mô tả đủ: catalogue, storage, pick/pack, inbound/outbound fee, đơn vị tính, supplier, tồn kho, moment charge, hủy/hoàn và liên kết Add-on. Không xem luồng kho Express ở trên là toàn bộ đặc tả dịch vụ Fulfillment. Các nội dung này thuộc **THIẾU NGUỒN**, chưa được tự định nghĩa.

## 10. Add-on Service

### 10.1. Quyết định cuối — CHỐT S1

| Thao tác | Rule V1 |
|---|---|
| Tạo Add-on | Ghi nhận Revenue/Cost/GP và khoản thu Client |
| Revenue sau ghi nhận | Khóa, không sửa trực tiếp |
| Sửa Cost | Cho phép, giữ History; cập nhật Cost/GP |
| Sửa Supplier/Note | Cho phép trong phạm vi quyền |
| Bổ sung Cost Pending | Cho phép |
| Cost thay đổi | Không làm đổi Client Balance |
| Revenue nhập sai | Xử lý bằng Balance Adjustment |
| Revenue Correction chuẩn hóa | ĐỂ SAU |
| Workflow Draft/Posted phức tạp | Không xây thêm cho V1 |

Không đưa phương án sửa Revenue tự động tạo chênh lệch trong các lượt cũ vào phần rule đang áp dụng. Quyết định cuối đã thay thế phương án đó.

### 10.2. Ví dụ và kỳ khóa

Add-on Revenue=500.000, Cost=200.000 → GP=300.000 VNĐ. Sửa Cost=250.000 → GP=250.000; Client Balance không đổi. Giữ lịch sử thay đổi.

S1 nêu khi kỳ tài chính đã khóa phải giữ số liệu kỳ cũ và ghi chênh lệch cost vào kỳ hiện tại. Cơ chế khóa kỳ, người phê duyệt và thời điểm hạch toán chi tiết chưa có nguồn đầy đủ.

Nếu Revenue đúng là 450.000 nhưng đã ghi 500.000, Balance Adjustment +50.000 cho Client làm Balance đúng; Revenue Add-on vẫn 500.000, GP chưa tự được sửa theo Revenue đúng. Đây là **giới hạn V1 đã được nêu rõ**, không coi Adjustment là Revenue Correction.

### 10.3. Quyền Sales và dữ liệu nội bộ

**CHỐT — S1:** Sales được thấy Cost/Supplier của Add-on do mình có quyền thao tác; không được thấy Net/Supplier của dịch vụ vận chuyển.

**ĐỀ XUẤT trong S1:** Related Add-on ID trên Adjustment nếu đơn giản; bước xác nhận cho thấy tên khoản thu, Revenue, số trừ Balance và cost nội bộ; cảnh báo Adjustment chỉ sửa Balance. Chưa có lượt Owner chốt riêng từng chi tiết UI/schema nên không biến thành yêu cầu phê duyệt mới.

**CHƯA QUYẾT:** Revenue tối thiểu, Add-on zero/negative, quyền tạo khi Client thiếu sức mua, hoàn/hủy Add-on, quyền xóa, scope Supplier catalogue, cách báo cáo GP khi Cost Pending. Việc Adjustment được vượt limit không tự suy thành quyền tạo Add-on mới vượt limit.

## 11. Ledger, Balance, Credit, Debt và cancellation

### 11.1. Purchase — CHỐT S2

```text
Sức mua = Balance + Credit Limit − Active Reserve
```

Mô hình Balance âm thể hiện công nợ. Client không được cấp công nợ phải có prepaid balance. Purchase bị chặn khi không đủ sức mua, công nợ/debt quá hạn, hoặc Admin khóa account mua.

Express reserve khi Purchase; charge khi có cả Tracking + Label; charge một lần và release reserve. Purchase thất bại/hủy hợp lệ trước charge thì release reserve. Không xem reserve là charge lần thứ nhất.

### 11.2. Balance Adjustment — CHỐT S1, S2

Adjustment có căn cứ vẫn ghi nhận nghĩa vụ Client dù thiếu Balance hoặc vượt Credit Limit. Purchase mới tiếp tục kiểm tra điều kiện mua. Không dùng purchase gate để từ chối việc ghi nhận đúng số liệu tài chính.

Ví dụ: công nợ 900.000, Credit Limit 1.000.000; Adjustment tăng nghĩa vụ 300.000 → công nợ 1.200.000, vẫn ghi nhận; không vì thế tăng Credit Limit.

S2 yêu cầu phân loại, reference, actor, nguồn tiền và history cho adjustment. Support credit không giả lập Supplier refund. Không ghi trùng giao dịch; không tự tính payment hai lần.

### 11.3. Payment và Debt — CHỐT S2

- Một Debt đang hoạt động/Client; tái cơ cấu receivable thành Debt không phải nạp tiền thật.
- Có gốc, lãi %/ngày, deadline; thay gốc/gia hạn/lãi suất có audit.
- Lãi đã phát sinh không tính lại; không lãi chồng lãi; Debt quá hạn chưa trả hết block Purchase.
- Tiền vào ví thực tế mặc định trả Debt theo lãi đến hạn → gốc; sau đó công nợ thường FIFO. Admin đổi allocation có audit.
- Đối soát khách theo tuần: thứ 2–4 kiểm tra/xác nhận, thứ 4–6 thường thanh toán. Điểm bắt đầu Credit Term và overdue để không chặn trong cửa sổ được phép vẫn OPEN.

### 11.4. Cancellation — CHỐT S2, kèm điều kiện chưa xác nhận

Policy cấu hình theo route; đủ rule thì tự hủy/hoàn, không manual override. Hỗ trợ ngoài policy bằng Balance credit có lý do.

| Route/nhóm | Nội dung nguồn |
|---|---|
| ePacket US trước tracking/label | Hoàn 100%; nếu chưa charge thì release reserve |
| ePacket US đã cấp tracking/label, trước ETD | Hoàn 90% |
| ePacket EU/Yun/UPS có label, trước ETD | Có thể hoàn 100%, **cần xác nhận Supplier khi cấu hình** |
| Express từ ETD | Không cho hủy |
| Cargo | Định hướng chặn ETD−2 ngày; ĐỂ SAU |

Refund dựa tổng Order đã charge gồm phụ phí; chống duplicate và vượt giới hạn, trừ refund Claims đã có. Hủy trên Report không đồng nghĩa carrier đã void label; API/timeout và xác nhận void theo Supplier còn OPEN.

## 12. Import, Supplier Cost và reconciliation

### 12.1. Import có nguồn — CHỐT S2

Supplier gửi Excel/CSV/XLSX cước, phụ phí và tax; match bằng tracking. Một Order n Lot cần n cost tracking hợp lệ. Không dùng một cost tracking đại diện cho toàn Order.

Có thể dùng replacement cost có chứng cứ khi thiếu giá Supplier, được Admin phê duyệt và audit.

**THIẾU NGUỒN:** Tên cột chuẩn, kiểu file/version, duplicate tracking, cross-supplier match, FX theo invoice, timezone ngày phí, xử lý dòng lỗi/partial import, idempotency key import và rollback batch. Không tự quy định “last row wins” hoặc tự gộp phí.

### 12.2. Quy tắc PASS/REVIEW — CHỐT S2

```text
Nếu đủ dữ liệu và Actual Net ≤ Estimated Net → Auto PASS
Nếu Actual Net > Estimated Net, bất kể bao nhiêu → Admin REVIEW
Order Finalized khi tất cả Lot PASS
```

Admin xử lý bằng sửa cost Supplier; chấp nhận DMD chịu chênh có lý do; hoặc thu phụ phí khách kèm public note. Có thể PASS sau ghi khoản phụ phí, không phải chờ khách thanh toán. Hỗ trợ bulk.

Ví dụ Estimated=100.000, Actual=100.001 VNĐ: REVIEW, không đặt tolerance tự suy. Actual=100.000 chỉ PASS nếu đủ dữ liệu. Order 3 Lot có 2 PASS và 1 thiếu cost chưa Finalized.

### 12.3. Cost components, late cost và mid-mile

**CHỐT S2:** Last-mile theo Tracking, kho theo Carton, mid-mile theo lô vận chuyển. Tương lai mid-mile phân bổ theo chargeable weight về Lot/Order; giữ chứng từ Shipment tổng và kiểm soát tổng phân bổ bằng tổng cost. Engine này ĐỂ SAU cùng Cargo.

GĐ1 ePacket dùng Estimated Net tạm thể hiện phần Mid-mile chưa đối soát; gắn provisional, tránh double-count khi có actual allocation. Estimated Net hiện bao gồm component nào và Finalized GP khi vẫn còn estimated vẫn OPEN.

Phụ phí muộn sau Finalized tạo Cost Adjustment có lịch sử, cập nhật GP phù hợp, có thể phát sinh phải thu Client. Kỳ khóa dùng adjustment tham chiếu kỳ gốc; không ghi đè lịch sử kỳ cũ.

## 13. Roles, permissions và báo cáo

### 13.1. Ma trận xác nhận được

| Nghiệp vụ/dữ liệu | BOD/Finance được ủy quyền | Admin vận hành/CSKH | Sales | Client | Supplier login |
|---|---|---|---|---|---|
| GP-Net/Actual Supplier Net vận chuyển | Được theo quyền riêng | Không được | Không được | Không có cơ sở cấp quyền | Scope chưa chốt |
| Supplier vận chuyển | Theo quyền nội bộ, chi tiết chưa đầy đủ | Chi tiết chưa đủ nguồn | Không được thấy theo S1 | Chưa có ma trận đầy đủ | Chỉ dữ liệu scope mình theo thiết kế |
| Sales Revenue/GP-Base/commission | Theo quyền báo cáo | Chưa có scope đầy đủ | Được theo attribution/phạm vi | Không có cơ sở cấp quyền | Không có cơ sở cấp quyền |
| Cost/Supplier Add-on | Theo quyền nội bộ | Theo quyền Add-on, chưa có danh mục đầy đủ | Được với Add-on có quyền thao tác | Không có cơ sở cấp quyền nội bộ | Chưa chốt |
| Sửa Add-on Cost/Supplier/Note | Theo quyền thao tác | Theo quyền thao tác | Theo scope được cấp | Chưa có quyền sửa được xác nhận | Chưa chốt |
| Xác nhận UPS globals | Chưa có ma trận đủ | S3 nêu Admin xác nhận; không suy quyền xem Net | Chưa có quyền được xác nhận | Chưa có quyền được xác nhận | Chưa chốt |
| Review/Publish markup | Chưa xác định người được cấp quyền | Chưa xác định | Chưa xác định | Chưa xác định | Chưa xác định |

“Chưa có cơ sở cấp quyền” không phải quyết định RBAC mới; nhóm triển khai phải lấy ma trận phê duyệt còn thiếu, không tự mở quyền từ ô trống.

S2 yêu cầu bảo vệ Net/GP-Net bằng quyền thực sự, không chỉ ẩn UI. Ca kiểm tra phải bao gồm API/export và các đường trả dữ liệu liên quan. Không mở Net vận chuyển bằng cách nới bộ lọc chung để Sales xem Cost Add-on.

### 13.2. Báo cáo — CHỐT S2

BOD/Finance được ủy quyền xem doanh thu theo tháng, tổng thu, khách nợ, DMD nợ Supplier, doanh số cước loại phụ phí và thuế nhập khẩu, GP-Net minh bạch Actual/Estimated, GP-Base và hiệu suất Service/Sales.

Sales xem Sales Revenue, GP-Base và hoa hồng theo Revenue + GP-Base; attribution CSKH/Lead/team/phòng/bộ phận phải tránh chồng lặp. Công thức hệ số chi tiết chưa có trong nguồn.

Chỉ tiêu BOD được ghi: lợi nhuận tối thiểu ≥120% fixed monthly cost; ≥20% doanh số khách mới sau hai tháng có margin ≥ bình quân doanh nghiệp. Cohort và định nghĩa dữ liệu cần chốt thêm, không tự xây KPI bằng giả định.

### 13.3. Supplier account/login — thiết kế chốt, build để sau theo S2

Supplier có scope riêng cho đối soát, thiếu báo giá, DMD payable, payment và claim. Supplier Balance là DMD nợ Supplier, không dùng nhầm chiều Client Balance. Quyền upload/chỉnh cost/invoice, phản hồi claim, masking và dispute chưa chốt. S2 xếp build phần này về phase sau; tài liệu không nhận là đã triển khai.

## 14. Test cases bàn giao

Đây là ca nghiệm thu cần thực hiện, **không phải kết quả đã chạy**. Nhãn “cần nguồn” nghĩa là chưa thể viết expected result cuối mà không bổ sung quyết định. Các ca kiểm tra retry/concurrency là kiểm soát triển khai nhằm chứng minh rule không ghi trùng, không phải workflow nghiệp vụ mới.

| ID | Thiết lập/thao tác | Kết quả mong đợi hoặc điều kiện còn thiếu |
|---|---|---|
| CFG-01 | Client chưa được cấp Service | Không được nhìn/chọn Service đó — CHỐT S2 |
| CFG-02 | Cùng Service, khác Sub-Service/Supplier | Phân loại đúng full route — CHỐT S2 |
| CFG-03 | Hàng khó chưa được Supplier xác nhận | Kiểm tra Admin theo rule route; danh mục chặn cụ thể cần nguồn |
| PR-01 | Pending Net/policy tồn tại cạnh Published selling | Không dùng nhầm Pending — CHỐT S1 |
| PR-02 | Net=100.000, mN=10%, mB=20%, d=5% | Base=110.000, Retail=132.000, Sales=125.400 theo S3; tiền không cần round ở ví dụ này |
| PR-03 | Save/Review chưa Publish hai markup | Không đưa Pending vào giá bán theo S3; quy trình publish cần nguồn |
| PR-04 | Đổi Actual Net của Order đã mua | Không tự đổi Base/Retail/Sales snapshot — CHỐT S2 |
| PR-05 | Hai người publish proposal cạnh tranh | Không mất lịch sử/áp sai version; cơ chế và expected version thắng cần nguồn |
| UPS-01 | A rate rẻ hơn nhưng all-in Net cao hơn B | Chọn theo Net đủ biến — CHỐT S1 |
| UPS-02 | FIXED rate 100.000, W=25 | T=100.000, không nhân 25 theo semantics S4 |
| UPS-03 | PER_KG rate 100.000, W=25 | T=2.500.000; chỉ nhân W tại các biến có scope kg |
| UPS-04 | Đầu vào đủ biến như mục 7.2 | NetCost=2.102.500 VNĐ; không dùng làm rate mặc định |
| UPS-05 | Rate đã discounted | Không discount lần hai theo giải thích S4 |
| UPS-06 | Tại đúng Min/Max, overlap/gap | Cần rule biên Rate Card trước khi chốt expected result |
| UPS-07 | VTT/SDS/JD cùng destination | Lookup đúng zone/rate account; cần bảng thật và mapping để chạy |
| UPS-08 | Global mới save nhưng chưa Admin xác nhận | Chưa auto-apply theo S3 |
| UPS-09 | Global đã xác nhận; Order cũ đã mua | Snapshot cũ giữ nguyên; tác động quote/new prices cần workflow nguồn |
| UPS-10 | Carton actual=3,2, dim=4,1 | Tham khảo: Saver=4,5; Expedited=5; cần xác nhận account |
| UPS-11 | Saver S=20 / 20,5 kg | Tham khảo: tổng 20 / 21 kg; tách khỏi ngưỡng PER_KG |
| UPS-12 | Nhiều Lot trong Order | Cần mapping shipment/Lot trước xác định Ss và W |
| EP-01 | Đúng ngưỡng oversize và lớn hơn nhỏ nhất | Cần threshold/operator/rate chốt; không lấy legacy làm oracle |
| EP-02 | Địa chỉ non-cont và special address | Cần danh sách Supplier chấp thuận, scope phí và coverage |
| EP-03 | Oversize cùng non-cont; Net supplier inclusive | Cần stacking và inclusive-components cuối; kiểm không thu trùng khi rule có nguồn |
| FUL-01 | Purchase hợp lệ, chưa tracking+label | Reserve, chưa charge — CHỐT S2 |
| FUL-02 | Có cả tracking+label; retry sự kiện | Charge đúng một lần và release reserve — CHỐT S2/S1 |
| FUL-03 | Không đủ sức mua/debt quá hạn/account block | Purchase bị chặn — CHỐT S2 |
| FUL-04 | Receive không cân đo | Được phân loại/tiếp tục kho — CHỐT S2 |
| FUL-05 | Đo trội cân trong phạm vi; scan lại | Tự tính phí hợp lệ, không thu trùng — CHỐT S2 |
| FUL-06 | Vượt giới hạn route | Hold, Admin xử lý — CHỐT S2 |
| ADD-01 | Add-on Revenue=500.000, Cost=200.000; sửa Cost=250.000 | GP=250.000, Balance không đổi, có History — CHỐT S1 |
| ADD-02 | Cố sửa Revenue đã ghi nhận | Bị khóa; dùng Balance Adjustment — CHỐT S1 |
| ADD-03 | Adjustment +50.000 cho lỗi Revenue | Balance sửa đúng; Revenue Add-on không tự thành 450.000 — CHỐT S1 |
| ADD-04 | Bổ sung Cost Pending | Được bổ sung và lưu lịch sử; cách biểu diễn GP pending cần nguồn |
| ADD-05 | Sửa cost sau khóa kỳ | Giữ kỳ cũ, chênh cost vào kỳ hiện tại theo S1 |
| ADD-06 | Sales xem Add-on được phân quyền | Thấy Cost/Supplier Add-on; không lộ Net/Supplier vận chuyển — CHỐT S1 |
| LED-01 | Debt=900.000, limit=1.000.000; adjustment debit=300.000 | Ghi nợ 1.200.000; Purchase mới vẫn kiểm limit — CHỐT S1 |
| LED-02 | Retry cùng giao dịch tài chính | Không duplicate — CHỐT S1 |
| REC-01 | Order 3 Lot, thiếu 1 cost | Không Finalized — CHỐT S2 |
| REC-02 | Actual=Estimated và đủ dữ liệu | Auto PASS — CHỐT S2 |
| REC-03 | Actual=Estimated+1 VNĐ | REVIEW, không tolerance tự đặt — CHỐT S2 |
| REC-04 | Admin thu phụ phí có public note, Client chưa trả | Có thể PASS sau ghi nhận khoản thu — CHỐT S2 |
| REC-05 | Phí muộn, kỳ gốc đã khóa | Adjustment có lịch sử/tham chiếu kỳ gốc — CHỐT S2 |
| IMP-01 | Import trùng/unknown tracking, partial lỗi | Cần template và rule import cuối; không tự overwrite |
| RBAC-01 | Sales/Admin vận hành/CSKH truy cập Actual Net/GP-Net | Không trả dữ liệu qua API/UI/export — CHỐT S2 |
| RBAC-02 | Sales truy cập Add-on ngoài scope | Kiểm đúng quyền Add-on; scope cụ thể cần cấu hình phân quyền |
| CAN-01 | Chưa charge và hủy hợp lệ | Release reserve, không refund tiền chưa charge — CHỐT S2 |
| CAN-02 | Cancellation và Claim refund cùng Order | Không hoàn trùng/vượt tổng cho phép — CHỐT S2 |
| CAN-03 | Carrier void thất bại/timeout | Cần policy Supplier trước khi xác định expected credit |

Ngoài ra phải kiểm tra tính nhất quán Balance–Ledger–Reserve–Statement sau các luồng mua, charge, refund và adjustment. Kiểm thử không được coi là đã hoàn tất chỉ vì tài liệu có test cases.

## 15. Known open questions và dữ liệu còn thiếu

| ID | Câu hỏi/dữ liệu cần bổ sung | Phần bị ảnh hưởng |
|---|---|---|
| O-01 | Bản xuất đầy đủ hội thoại S1 trước 5 lượt cuối | Xác nhận toàn bộ Service Architecture V1 và quyết định bị thay thế |
| O-02 | Service Matrix và Fulfillment catalogue cuối | Phạm vi dịch vụ, đơn vị phí, moment charge |
| O-03 | Scope hai markup policies, người review/publish, effective-time và rounding tiền | Giá bán và phân quyền |
| O-04 | Price Proposal: trigger, states, version, reject/withdraw/rollback, concurrency | Review & Publish |
| O-05 | Bảng Rate Card VTT/SDS/JD; Min/Max inclusivity, gaps/overlaps và minimum charge | Lookup UPS |
| O-06 | Zone mapping theo account/service/destination | Tính Net và tối ưu UPS |
| O-07 | Account ↔ Supplier; tie-break và manual override | Optimizer và dữ liệu lịch sử |
| O-08 | Giá trị globals, scope US Broker/Customs, override và auto-apply lên selling/proposal | UPS globals và publish |
| O-09 | Shipment = Lot hay Order; shipment surcharge và carton surcharge gom thế nào | Công thức Net, rounding per Lot |
| O-10 | Rounding carton/shipment áp dụng account nào; rounding dimensions/minimum billable | Cân tính phí UPS |
| O-11 | ePacket oversize: kích thước, cân, toán tử, tier, amount, đơn vị và stacking | Giá ePacket |
| O-12 | Non-cont: coverage Supplier, state/territory list, special address, amount và scope | Giá ePacket/coverage |
| O-13 | Estimated Net ePacket gồm last-mile/mid-mile/kho nào; GP Finalized còn provisional | Reconciliation/reporting |
| O-14 | Credit Term bắt đầu từ đâu, overdue và cửa sổ đối soát | Purchase gate |
| O-15 | Cách chấp nhận measurement khi đo lại | Chống thu trùng/điều chỉnh phí kho |
| O-16 | Ai được xem Net/GP-Net; role riêng hay permission trên Admin | RBAC |
| O-17 | Supplier login: view/upload/edit cost/invoice/claim và masking | Phase Supplier account |
| O-18 | Carrier cancellation/void theo Supplier | Hoàn tiền và vận hành |
| O-19 | Late cost ảnh hưởng commission kỳ nào; ai được re-open kỳ | Finance/commission |
| O-20 | Import template, duplicate matching, validation và batch behavior | Import/reconciliation |
| O-21 | Add-on creation gate, zero/negative Revenue, cancel/delete và Pending GP | Add-on |
| O-22 | Currency cutover/migration và bằng chứng xác nhận tỷ giá gốc | Dữ liệu VNĐ và lịch sử USD |

### 15.1. ePacket non-cont: phân biệt tham khảo và quyết định

S4 có câu trả lời liệt kê `AK, HI, PR, GU, VI, AS, MP` là nhóm địa lý tham khảo; `AA, AE, AP` là địa chỉ quân đội cần rule riêng. Câu trả lời đề xuất phí 15 USD/order chỉ **nếu Supplier xác nhận**. Không có lượt Owner phê duyệt danh sách/mức tiền đó cho V1 trong nguồn đọc được. Vì vậy tài liệu không đưa 15 USD hay bản quy đổi VNĐ vào bảng phí áp dụng.

### 15.2. Nội dung để sau có nguồn

- Revenue Correction chuẩn hóa của Add-on; không trì hoãn Add-on cơ bản vì hạng mục này.
- Mid-mile allocation engine cùng Cargo; Supplier account build theo phạm vi S2.
- East/West US và mua last-mile label carton Eco.
- Cash-flow/quỹ/runway, VAT và tư vấn thuế theo phase phù hợp.

## 16. Điều kiện sử dụng để triển khai và bàn giao tiếp

Các rule **CHỐT** có thể dùng làm yêu cầu nghiệp vụ trong phạm vi bằng chứng nêu rõ. Các mục **GHI NHẬN QUA AUDIT** cần đối chiếu bản quyết định gốc khi làm phần phụ thuộc; các mục **THAM KHẢO/ĐỀ XUẤT** không được âm thầm đưa thành policy đang hoạt động.

Bản này đã bao phủ mọi nhóm người dùng yêu cầu dưới dạng rule có nguồn hoặc khoảng trống được chỉ rõ. Nó chưa thay thế được lịch sử bị thiếu, không xác nhận code/test/deploy hoàn tất và không tự bổ sung giá trị bảng giá. Sau khi có bản xuất hội thoại đầy đủ, cần cập nhật chính tài liệu này, ưu tiên quyết định cuối và bỏ khỏi phần áp dụng những phương án đã bị thay thế.

---

**Hết tài liệu.**
