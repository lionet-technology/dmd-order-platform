# GĐ1 · Checklist UI và pilot

Nền đối chiếu GitHub `main` trước đợt này là `ef3817972eb268d59cef5b5834e24aa214304018`. Kết quả PASS áp dụng cho tình huống TEST nêu trong bảng. Pilot dùng bộ hồ sơ thật bên dưới và ký nghiệm thu theo vai trò. [Bằng chứng đợt này](../../artifacts/gd1-ui-uat-2026-11-26/CONTINUATION.md).

| Màn hình và vai trò | Kết quả TEST | Việc cần xác nhận khi nghiệm thu |
|---|---|---|
| Admin · Bulk Purchase | PASS. Đã sửa lỗi mất dữ liệu khi lọc hoặc đổi tab. Chrome kiểm tra cả ba bộ lọc, giữ bản nháp khi lỗi tải/lưu và xác nhận đóng khi còn dữ liệu. | Duyệt ca nhiều carton và lỗi dữ liệu/hệ thống có thật. Sửa nguyên nhân và retry đúng Order. Kiểm tra cảnh báo khi Order đang Hold. |
| Admin · Bulk Tracking và Label | PASS. Đợt trước đã tái hiện BUG và xác nhận cache preview cũ biến mất khi dán đè. [Bằng chứng](../../artifacts/gd1-ui-uat-2026-11-26/VERIFICATION.md). | Dùng điện thoại thật để vào màn hình từ Orders, kiểm tra hai carton cùng Order, dán đè một dòng và xác nhận lại. |
| Admin, Finance, BOD · Reconciliation V2 | PASS. Chrome kiểm tra danh sách chín tag, so sánh thành phần, xuất và nhập lại Excel điều chỉnh, duyệt các dòng đủ điều kiện và giữ dòng chưa xử lý. | Nộp chứng từ gốc ít nhất hai kỳ, thử bản trùng Tracking và bản đổi mã. Đối chiếu file sửa với batch gốc. |
| Admin · Emergency Hold | PASS hồi quy cho phạm vi SubService, chặn mua/retry, chuyển supplier, void và A → B → A. Chrome áp dụng Hold theo SubService, tiếp tục một và nhiều Order, đổi riêng một Order A → B kèm Tracking/Label. | DEFERRED với hồ sơ carrier thật. Kiểm tra hai lượt thay Tracking/Label, lịch sử fulfillment, hủy và tiếp tục theo chính sách. |
| Admin, Finance, BOD · Recovery | PASS hồi quy cho gom Order, duyệt, phân bổ, sửa duyệt, Bank và Payable Offset từng phần. Chrome xác nhận hồ sơ thiếu căn cứ và thao tác gom hai Order cùng Supplier thành một Claim chờ duyệt. | DEFERRED với hồ sơ thật. Gom cùng Supplier, thử chọn khác Supplier, kiểm tra Claim lịch sử thiếu phân bổ và đối chiếu chứng từ Bank/Offset. |
| Admin, Sales, Client · Orders, Status, Refund | PASS trong phạm vi Chrome và HTTP của bộ TEST, gồm màn hình Orders theo vai trò, Claim/Refund và quyền truy cập dựa trên tài khoản. | DEFERRED nghiệm thu xuyên luồng theo hồ sơ pilot và trên điện thoại thật. |
| Balance Ledger và Control Tower · các vai trò được cấp quyền | PASS trong phạm vi TEST, gồm sổ VNĐ, phân quyền, kỳ gốc/kỳ ghi sổ và Control Tower trên dữ liệu USD/VNĐ. Đã sửa BUG làm Control Tower USD lỗi toàn màn hình. | Đối chiếu kỳ đã khóa, bộ lọc, trạng thái rỗng và điều hướng từ ngoại lệ trên thiết bị thật. |

## Rà soát dữ liệu TEST

Đợt trước đối chiếu từng dòng của 13 bảng trên SQLite TEST. Đợt này đối chiếu từng dòng của 23 bảng thuộc fixture Chrome VNĐ. Integrity và khóa ngoại đều qua. Snapshot đợt trước có một quyết định APPROVE và một CORRECT của Supplier Claim, cả hai có phân bổ. Kiểm tra mã nguồn xác nhận quyết định không có căn cứ Order sẽ không tạo phân bổ. GP theo Order đọc các phân bổ đã ghi. Cần lập danh sách đối chiếu từ dữ liệu lịch sử trước pilot. Giữ khoản chưa nhận diện được Order ngoài GP của Order.

Supplier Import kiểm tra trùng trong file và lịch sử. Khi Supplier đặt mã khác cho bản sao chứng từ, đối chiếu file gốc, số dòng và nghiệp vụ trước khi duyệt. Hồ sơ chưa đủ căn cứ đi vào ngoại lệ thủ công.

## Hồ sơ cho pilot

- Supplier cung cấp hóa đơn và bảng chi tiết ít nhất hai kỳ, đủ Cost, Surcharge và Tax, file sửa Tracking, credit note bản gốc và bản đổi mã nếu có. Finance xác nhận cách nhận diện cùng chứng từ trong từng nguồn. Giữ hồ sơ không đủ căn cứ trong danh sách ngoại lệ để đối chiếu thủ công.
- Supplier cung cấp hồ sơ void 90% và 100%, mã xác nhận carrier, mốc ETD và thời điểm xác nhận. Admin ghi lại hành trình Emergency A → B → A và mã Tracking từng lượt.
- Client cung cấp Order có cước, phụ phí và thuế thực thu khác chi phí Supplier, hồ sơ Refund đã duyệt và Claim Recovery liên kết. Finance đối chiếu từng Order với chứng từ gốc và kiểm tra lần sửa duyệt.
- Finance ký số GP-Net theo tổng thu sau Client Refund trừ tổng chi sau Supplier Recovery. Recovery ghi đúng một lần khi duyệt. Bank và Payable Offset giảm số phải thu. Đối chiếu GP-Base và snapshot hoa hồng trước và sau bộ giao dịch. Claim lịch sử thiếu phân bổ cần hồ sơ theo Order trước khi ghi vào GP-Net của Order.
- Dev ghi SHA đang chạy và health của DEV/TEST khi có bằng chứng triển khai. Điều hướng trên điện thoại thật và pilot chứng từ thật vẫn OPEN. Admin, Finance, BOD, Sales và Client ký theo từng kịch bản, đính kèm mã hồ sơ, số kỳ, kết quả mong đợi, kết quả thực tế và ảnh hoặc log đã loại thông tin nhạy cảm.

## Operational dry run · 26/11/2026

[Ma trận nghiệm thu, tài khoản TEST, bước tái hiện và ảnh](../../artifacts/gd1-operational-uat-2026-11-26/ACCEPTANCE-MATRIX.md). Trên Chrome desktop, nút View VNĐ của Admin, Sales và Client mở sổ chung và làm mất ngữ cảnh Order. Giữ lỗi điều hướng trong danh sách UX. Kết quả kiểm thử áp dụng cho bản build localhost với SQLite giả lập. Pilot chứng từ thật, điều hướng trên thiết bị thật và SHA/health DEV/TEST đang triển khai tiếp tục mở.
