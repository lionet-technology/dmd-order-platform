# Credit Term và Weekly Statement Client VNĐ

## Số tuần và sức mua

Admin cấu hình Credit Term theo Client bằng số tuần nguyên không âm và ghi lý do. Mặc định là 0 tuần, chế độ trả trước. Hạn mức Credit VNĐ tiếp tục được cấu hình riêng và sức mua vẫn bằng Balance cộng Credit Limit trừ Reserve. Debt có deadline riêng. Khóa và mở Purchase thủ công chỉ dành cho Admin.

Balance dùng sổ VNĐ cộng gốc đã chuyển sang Debt. Chỉ đếm các kỳ kết thúc Chủ nhật trong chuỗi Balance âm hiện tại. Khi posting đưa Balance về 0 hoặc dương, chuỗi reset ngay. Khoản âm tiếp theo bắt đầu chuỗi mới và có thể tính ngay kỳ của tuần đó nếu Balance kết kỳ vẫn âm. Trả một phần mà Balance còn âm giữ nguyên chuỗi. Khoản nạp phân bổ vào gốc Debt được xét cùng posting nạp để tránh reset giữa các bước của một giao dịch.

Term 2 quá hạn ngay khi có kỳ âm thứ hai, hiển thị tuần quá hạn thứ nhất. Term 0 cảnh báo ngay khi Balance âm, với 0 tuần quá hạn cho đến kỳ âm đầu tiên. Client xem cảnh báo trên màn hình chính và sổ VNĐ. Nhân sự xem theo quyền truy cập Client trong sổ VNĐ. Đổi Term cập nhật trạng thái hiện tại theo chuỗi đang có và lưu lịch sử giá trị cũ, giá trị mới, lý do và người đổi.

Cảnh báo Credit Term không khóa Purchase. Kiểm tra hạn Debt, khóa thủ công, hạn mức, Reserve, giá và điều kiện tuyến tiếp tục áp dụng. Phí và nghĩa vụ đã ghi sổ được giữ nguyên khi Balance vượt hạn mức.

## Chốt tuần và lưu lịch sử

Tuần tính từ thứ Hai đến hết Chủ nhật theo giờ Việt Nam (Asia/Ho_Chi_Minh). Tiến trình Node chạy job lúc khởi động và kiểm tra lại mỗi phút. Chốt được phép từ 00:00 thứ Hai, kể cả ngày nghỉ. Nếu ứng dụng dừng hoặc job lỗi, lần chạy sau chốt các kỳ đã kết thúc còn thiếu theo thứ tự. Finance, BOD và Admin có thể chạy chốt bù qua sổ VNĐ với lý do. Mỗi Client có giao dịch ghi riêng. Lỗi job được ghi vào log máy chủ và lần kiểm tra sau thử lại.

Cùng một Client và ngày kết thúc chỉ có một snapshot. Transaction ghi khóa việc chọn kỳ và lưu snapshot cùng dòng audit. Audit lưu nguồn tự động hoặc thủ công, mốc kỳ và múi giờ. Với job tự động, trường actor tham chiếu người mở tài khoản để tương thích schema lịch sử, còn nguồn audit ghi SCHEDULED. Snapshot cũ giữ nguyên. Nếu kỳ cũ kết thúc giữa tuần, kỳ chuyển tiếp bắt đầu vào ngày liền sau và kết thúc Chủ nhật. Chứng từ tới trễ dùng thời điểm ghi sổ thực tế và kỳ chưa chốt tương ứng.

Các khoản trả gốc mới có liên kết với posting nạp và thứ tự sổ. Với dữ liệu Debt cũ chỉ có dấu thời gian đến giây, hệ thống ghép nạp và phân bổ gốc theo thời điểm, người ghi và lý do. Nhiều posting cũ giống hệt các trường này trong cùng giây có thể cần đối chiếu sổ nếu thứ tự làm thay đổi chuỗi âm.

Các luồng USD lịch sử tiếp tục dùng điều khoản ngày hiện hành. Phạm vi này áp dụng cho tài khoản VNĐ của Service V1.

## Kiểm chứng

Suite `verify-vnd-weekly-statement` kiểm tra mốc UTC+7, reset cùng ngày, Debt, đổi hạn, khóa kỳ và chốt đồng thời. Suite `verify-vnd-operations` kiểm tra Purchase với cảnh báo quá hạn và khóa thủ công. Kiểm tra Chrome chạy trên localhost với SQLite TEST.
