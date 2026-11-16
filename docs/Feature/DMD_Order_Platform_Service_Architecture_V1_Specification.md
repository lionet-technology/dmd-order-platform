## Current requirements — handoff 16/11/2026
[Canonical full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) and [audited HEAD gaps](31-service-v1-build-gap.md) supersede contrary dated requirements below. Earlier dated sections are historical where inconsistent, not concurrent current rules.
- APPROVED: cancellation policy per Service/Sub-Service/Supplier route; no global 90/100. Admin may support 100%, never bypass shipment denial. Claim refund is separate. Combined Duplicate uses policy with optional Admin support, not unconditional 100%.
- APPROVED: Edit Order shipping/service only before any Tracking OR Label; separate manual Edit Selling Price offer and Add Tracking/Label. Selling correction after charge appends delta/history without reopening Purchase.
- APPROVED: Add-on revenue correction replaces old absolute revenue lock. Financial posting/adjustment may exceed Credit Limit without creating Debt; Purchase still gates funds.
- APPROVED: VND fractional values retained; UPS divisor 5000, bands (min,max], priority SDS→VTT→JD. Global FX/UPS variables update new Net/Base/Retail without promoting pending account versions.
- IMPLEMENTED / STAGED / MISSING: use the linked HEAD gap, not old baseline tables. Operational USD is not VND simply by changing labels. OPEN supplier policy values, ePacket FX/fee relation, source price/zone validation and manual-offer service change stay OPEN.

# DMD Order Platform — Service Architecture V1 Specification

Cập nhật 14/11/2026. [Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md) là nguồn ưu tiên; [bản phục hồi chi tiết trước chuẩn hóa](archive/SERVICE-V1-RECOVERY-2026-11-13.md) giữ nội dung nguồn/tham khảo, không phải trạng thái hiện hành.

## CONFIRMED — Owner continuation 14/11/2026 (supersedes older OPEN labels)
Source: direct Owner request in the current continuation of chat 6ad35267-1ad8-83ec-a691-9d80c58281df.
- UPS Express/Saver: round each carton actual/dimensional up to 0.5kg, take the carton maximum, sum cartons; Lot ≤20kg rounds up to 0.5kg. Expedited rounds carton/Lot up to 1kg. Every Lot >20kg rounds up to 1kg. Dimensional divisor remains an explicit input; no new divisor decision is inferred.
- UPS Rate Card: FIXED ≤20kg; PER_KG ≥21kg, bands 21–44, 45–70, 71–99, 100+. Unit must match billable weight; do not multiply the whole NetCost by weight. Exact Excel tiers/zone mapping and missing/overlap handling require source validation; optimizer ties still reject.
- Broker = 3% of discounted UPS transportation Net (Td); Customs = 10,000 VND/kg. Both remain Global variables under explicit save/confirm/versioning, not per-account constants or silent seeds. Destination scope beyond the existing US formula remains OPEN.
- ePacket oversize uses longest side >55cm and >75cm (strict comparisons); non-cont: AK HI PR GU VI AS MP AA AE AP. Actual VND surcharge amounts/approved USD conversion and inclusive supplier components remain OPEN. No amount is inferred.
- UPS Shipment Surcharge once per Lot.
- Owner follow-up: complete work independent of actual rate cards first; Excel/rate-dependent work deferred for later input.

## 1. Bằng chứng và trạng thái
CONFIRMED = quyết định trực tiếp Owner hoặc APPROVED trong Operational Flow chưa bị thay thế. CURRENT = code-audited, không tự chứng nhận tests/production. PROPOSED = phương án chưa duyệt. OPEN = thiếu quyết định hoặc số liệu. Không dùng lời của trợ lý để thay phê duyệt.

Nguồn: yêu cầu Owner phiên này; chat 6ad35267-1ad8-83ec-a691-9d80c58281df (5 lượt, hasMore=false); công thức UPS 6af5587f-90ac-83ec-856e-2562aa9b8da3 (5 lượt); phụ phí UPS 6af4441f-5c24-83ec-9175-51b33810f336 (2 lượt); bản read-only sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md. /mnt/data chưa truy cập để đối chiếu byte. Không khẳng định đã phục hồi 100% lịch sử.

## 2. Service Matrix — CONFIRMED
| Service | Route/market | Pricing/fulfillment |
|---|---|---|
| ePacket Standard/Eco DMD US | Tách full route Standard/Eco | VNĐ; oversize/non-cont theo bảng đã duyệt, chưa có số liệu cuối; reserve→tracking+label charge |
| ePacket EU | Route/supplier EU, SGB theo Operational Flow | Không dùng bảng US cho EU |
| YunExpress | Route/market/supplier riêng | Không fallback bảng ePacket; chỉ bật adapter có đủ cấu hình |
| UPS | Account VTT/SDS/JD; Supplier route tách khỏi carrier account | Full Net rồi tối ưu; nhiều Carton/Lot; round theo Sub-Service |
| Chuyên tuyến | Case-by-case, Supplier bắt buộc | Cấu hình/manual theo rule được duyệt |
| Fulfillment | Quy trình xử lý Order/bàn giao Supplier | Purchase → Tracking/Label → Manifest/bàn giao, dùng luồng vận hành hiện có |
| Client Add-on | Phạm vi Client/Add-on được cấp | Revenue khóa, Cost/Supplier/Note sửa có history |

Một Order một địa chỉ, nhiều Lot/Carton; n Lot cần n tracking tính phí/cost, không thêm xác nhận tracking đại diện. Không đồng nhất Supplier DMD/SGB/SBay với account VTT/SDS/JD.

## 3. Service Configuration
CONFIRMED: danh tính Service+Sub-Service+Supplier; Client chỉ thấy dịch vụ được cấp và discount riêng. Lifecycle/Hold, route market/limits, tracking/label, cancellation và templates phải nhất quán. Cân đo thủ công tùy chọn; giữ declared/measured riêng. Hàng khó phải kiểm Supplier theo route. Không kích hoạt giá mẫu hay đổi Supplier của Order lịch sử.
CURRENT baseline 2302d06: service_route_configs, route_lifecycle, route variables, carton policy, cancellation/segmentation, client_service_settings đã tồn tại. Policy adapter hiện hardcoded, chưa có unified V1 configuration.
OPEN: capability/market tables thực tế, ma trận quyền cấu hình chi tiết.

## 4. Pricing Markup, Review & Publish
CONFIRMED:
```text
Base = Net × (1 + NetCostMarkup)
Retail = Base × (1 + BaseCostMarkup)
Sales = Retail × (1 − ClientDiscount)
```
Tỷ lệ dạng thập phân. Ví dụ minh họa 100.000×1,10×1,20×0,95 = 125.400 VNĐ; không phải bảng giá.
Hai markup đều Review & Publish; Net/Account changes Review & Publish. Pending không tham gia giá bán. Giữ Published V1, tính Proposal V2, Admin publish. Tách version Net hiện hành khỏi selling published. Snapshot đã mua bất biến; Actual Supplier Cost không sửa giá khách.
CONFIRMED — Owner 14/11: không làm tròn tiền VNĐ, giữ phần thập phân qua Base/Retail/Sales và tổng cuối; không ép về đồng hoặc cents. Không thay rounding cân UPS.
OPEN: scope từng component/discount; publish nguyên khối hay một phần; effective-time/rollback/tie-break proposal. Implementation phải lưu actor/version/thời gian, kiểm stale/concurrent publish và retry.
CURRENT: route-pricing.ts yêu cầu Base Rate độc lập, cấm base_markup khác 0, currency USD; chưa V1. Không sửa đơn USD thành VNĐ bằng đổi nhãn.

## 5. UPS
### Account/zone/rate — CONFIRMED
Account VTT/SDS/JD. Rate card: Account, Sub-Service, Zone, Min kg, Max kg, Rate, FIXED/PER_KG.
FIXED: T=Rate. PER_KG: T=Rate×W. Không hardcode W>21 để đổi đơn vị.
Tính đủ Net của từng account đủ điều kiện trước tối ưu, không chọn bằng transportation đơn thuần. Thiếu zone/rate không được dùng giá 0 hay fallback account khác bằng suy đoán.
OPEN: Excel rate/zone gốc, inclusivity Min/Max, gaps/overlaps, account-supplier mapping, tie-break/manual override.

### Công thức — nguồn trực tiếp user turn 7cbdd8fd-84de-4e09-b3d0-b13c83f689b6
```text
Td = T × (1 − ND)
NetCost = (1+Fuel) × (1+VAT)
          × [Td + ShipmentSurcharge×(1−SD)
                + WeightSurcharge×(1−WD)×W]
          + USBroker×Td + CustomsPerKg×W
```
Tỷ lệ dạng thập phân; Rate/shipment hoặc Rate/kg; W kg; ShipmentSurcharge VNĐ/shipment; WeightSurcharge và Customs VNĐ/kg. Không nhân W vào toàn NetCost. Nếu rate đã discount thì không discount lần hai.
CONFIRMED — Owner 14/11: một UPS shipment là một Lot; Shipment Surcharge áp một lần mỗi Lot. Order DMD là đơn khách gửi tới một địa chỉ, nhiều Lot thì tính riêng từng Lot rồi cộng tổng, không thu một lần cho cả Order hoặc theo số carton.
OPEN: phạm vi US Broker/Customs theo destination; component inclusive/exclusive. Owner continuation đã xác nhận Broker 3% Td và Customs 10.000 VNĐ/kg; giữ Global confirm/version, không tự seed.

### Rounding
CONFIRMED: từng carton trước, cộng Lot, policy theo Sub-Service.
CONFIRMED Owner continuation: Express/Saver carton actual/dim UP 0,5kg, max từng carton, cộng Lot ≤20kg UP 0,5kg, >20kg UP 1kg; Expedited UP 1kg carton/tổng. Không max hai tổng actual/dim. Divisor 5.000 trong nguồn cũ chưa nâng thành quyết định mới; caller phải cung cấp divisor đã xác minh.

### Global variables
CONFIRMED: Fuel/VAT/US Broker/Customs auto apply sau xác nhận; save/upload chưa apply. Không lẫn account draft Pending. Lưu actor/time/version; không reprice snapshot đã mua.
OPEN: scope thị trường/ngày, override account, tác động selling published, quote invalidation cụ thể cần integration.
PROPOSED: AHC/LPS/OMS trong chat UPS nội địa US; không activate ngưỡng/mức USD đó cho DMD quốc tế.

## 6. ePacket VNĐ
CONFIRMED: code VNĐ; Standard/Eco và EU dùng route riêng; oversize/non-cont cần rule cuối theo supplier, không double count inclusive Net. Không suy số từ ảnh/PDF.
CURRENT: epacket-pricing.ts adapter DMD US USD, 1 carton, ≤10kg; tier/volumetric/oversize/non-cont hiện hành là code cũ, không phải V1 VNĐ.
OPEN: Excel Net VNĐ chuẩn, Base/markup inputs, mức VNĐ/FX cho ngưỡng oversize >55/>75cm đã chốt, coverage Supplier cho danh sách non-cont đã chốt và phí chính xác, provisional mid-mile components. Danh sách USPS/15 USD trong câu trả lời trợ lý không thay bảng DMD.

## 7. Fulfillment — quy trình xử lý Order và bàn giao
CONFIRMED — Owner 14/11: Fulfillment ở đây là quy trình Order → mua dịch vụ Supplier → Tracking/Label → Manifest/bàn giao. Không yêu cầu catalogue dịch vụ kho tính phí riêng để hoàn thành phạm vi này.
CONFIRMED từ Operational Flow: reserve khi mua, charge một lần tracking+label; lỗi mua release/rollback. Hold, route active, Client scope, credit và overdue Debt vẫn chặn; Client quote consent và snapshot bất biến.
Kho Receive→optional measure→full-route classification→Carton/Bag Close→Manifest→Outbound. ePacket Standard/Eco riêng; EU/Yun→SGB, UPS→SBay theo route. Trội cân trong giới hạn tự phụ phí có chống trùng; vượt giới hạn Hold. Supplier cost per Lot; Actual>Estimated luôn Review; đủ mọi Lot mới Finalized.
OPEN: chi tiết tích hợp/bàn giao Sheet/Zalo/PDF nếu cần theo Supplier. Nghiệm thu luồng Fulfillment hiện có với giá V1 và từng Lot; không coi xác nhận phạm vi là nghiệm thu code. Cargo/ETD engine và mid-mile allocation/usage services vẫn deferred theo nguồn chưa bị thay thế.

## 8. Client Add-on / ledger / quyền
CONFIRMED: Revenue ghi một lần và khóa, Cost pending khác finalized zero. Cost/Supplier/Note sửa được theo scope, có history/stale protection; sửa Cost đổi GP, không đổi Balance. Sales nhập Cost/Supplier riêng Add-on, không mở Cost/Net vận chuyển. Client API/export/history không lộ dữ liệu nội bộ.
Balance Adjustment cho phép vượt limit, có actor/reason/reference/history; không tăng Credit Limit, không bỏ Purchase gate và không đổi Revenue/GP Add-on. Không dùng Adjustment làm Revenue Correction.
Retry/idempotency, nguồn duy nhất, transaction rollback và closed-period reporting phải kiểm chứng. Supplier BUY/SELL hiện hành không phải Client Add-on V1.
OPEN: permission create/revise chi tiết, cost pending/reporting kỳ đã khóa và Revenue Correction workflow khi cần sửa doanh thu.

## 9. Currency/data safety
CONFIRMED: ePacket VNĐ; old demo/test có thể migrate hoặc reset sau xác minh target. Không cố bảo toàn mọi demo. Không reset/migrate production hay target chưa xác minh; không trộn VNĐ vào ledger USD.
Tỷ giá 25.910 chỉ có ghi nhận audit cũ, không có lượt user gốc trong nguồn hiện tại; không tự quy đổi rate thật. Nếu chọn reset sandbox, không cần giả định tỷ giá.
Rehearsal phải dùng bản sao/disposable DB: target path, environment, row counts, FK/integrity, balances/reserves/ledger/statement/snapshots trước-sau, retry/rollback. Chưa chạy cutover.

## 10. Gaps, tests và rollout
[Feature 23](23-service-architecture-v1.md) chứa source audit và acceptance matrix. Ưu tiên Configuration → Pricing/Publish → UPS → Fulfillment → Add-on/ledger; feature docs cập nhật cùng commit. Tests dùng Node/SQLite cùng kiến trúc, lưu bằng chứng và commit; không Jenkins.
Chỉ chặn phần phụ thuộc Excel/rule thiếu; configuration/versioning/permission scaffolding có thể làm trước. Không báo V1 hoàn thành/push/production nếu chưa có bằng chứng.
