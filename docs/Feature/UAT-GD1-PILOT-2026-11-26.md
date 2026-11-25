# GĐ1 · Checklist UI và pilot

Nền bàn giao ngày 26/11/2026: `e9e4ec98b33b451b6dc9c05803ee22d80f6fc486`. Bằng chứng TEST đã ghi ở [đợt Emergency Hold và Supplier Recovery](../../artifacts/gd1-emergency-recovery-2026-11-25/VERIFICATION.md). Các bước dưới đây là tiêu chí chạy UAT và ký nghiệm thu với hồ sơ thật.

| Màn hình và vai trò | Mức rà soát | Điều kiện nghiệm thu |
|---|---|---|
| Admin · Bulk Purchase và retry | DEFERRED | Lọc Service, SubService và Supplier, chọn theo Order, xử lý một dòng lỗi dữ liệu và một dòng lỗi hệ thống. Retry đúng Order sau khi sửa. Hold chặn cả mua và retry. |
| Admin · Bulk Tracking và Label | BUG | Kiểm tra Tracking A rồi dán Tracking B đè dòng đã match. Mã Order, Client và người nhận của A phải biến mất. Xác nhận chỉ mở lại sau khi kiểm tra B. Dòng khác giữ dữ liệu. Thử trên desktop và điện thoại, gồm nhiều carton cùng Order và đổi bộ lọc sau khi nhập. |
| Admin, Finance, BOD · Reconciliation V2 | DEFERRED | Kiểm tra cả chín tag English theo [Feature 40](40-vnd-post-shipping-import-reconciliation.md). So sánh từng thành phần cũ/mới. Tải Excel sửa, nạp lại và đối chiếu dòng với batch gốc. Gửi lại Tracking trùng trong cùng file và từ batch đã duyệt. |
| Admin · Emergency Hold từng Order và hàng loạt | DEFERRED | Chạy A → B → A với Tracking/Label khác mỗi lượt. Kiểm tra lý do, lịch sử fulfillment và void, tiếp tục và hủy. |
| Admin, Finance, BOD · Recovery | DEFERRED | Gom nhiều Order cùng Supplier vào Claim. Kiểm tra khi chọn khác Supplier, khi thiếu căn cứ và khi Claim lịch sử thiếu phân bổ. Tất toán Bank và Payable Offset từng phần. |
| Sales, Client · Orders, Status, Refund | DEFERRED | Sales kiểm tra Order thuộc phạm vi được giao. Client mở Order của mình, theo dõi trạng thái, gửi Refund và xem kết quả. Kiểm tra phạm vi dữ liệu và trường nội bộ trên màn hình lẫn HTTP. |
| Finance, BOD, Sales, Client · Balance Ledger và Control Tower | DEFERRED | Đối chiếu kỳ gốc và kỳ ghi sổ. Kiểm tra lọc, trạng thái rỗng, điều hướng từ ngoại lệ, và phạm vi hiển thị theo vai trò trên màn hình nhỏ. |

## Rà soát dữ liệu TEST

Khôi phục bản SQLite TEST đã seed và so sánh từng dòng của 13 bảng. Kiểm tra integrity và khóa ngoại đều qua. Snapshot có một quyết định APPROVE và một CORRECT của Supplier Claim, cả hai có phân bổ. Kiểm tra mã nguồn xác nhận quyết định không có căn cứ Order sẽ không tạo phân bổ. GP theo Order đọc các phân bổ đã ghi. Cần lập danh sách đối chiếu từ dữ liệu lịch sử trước pilot. Giữ khoản chưa nhận diện được Order ngoài GP của Order.

Supplier Import kiểm tra trùng trong file và lịch sử. Khi Supplier đặt mã khác cho bản sao chứng từ, đối chiếu file gốc, số dòng và nghiệp vụ trước khi duyệt. Hồ sơ chưa đủ căn cứ đi vào ngoại lệ thủ công.

## Hồ sơ cho pilot

- Supplier cung cấp hóa đơn và bảng chi tiết ít nhất hai kỳ, đủ Cost, Surcharge và Tax, file sửa Tracking, credit note bản gốc và bản đổi mã nếu có. Finance xác nhận cách nhận diện cùng chứng từ trong từng nguồn. Giữ hồ sơ không đủ căn cứ trong danh sách ngoại lệ để đối chiếu thủ công.
- Supplier cung cấp hồ sơ void 90% và 100%, mã xác nhận carrier, mốc ETD và thời điểm xác nhận. Admin ghi lại hành trình Emergency A → B → A và mã Tracking từng lượt.
- Client cung cấp Order có cước, phụ phí và thuế thực thu khác chi phí Supplier, hồ sơ Refund đã duyệt và Claim Recovery liên kết. Finance đối chiếu từng Order với chứng từ gốc và kiểm tra lần sửa duyệt.
- Finance ký số GP-Net theo tổng thu sau Client Refund trừ tổng chi sau Supplier Recovery. Recovery ghi đúng một lần khi duyệt. Bank và Payable Offset giảm số phải thu. Đối chiếu GP-Base và snapshot hoa hồng trước và sau bộ giao dịch. Claim lịch sử thiếu phân bổ cần hồ sơ theo Order trước khi ghi vào GP-Net của Order.
- Dev xác nhận SHA và health của DEV/TEST. Admin, Finance, BOD, Sales và Client ký theo từng kịch bản, đính kèm mã hồ sơ, số kỳ, kết quả mong đợi, kết quả thực tế và ảnh hoặc log đã loại thông tin nhạy cảm.
