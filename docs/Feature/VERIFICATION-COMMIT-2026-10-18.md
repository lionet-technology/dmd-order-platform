# DMD Report — Kiểm chứng trước commit, 18/10/2026

## Phạm vi và Git
Repository thực: /Users/quan/Desktop/report, branch main. Baseline local/remote đã kiểm tra trực tiếp bằng ls-remote: cebd0582656220170e88fbcdcc934f91c71153c3 (08/10/2026).
Đây là commit phát triển đã kiểm tra local, không phải biên bản nghiệm thu production GĐ1. Không deploy hoặc mở/migrate DB vận hành.
Các thay đổi local từ những lượt trước (Debt, Reconciliation, Cancellation, Warehouse, FAILED, Supplier Payables và Feature docs) được giữ và kiểm chứng cùng thay đổi mới; không stage Codex/, DB, cache hoặc .env.

## Quyết định Owner trong lượt này
- D25: role BOD/FINANCE riêng, được xem/nhập cost, đối soát, invoice/payment Supplier; không có quyền Admin khác.
- D26: nhập Base Rate được Owner duyệt; chặn mua khi chưa cấu hình. Không tự chuyển Net thành Base Rate vận hành.

## Đã sửa và đối chiếu
- Thêm role riêng; migration schema bảo toàn mọi cột user, ID, session, index và FK. Không tự cấp quyền. Chỉ Root Owner quản lý tài khoản tài chính.
- Costs/Reconciliation/Payables và import Excel costs được kiểm tra server cho BOD/FINANCE. Finance không sửa Client wallet, user, route hoặc import Orders/Balance/Tracking.
- 46 API JSON routes dùng chung projection ngăn lộ Net/GP/margin/snapshot/coverage và audit ADMIN; lọc cả JSON lồng dạng chuỗi. Ngăn Supplier Net trong Excel placeholder và chặn placeholder ngoài allowlist.
- Ghi chú có timestamp dạng [10:00] được giữ, không bị nhầm thành JSON.
- Base Rate độc lập đã có cho adapter ePacket Standard/Eco DMD. Owner nhập/activate version; Net-only version không được dùng cho Purchase mới. Đổi Net không đổi Base/Retail/Sales Price. Snapshot lịch sử giữ nguyên.
- CSV config vận hành không trả Net. Bảng giá fixture chỉ dùng trong DB test; seed không tự sinh Base Rate vận hành.
- Màn BOD/Finance riêng: Cost (manual/Excel), Lot Reconciliation và GP-Net tạm tính/chốt có coverage, Payables. Admin/Sales/Client không có các module Supplier. Client không thấy nút sửa đơn đã mua.
- Lint bỏ thư mục bản sao lịch sử Codex/ 3,3 GB, đồng nhất phạm vi app với TypeScript; không bỏ kiểm tra source đang chạy.
- Thêm npm test chạy 17 suite domain trên DB riêng; runner bỏ DMD_DB_PATH/DMD_VERIFY_DB kế thừa để không nhận nhầm DB của operator.

## Kết quả automated checks
| Suite domain | Checks/assertions |
|---|---:|
| RBAC API | 65 |
| Operations/Warehouse/Claims | 72 |
| Purchase Engine | 45 |
| Order Flow | 25 |
| Credit | 48 |
| Balance idempotency | 6 |
| Debt/Reconciliation/coverage | 58 |
| Domain Finance | 69 |
| ePacket | 159 |
| Manifest Cartons | 57 |
| Route Segmentation | 36 |
| Supplier Payables | 51 |
| Legacy Cancellation | 128 |
| Migration fixture | 14 |
| Template download | 23 |
| Release gates giá/quyền | 92 |
| SLA/demo và reset safeguards | 47 |
| **17 suite domain** | **995** |

| HTTP suite trên production build local / DB test | Checks/assertions |
|---|---:|
| Orders | 32 |
| Finance | 19 |
| Operations | 23 |
| Cancellation | 86 |
| Order acceptance | 42 |
| Excel imports | 20 |
| Order validation | 8 |
| Manifest Scan/Export | 16 |
| **8 suite HTTP** | **246** |

**Tổng: 1.241 checks/assertions trong 25 suite**; chỉ tính lần cuối đạt của mỗi suite, không cộng retry. Các suite có phạm vi giao nhau; tổng số không chứng minh toàn bộ nghiệp vụ GĐ1 hoàn tất.
Lint: PASS không warnings. TypeScript --noEmit --incremental false: PASS. Next production build: PASS (37 static pages). git diff --check: PASS.
Bốn file type generated có hậu tố “ 2.ts” trùng byte với bản gốc trong .next/types đã được xác nhận và dọn; không đổi tsconfig để che lỗi và không sửa source bằng cách bỏ typecheck.
Heuristic review staged không có P1/P2; có hai P3: module Reconciliation dài và không ghép được tên test Operations UI theo heuristic. Reconciliation có domain/HTTP tests; Operations có 72 domain và 23 HTTP assertions. Shipment structure và mutation responses có assertions chống lộ Net trong release-gates. Đây không phải chứng nhận security audit đầy đủ.
Scan source src/ (77 file) không có hit. Security scanner toàn diff đánh dấu password literals của test/demo; đây là credentials giả lập trong scripts, không phải bằng chứng lộ tài khoản vận hành. Không đưa .env hoặc DB vào commit.

## UI đã quan sát
- Finance login, Cost list, nhập Excel fixture 12,50 USD và thông báo nhập 1 dòng.
- Payables: tạo invoice giả lập 125 USD, ghi nhận thanh toán 25 USD, còn 100 USD; tải lại trang vẫn giữ lịch sử. Không có chuyển tiền thật.
- Admin, Sales, Client: Orders đúng role, không có Net Cost/GP-Net hoặc module Supplier; API tests xác minh bằng dữ liệu cost khác null, không chỉ dựa việc ẩn UI.
- Mobile Finance viewport 390 px: page width 390, bảng có scroll riêng. Desktop 1280 px.
- Reconciliation phân biệt chi phí estimate/actual và GP chưa chốt. Chưa phải UAT mọi module/tuyến/thiết bị.

Ảnh bằng chứng được giữ ở workspace cuộc kiểm tra:
dmd-finance-ui-test.jpg, dmd-finance-mobile-test.jpg, dmd-admin-orders-test.jpg.
Không đưa các ảnh UI fixture vào source hoặc coi chúng là chứng từ Supplier thật.

## Đối chiếu tài liệu nguồn
sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md trong project mirror được đọc và giữ nguyên. Bản đó chưa chứa D24 Supplier Payables nội bộ và D25/D26 của lượt này. Canonical hiện hành là docs/Feature/OPERATIONAL-FLOW.md cùng Decisions, feature 01/03/09/13 và báo cáo này; báo cáo 13–16/10 là lịch sử.

## Chưa xác minh / blockers trước production
1. Gate Base Rate và adapter cho UPS/Yun/custom manual chưa hoàn tất. Không coi mọi route đã đáp ứng D26; không nghiệm thu GĐ1 dựa test ePacket.
2. Chưa có bảng giá Owner thực tế, policy Supplier và mapping chứng từ cost/coverage/FX. Không activate fixture demo để vận hành.
3. Credit Term/overdue trong cửa sổ đối soát tuần vẫn cần Owner chốt chính xác.
4. Cân đo auto chỉ adapter ePacket có version khóa; các route còn lại và reroute/label/return end-to-end chưa nghiệm thu.
5. Carrier void label, failure/timeouts và cancellation policy từng Supplier cần xác nhận thật.
6. Chưa rehearsal backup/migration/rollback trên bản sao DB thật; chưa chứng nhận mọi lịch sử, custom trigger, FX, đóng kỳ/commission/export/report.
7. Actual Cargo/Mid-mile allocation và Supplier portal/login vẫn deferred. BOD report và Sales GP-Base/commission cần acceptance riêng.

## Thứ tự tiếp theo
- Owner cung cấp bảng Base Rate/policy/chứng từ thực và quy tắc Credit Term còn mở.
- Hoàn thiện adapter/gate route manual; UAT ePacket/UPS/khách công nợ theo role.
- Rehearsal migration/rollback trên DB staging được cấp, đối chiếu balance/ledger/cost/GP trước-sau.
- Chỉ sau các gate trên mới quyết định triển khai vận hành. Commit/push hiện tại không thay thế các gate này.
