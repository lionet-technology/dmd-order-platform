# Giai đoạn 1 · Trạng thái hoàn thiện và quyết định nghiệp vụ tiếp theo

Rà soát ngày 18/11/2026. Điểm xuất phát `92250ef` trùng local HEAD, origin/main và main trên GitHub. Phạm vi chính là tài khoản VNĐ mở mới. Nguồn giá `docs/data/service-v1/net-cost-final-2.xlsx` giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Các trạng thái ngày cũ trong Feature 31 và index phải đọc cùng các đợt triển khai 33–42.

Thứ tự công việc đã thống nhất gồm hoàn thiện nền GĐ1 và hồi quy kỹ thuật, chốt ngay các quyết định nghiệp vụ dưới đây, chỉnh UI/UX, rồi UAT và bàn giao Admin.

## Hiện trạng theo luồng

| Trạng thái | Luồng và phạm vi | Đối chiếu code và hồi quy |
|---|---|---|
| PARTIAL | Client tạo Draft VNĐ cho ePacket/Yun/UPS được cấp với giá đã Publish, hoặc Chuyên tuyến. Purchase VNĐ tự động tính giá theo shipment và giữ snapshot. Manual offer đã nối consent và Reserve. Sau khi lưu Draft tự động, Client thấy giá VNĐ và đặt mua trực tiếp; giá đổi trước lúc xử lý phải xác nhận. Preview trước khi lưu mới xác thực dữ liệu. Admin có thể nhập Net/Base thủ công trước khi Reserve cho Chuyên tuyến. Tổng Estimated Net trên Order nhiều Lot chưa phân bổ. | `api/client-orders`, `service-v1-order-quote.ts`, `ups-vnd-quote.ts`, `vnd-operational.ts`. `verify-final-source`, `verify-vnd-auto`, `verify-vnd-continuation`, `e2e-vnd-v1`. [Feature 33–35](35-service-v1-completion.md) |
| COMPLETE | Purchase VNĐ → consent/override → Awaiting Funds/FIFO → Reserve nguyên tử → Charge một lần khi đủ Tracking + Label → Ledger VNĐ. Posting vượt hạn mức giữ Reserve và không tự sinh Debt. Manual Debt riêng. | `vnd-operational.ts`, `vnd-debt.ts`, Tracking handlers. `verify-vnd-operations`, `verify-shared-funds-race`, `verify-vnd-financial-cutover`. |
| COMPLETE | Edit trước khi phát hành, đổi service sau manual offer cần lựa chọn tường minh, correction sau Charge, Cancel & Duplicate theo policy. Mã thay thế đã tồn tại bị từ chối; draft hiện hữu và đơn gốc được bảo toàn. | `vnd-shipping-edit.ts`, `vnd-duplicate.ts`, `order-cancellation.ts`. `verify-vnd-continuation`, `verify-supplier-cancellation`. |
| COMPLETE | Client surcharge/tax Excel theo Order ID hoặc Tracking, chỉ ghi vào đơn VNĐ đã Charge và chưa hủy; mỗi dòng có tham chiếu riêng. Nhập lại qua định danh khác vẫn chống ghi tiền lần hai. | `api/service-v1/charges-import`, `vnd-operational.ts`. `verify-vnd-charge-import`, `e2e-vnd-v1`. [Feature 40](40-vnd-post-shipping-import-reconciliation.md) |
| PARTIAL | Invoice/Actual theo Lot, TOTAL/SUPPLEMENT, review trùng và unmatched, payable theo delta, payment, điều chỉnh, Claim receivable và kỳ Supplier đã nối. Template Excel có phiên bản theo Supplier × Service/Sub-Service, tổng hoặc nhiều cột cấu thành. Còn pilot chứng từ thật. Đã có [Supplier Add-on BUY/SELL VNĐ](19-supplier-accounts.md#supplier-add-on-vnđ-thủ-công). Thuế Supplier/pass-through và chứng từ đi qua nhiều journal còn chờ rule. | `vnd-supplier-import.ts`, `vnd-supplier.ts`, `vnd-supplier-claims.ts`. `verify-vnd-supplier`, `verify-vnd-supplier-import`, `verify-vnd-supplier-claims`. |
| COMPLETE | Client/Supplier Claim từ một đến nhiều Order, watchlist, Processing, Complete kể cả 0, link thủ công, thực thi từng phần Bank/Balance hoặc Bank/Offset, chống vượt duyệt và ghi đôi. Cancellation độc lập, theo route, với Supplier follow-up thủ công. | `vnd-refunds.ts`, `vnd-supplier-claims.ts`, `vnd-claim-cases.ts`, `supplier-cancellation.ts`. `verify-vnd-refunds`, `verify-vnd-supplier-claims`, `e2e-vnd-v1`. [Feature 42](42-vnd-claim-refund-next.md) |
| COMPLETE | Credit Term theo tuần và Weekly Statement Client VNĐ. Scheduler chốt thứ Hai–Chủ nhật, chốt bù kỳ thiếu và giữ snapshot đã khoá. Cảnh báo số tuần quá hạn hiện ở dashboard Client và sổ VNĐ. | [Feature 44](44-vnd-credit-term-weekly-statement.md). `verify-vnd-weekly-statement`, `verify-vnd-financial-cutover`, `e2e-vnd-v1`. |
| COMPLETE | Supplier close lưu snapshot bất biến. Điều chỉnh Supplier ghi vào kỳ hiện tại, có tham chiếu kỳ gốc khi phù hợp. | `vnd-supplier-periods.ts`, `verify-vnd-period-close`. |
| PARTIAL | Báo cáo BOD theo kỳ mua và nhóm Sales/Client/Service/Supplier, cash theo thời điểm ghi, GP-Net trước Client Refund, commission tham khảo. Claim giao nhóm giữ nguyên tổng cấp Claim và gắn cờ; chỉ tiêu hậu Refund chưa đủ cơ sở trả về null. Còn thiếu tổng hợp xu hướng nhiều tháng trong luồng VNĐ, và cần chốt quyền cấu hình/cancellation chưa thống nhất. | `vnd-reporting.ts`, `vnd-commission.ts`, `vnd-access.ts`. `verify-vnd-commission`, `verify-rbac`, `verify-vnd-exceptions`, `e2e-vnd-v1`. [Feature 41](41-vnd-supplier-period-gp-control-tower.md) |
| MISSING | Payable/Actual và receivable chưa có tham chiếu chứng từ tài chính dùng chung để nhận diện cùng khoản điều chỉnh xuyên hai journal. Link Claim Client–Supplier hiện có chỉ nối hai case qua Order chung. | `vnd_supplier_ledger`, `vnd_supplier_claim_events`, `vnd_claim_links`; xem quyết định về credit note bên dưới. |
| PARTIAL | Kho/Manifest, Emergency Hold và Internal Expense có luồng hiện hữu cùng suite riêng. Ma trận kỹ thuật đợt này xác nhận đường tiền VNĐ từ Tracking đến Charge; ca đổi sang Supplier khác sau Tracking/Label đã kiểm chứng. Còn mở thay Tracking, đổi cùng Supplier và xử lý chứng từ tuyến cũ tới trễ. | `verify-manifest-cartons`, `verify-emergency-hold`, `verify-internal-expenses`, `verify-vnd-operations`. |

Riêng tài khoản USD cũ, giữ nguyên sổ và yêu cầu đối chiếu trước khi thay đổi phạm vi kích hoạt. Chưa có chứng cứ pilot bằng chứng từ thật, restore tại môi trường triển khai non-production hoặc UAT vận hành.

## Quyết định phải chốt ngay sau GĐ1

| Ưu tiên | Quyết định và câu hỏi | Tác động và cách xử lý hiện tại |
|---|---|---|
| P0 | **GP-Net sau Refund nhiều Order.** Chốt cách kết hợp phân bổ Claim, Actual và các khoản thu hồi Supplier trong báo cáo GP-Net. | Hoa hồng dùng phân bổ Order đã chốt của từng quyết định theo [Feature 45](45-vnd-monthly-commission-closing.md). Báo cáo GP-Net hiện dùng cơ sở trước Client Refund. |
| ĐÃ CHỐT | **Commission sau Refund.** Hệ thống tự khóa snapshot tháng lịch giờ Việt Nam. Claim áp dụng khi có quyết định kèm phân bổ, theo tháng quyết định. Phần chênh lệch ghi vào kỳ mới, kèm kỳ mua gốc. | [Feature 45](45-vnd-monthly-commission-closing.md). Chi trả theo dõi riêng. |
| P0 | **Supplier void/cancellation.** Với từng Service/Sub-Service/Supplier, mốc trước ETD/bàn giao, điều kiện void, tỷ lệ hoặc số tiền, bằng chứng carrier, người xác nhận và cách xử lý denied/expired là gì? | Refund Client theo policy cấu hình; hàng đợi Supplier ghi bằng chứng và lựa chọn thủ công. Tuyến thiếu policy không có giá trị mặc định. |
| P0 | **Credit note Supplier xuyên Actual/payable/receivable.** Dùng khóa chứng từ và dòng nào? Trường hợp nào điều chỉnh Actual/payable, thu receivable qua Bank hoặc offset, và cách sửa sau khi khóa kỳ? | Tránh ghi cùng khoản giảm chi phí hai lần. Actual đã duyệt, thu tiền và offset ghi ở journal riêng; chưa tự nối hoặc tự chuyển sổ. |
| P1 | **Quyền nhạy cảm.** BOD có quyền thực hiện Cancel & Duplicate/Edit thay Admin không? Quyền cấu hình giá, publish và toàn cục chỉ root hay giao thêm Admin/BOD theo phạm vi nào? | Đăng ký quyền thực tế trước bàn giao. Giữ các kiểm tra role hiện có trong lúc chờ chốt. |
| P1 | **Thuế/chứng từ Supplier và dữ liệu tuyến.** Thuế pass-through cần hạch toán riêng theo mã khoản nào? Ai xác nhận mapping file, rate/zone/cap và dữ liệu thực dùng để publish tuyến? | GP, payable, invoice và lỗi missing rate. Client surcharge/tax và Supplier commercial supplement là hai luồng đang hoạt động; giữ thiếu cấu hình dữ liệu ở trạng thái pending. |

Nguồn quyết định hiện hành gồm [Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md), [Handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md), [Source Index](SERVICE-V1-SOURCE-INDEX.md) và [Claim NEXT](42-vnd-claim-refund-next.md). Phí ePacket VNĐ cố định, Net ePacket Standard/Eco đã gồm mid-mile + last-mile và lựa chọn giá khi đổi Service sau manual offer đã được chốt.

## Kiểm chứng kỹ thuật

[Ma trận, nhật ký và kết quả Chrome/restore TEST](../../artifacts/gd1-regression-2026-11-18/VERIFICATION.md).

## Đợt audit tiếp theo · 18/11/2026

Đã xác minh local HEAD, origin/main và GitHub main tại `145b5552445a26db5681f2d9c2694e9665d42da6`. Rà soát Emergency VNĐ cần tách Actual dùng cho tuyến hiện hành khỏi lịch sử payable của từng Supplier. Các quyết định P0 phía trên tiếp tục OPEN.

- **Chuyên tuyến.** Admin có thể lưu Estimated Net và Base VNĐ cùng offer trong lúc Order chờ mua. Hai giá trị đi theo cặp, giữ số lẻ và lưu vào snapshot dùng cho báo cáo. Ca nhiều Lot giữ tổng cấp Order, chưa tự phân bổ. Offer cũ vẫn xử lý được khi thiếu Net/Base. Thay Net/Base mà giữ Selling không yêu cầu xác nhận giá lại.
- **Emergency VNĐ.** Khi đổi sang Supplier khác, báo cáo tìm Actual của Supplier hiện hành. Review và payable tính delta trên Actual cũ của cùng Supplier, giữ bút toán Supplier trước. Chứng từ mới chờ Finance/BOD duyệt. Giữ mở ca đổi tuyến cùng Supplier hoặc quay lại Supplier cũ, chi phí còn treo trên tuyến cũ trong GP và phương án nhập Estimated Net VNĐ vào Emergency.
- **Supplier, Statement, báo cáo.** Template chuẩn tiếp tục dùng được. Mapping Supplier/Service cần mẫu chứng từ và định danh cột. Feature 19 xác nhận hướng BUY/SELL từ phía DMD, song còn phải đối chiếu cách nối sổ VNĐ và phạm vi báo cáo. Chốt Statement thủ công đã có. Chưa có lịch tự chốt và báo cáo chuỗi nhiều tháng.
- [Báo cáo audit và kết quả TEST](../../artifacts/gd1-audit-2026-11-18/VERIFICATION.md).

## Tiếp tục GĐ1 · 19/11/2026

Owner đã chọn phân bổ Refund tự động, doanh thu ròng có thể âm và hoa hồng từng Order tối thiểu 0. Lát đầu lưu allocation bất biến tại quyết định Claim, xem [Feature 42](42-vnd-claim-refund-next.md). Báo cáo BOD có số liệu live sau Refund theo Order. Excel BOD có chi tiết theo Sales/Order và đối chiếu delta theo tháng duyệt, tách kỳ mua hiện tại và quá khứ. Khoá quyết toán hoa hồng, tổng hợp điều chỉnh vào số phải trả và pilot còn mở.

Những quy tắc đã duyệt còn chờ triển khai hoặc xác minh gồm nhập chi phí và giá Chuyên tuyến theo Order hoặc Lot; lựa chọn giữ giá offer hoặc dùng giá tự động khi đổi dịch vụ; đối soát Supplier void/Emergency; và Add-on Supplier thủ công. Module Credit Note riêng được hoãn, tham chiếu chống ghi trùng vẫn thuộc phạm vi.

## Xác nhận quy tắc phần vượt Refund · 19/11/2026

Claim nhiều Order dùng số khai báo nhân số lượng làm trọng số phần vượt, kể cả khi khai khác loại tiền. Không áp FX. Tổng trọng số bằng 0 thì chia đều. Quyết định và revision giữ cơ sở bất biến. Xem [Feature 42](42-vnd-claim-refund-next.md).

[Bằng chứng kiểm thử và kiểm tra Git/Jenkins](../../artifacts/gd1-refund-weight-2026-11-19/VERIFICATION.md).

## Đợt đóng Supplier Excel · 20/11/2026

Template Supplier × Service/Sub-Service có phiên bản, preview trong queue, hai nhóm cộng tiền độc lập, định danh dòng chứng từ và duyệt Actual/payable đã triển khai theo [Feature 40](40-vnd-post-shipping-import-reconciliation.md). Cấu hình mẫu trên chứng từ thật thuộc pilot. Phase 2 triển khai [Credit Term và chốt Statement tuần](44-vnd-credit-term-weekly-statement.md) cho sổ VNĐ. Phase 3 triển khai [chốt Commission tháng và điều chỉnh sau khóa kỳ](45-vnd-monthly-commission-closing.md). Phase 4 còn mở gồm Supplier Void, Emergency và Supplier Add-on. Khi triển khai cần kiểm chứng lần lượt bằng chứng void/credit nhà cung cấp, hạch toán Emergency theo Supplier thực hiện và quy trình ghi nhận Add-on với nhật ký đối chiếu. [Kiểm chứng Phase 2](../../artifacts/gd1-credit-term-2026-11-20/VERIFICATION.md).

## Phase 4 · Supplier Void và Emergency · 20/11/2026

**PARTIAL.** Hàng đợi void độc lập, cấu hình phí VNĐ theo Route, snapshot tuyến/Lot/Tracking, phân quyền nội bộ và lọc Incident đã triển khai theo [Feature 30](30-supplier-cancellation-followup.md). Hồ sơ void tự sinh khi chuyển Emergency thành công, ghi cùng giao dịch và không tạo bút toán. Phần đối soát chứng từ đến trễ và chống gắn nhầm Actual/payable theo fulfillment attempt vẫn mở, nhất là cùng Supplier và A → B → A. Trạng thái Supplier Add-on nằm ở phần dưới.

[Bằng chứng TEST Phase 4](../../artifacts/gd1-phase4-2026-11-20/VERIFICATION.md).

## Chứng từ Supplier cần đối soát lượt fulfillment

Đã bổ sung chốt kiểm tra cho dòng đối soát VNĐ có khả năng gắn nhầm lượt fulfillment. Phần mở gồm định danh và chọn đúng lượt, ghi Actual/payable theo lượt, rồi đánh giá Chuyên tuyến theo Order/Lot và popup khi đổi Service.

## Supplier Add-on BUY/SELL VNĐ

Đã triển khai [Supplier Add-on thủ công](19-supplier-accounts.md#supplier-add-on-vnđ-thủ-công) với Supplier nhập tự do, ghi thanh toán từng phần và dòng tiền tháng. SELL gắn Client ghi phí vào Balance một lần. Client trả qua luồng nạp tiền hiện tại. Vẫn còn mở xác định và ghi Actual/payable theo lượt fulfillment lịch sử.
