# DMD GĐ1 · 19/11/2026

Điểm xuất phát local `6bf3b45`, GitHub main `145b555` xác nhận bằng truy vấn chỉ đọc. Jenkinsfile khai báo `githubPush()`, đồng bộ main và triển khai bằng Docker Compose. Tài liệu triển khai ghi webhook GitHub. Không push, không thao tác Jenkins hay production.

Kiểm thử Refund trên SQLite TEST tổng hợp đạt 82 assertions, gồm phân bổ theo doanh thu, Selling Price trước phụ phí/thuế, bồi thường theo trọng số hoặc chia đều, số thập phân, cố định cơ sở khi sửa quyết định, RBAC, retry và rollback.

| Kiểm chứng | Kết quả |
|---|---|
| Hồi quy domain | [68 suite PASS](regression-final.log.txt), bao gồm 82 assertions Refund và 48 assertions Commission. |
| Kiểm tra mã và build | [Typecheck](typecheck.log.txt), [lint](lint.log.txt) và [build cô lập](build.log.txt) PASS. Build có cảnh báo tracing động hiện hữu. |
| Chrome và HTTP localhost | [100 kiểm tra, 5 vai trò](browser.log.txt). Admin Complete lưu phân bổ, BOD tải và mở được Excel có delta chính xác, Client nhận 403. |
| Backup/restore | [11 bảng SQLite TEST](claim-restore.json) khớp sau restore, integrity OK và 0 lỗi khóa ngoại. |
| Workbook nguồn | SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. |

Báo cáo và Excel có dữ liệu live từ quyết định mới nhất. Excel tách dòng theo tháng quyết định, kỳ mua và loại Refund. Chưa có snapshot quyết toán hoa hồng hay journal điều chỉnh số phải trả. Claim cũ giữ lịch sử; lần revision đầu gắn cờ nếu chưa có cơ sở phân bổ cũ. Phần vượt khi giá trị sản xuất nhiều tiền tệ cần quy tắc quy đổi có căn cứ. Các hạng mục còn mở được ghi trong Feature 43.
