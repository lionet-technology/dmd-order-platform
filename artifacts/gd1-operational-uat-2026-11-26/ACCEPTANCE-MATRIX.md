# GĐ1 · Operational UAT dry run · 26/11/2026

Bản mã thử nghiệm `fe95145137e04b950ee85e246dd85c054a02e233`, đối chiếu trực tiếp với GitHub `main`. Chạy bản build của repo chính thức trên localhost, Chrome desktop 1440 × 1000 và SQLite TEST dùng một lần. Các ca chạy trên nhiều fixture. Tài khoản Client mới được kiểm tra qua API đăng nhập và phân công Sales. Luồng CSV sử dụng Client có cấu hình tuyến và Balance từ fixture. Chưa chạy một hồ sơ duy nhất từ lúc mở tài khoản đến chốt kỳ. Fixture khởi tạo trước các kỳ lịch sử và các Order đã phát hành phục vụ các nhánh kiểm thử. Các thao tác kiểm thử Chrome/HTTP sau khi khởi tạo đi qua ứng dụng. Hồi quy domain có thao tác tạo dữ liệu trực tiếp để kiểm tra các tình huống lịch sử và lỗi.

## Tài khoản TEST

| Vai trò | Username | ID |
|---|---|---:|
| Admin | `epacket.admin` | 1 |
| Finance | `continuation-test-79` | 9 |
| BOD | `continuation-test-78` | 8 |
| Sales | `continuation-test-1` | 6 |
| Client | `continuation-test-2` | 7 |
| Client mới do Admin tạo | `gd1-dry-run-new-client` | 14 |

Fixture chính trong [verify-vnd-continuation.cjs](../../scripts/verify-vnd-continuation.cjs). Bộ Chrome trong [e2e-vnd-v1.cjs](../../scripts/e2e-vnd-v1.cjs). [Tài khoản và bước bổ sung thực chạy](operational-checks.json).

Fixture Emergency/Recovery dùng Admin `epacket.admin` và Finance `test-recovery-1`. Order `test-recovery-26` (#50) chạy đổi tuyến. Client Claim #1 có hai Order DMD `test-recovery-7` (#45) và `test-recovery-10` (#46). [Nhật ký Emergency và Recovery](emergency-recovery.txt).

## Ma trận nghiệm thu

| Trạng thái | Vai trò và thao tác | Kỳ vọng và kết quả thực tế |
|---|---|---|
| PASS | Admin tạo Client và gán Sales, Client đăng nhập, Sales mở danh sách Client. Client mở Orders → Tạo / Import → UPS SAVER → Upload CSV → Validate & Preview → Lưu Draft. | Tài khoản mới trả 201, đăng nhập thành công, Sales thấy đúng phân công. Hai dòng CSV với carton 2 kg và 3 kg lưu thành Draft `TEST-DRY-CSV-01` và `TEST-DRY-CSV-02`, báo giá 2505090.7757568 và 3111858.4742784 VNĐ. [Ảnh Draft](dry-client-bulk-draft.png). |
| PASS | Client gửi Purchase theo giá hiển thị và theo giá cũ. Admin báo giá Chuyên tuyến hai Lot, Client xác nhận. Hồi quy kiểm tra Balance, Reserve, Awaiting Funds, FIFO và đủ Tracking/Label. | Draft CSV đầu sang `RESERVED`, rồi Admin phát `TEST-DRY-CSV-TRACK-01` và Label qua API chuẩn. Order chuyển `CHARGED` và Balance giảm đúng 2505090.7757568 VNĐ. Client đọc được Tracking/Label và không thấy Supplier. Giá cũ trả `PRICE_CONFIRMATION_REQUIRED`. Hai Lot cộng thành 300.001 VNĐ, Reserve bằng 0 khi chưa consent. Hồi quy xác nhận thiếu tiền chờ nạp, xử lý theo FIFO và chỉ Charge một lần khi đủ điều kiện. [Chrome/HTTP](browser-uat.json), `verify-vnd-operations`, `verify-vnd-auto`, `verify-shared-funds-race`. |
| PASS · đã sửa P1 | Admin, Sales và Client → Orders → tìm `TEST-DRY-CSV-01` → View VNĐ. | Tái hiện bản cũ trên Chrome tại 1440 và 390 px. Bản sửa mở chi tiết đúng Order ID, có Tracking/Label và tab Giao dịch VNĐ. Nút Quay lại danh sách giữ ngữ cảnh lọc. HTTP từ chối Client và Sales xem Order ngoài phạm vi. [Trước sửa](dry-client-order-detail-target.png) · [Sau sửa trên Order CSV](order-detail-fix/dry-client-order-detail-fixed.png) · [Bằng chứng và bước tái hiện](order-detail-fix/VERIFICATION.md). |
| PASS | Admin, Sales, Client mở Control Tower bằng menu. Client mở Balance Ledger → Refund. Finance/BOD mở công cụ VNĐ và Finance xem Statement. | Menu desktop mở đúng màn hình. Supplier Actual, file gốc và chứng từ Bank giữ quyền. BOD đọc báo cáo, Client bị từ chối Excel hoa hồng. [Control Tower](dry-admin-control-tower.png), [Refund](dry-client-ledger-refund.png), [Statement Finance](uat-finance-statement.png). |
| PASS | Finance xử lý Supplier Reconciliation V2 theo Tracking/Label. Fixture `TEST-UAT-CLAIM-TRACKING`, `TEST-UAT-MIXED-TRACKING`, `TEST-MAPPED-INVOICE`. | Chín tag, dòng trùng lịch sử và dòng không match, chọn duyệt một phần, phí đã gồm trong Net và Cost/Surcharge/Tax. Duyệt một phần đổi payable 60 → 160.000001 và giữ dòng chưa xử lý. Excel điều chỉnh giữ batch gốc, preview không ghi tiền, bản cũ và ô công thức bị chặn. Bản điều chỉnh đổi nghĩa vụ 35 → 34 VNĐ sau xác nhận. [So sánh](uat-supplier-v2-components.png), [Hàng đợi](uat-supplier-import-queue.png). |
| PASS | Admin mở yêu cầu Supplier void và xác nhận bằng mã giả lập. Hồi quy kiểm tra chính sách và các lượt fulfillment. | Chrome xác nhận void riêng, Client Balance/Ledger giữ nguyên. Hồi quy Supplier import xác nhận policy 90% cho cap 3.3 VNĐ trên Actual 33. Chạy lại cùng kịch bản với policy 100% cho cap 0. Cả hai đều gắn `Cancel Fee > Policy` khi đề xuất 4 VNĐ. Xác nhận bằng chứng carrier thật thuộc pilot. [Kết quả 100%](void-policy-100.txt). [Ảnh void](uat-admin-supplier-void.png), `verify-emergency-hold`, `verify-supplier-cancellation`, `verify-vnd-supplier`. |
| PASS | Admin áp dụng Hold theo SubService, tiếp tục riêng từng Order và theo nhóm, sau đó Emergency A → B → A. | Chrome dùng hai lượt thay Tracking/Label trên fixture tuyến USD. Hồi quy `verify-vnd-supplier` kiểm tra chuỗi lượt fulfillment và Actual VNĐ. Gỡ Hold của tuyến A trước khi đưa Order từ B về A. Hồi quy xác nhận hồ sơ void của từng lượt giữ đúng Tracking và replay cũ không tạo thêm lần đổi. [Ảnh quay lại A](dry-emergency-return.png). |
| PASS | Client Refund, Admin gom Recovery, Finance Supplier Claim, BOD GP và Commission. | Chrome kiểm tra Complete, Bank/Balance payout và giới hạn pool. Trên fixture Emergency/Recovery, Admin gom hai Order DMD vào một Claim, Finance duyệt 90 VNĐ qua HTTP, cấn trừ 20 VNĐ và thu Bank 10 VNĐ, còn phải thu 60 VNĐ. Refund ngoài nhóm vẫn nằm trong hàng đợi. [Ảnh nhóm Recovery](dry-supplier-recovery.png). Hồi quy Recovery đối chiếu phân bổ 90 VNĐ thành 60/30. Bank và Offset giảm receivable, GP-Net giữ nguyên sau tất toán. Sửa duyệt tạo delta, mỗi Recovery được tính đúng một lần. Supplier snapshot đóng kỳ và Statement vẫn khớp từng byte sau điều chỉnh muộn. [Commission](uat-monthly-commission.png), [Supplier kỳ đã khóa](uat-supplier-period-late.png), `verify-vnd-supplier-recovery`, `verify-vnd-monthly-commission`. |
| BLOCKED | Pilot chứng từ thật, Claim lịch sử thiếu phân bổ, bản sao Supplier mang mã khác. | Cần đối chiếu chứng từ gốc. Giữ khoản chưa xác định ngoài GP theo Order. Trong TEST, cùng mã nguồn bị chặn hoặc replay đúng. Chứng từ thành phần giống hệt dưới mã khác `COMP-UNCHANGED` nhận tag `Duplicated - Processed Order` và không thêm bút toán. Mã khác và cùng Tracking vẫn có thể là chứng từ điều chỉnh hợp lệ. Finance đối chiếu trước khi duyệt. |
| DEFERRED | Điều hướng điện thoại thật và đối chiếu SHA/health DEV và TEST đang triển khai. | Chrome viewport 390 px là mô phỏng. Đợt này chỉ có health localhost. Jenkins HTTP 403 thuộc lần bàn giao trước và không ảnh hưởng kết quả kiểm thử trên bản build localhost. |

## Hồ sơ thật cần để ký pilot

- Supplier gửi file Excel gốc tối thiểu hai kỳ, invoice và từng dòng Tracking/Label, Cost, Surcharge, Tax, đơn vị tiền, số chứng từ và số dòng. Kèm phiên bản template/mapping, file sửa, credit note gốc và bản đổi mã nếu có. Finance đối chiếu từng chứng từ và dòng với batch gốc.
- Admin/Supplier chuẩn bị hai hồ sơ void theo chính sách tuyến 90% và 100%, có carrier confirmation, thời điểm phát Label, ETD và thời điểm void. Chuẩn bị một Order Emergency A → B → A có ba bộ Tracking/Label, mốc đổi tuyến và chứng từ hủy của hai lượt rời tuyến.
- Client/Finance chuẩn bị một Refund đã duyệt có cước, phụ phí và thuế cho ít nhất hai Order cùng Supplier. Kèm Claim, quyết định duyệt/sửa duyệt, căn cứ phân bổ theo Order và lượt fulfillment, sao kê Bank hoặc chứng từ Payable Offset, cùng Statement kỳ gốc và kỳ ghi điều chỉnh.
- Finance chuẩn bị danh sách Claim lịch sử thiếu allocation và chứng từ nhiều mã cùng nguồn. Đối chiếu mã gốc, Tracking/Label, tiền, ngày và dòng. Giữ các dòng chưa đủ chứng từ trong danh sách xem xét thủ công.
- Admin, Finance, BOD, Sales và Client ký theo vai trò. Đính kèm số hồ sơ, thời điểm, kết quả và ảnh đã loại thông tin nhạy cảm. Owner/Finance cần chốt hồ sơ mẫu, mapping/định danh chứng từ theo Supplier và xác nhận cấu hình void thực tế của tuyến pilot. Công thức GP-Net, GP-Base và hoa hồng dùng các quyết định đã duyệt.

## Kiểm chứng bản build

`verify-all.cjs` qua 72 bộ, Chrome/HTTP qua 195 assertions trên năm vai trò trong bộ mở rộng, cộng 11 kiểm tra Chrome/HTTP Emergency và Recovery. TypeScript, lint và build qua. Build còn một cảnh báo Turbopack cho đường dẫn SQLite động. [Khôi phục SQLite TEST](claim-restore.json) đối chiếu 23 bảng, integrity OK, không có vi phạm khóa ngoại. [Kiểm tra nâng cấp fixture](upgrade-test.json). Workbook giá có SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.
