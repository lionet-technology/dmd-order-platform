# Kiểm chứng Phase 3 · Monthly Commission Closing · 20/11/2026

Repo chính thức `/Users/quan/Developer/report`. Đầu phiên, local `main` ở `6310fda`, đi trước ref cục bộ `origin/main` tại `145b555` năm commit. Remote cấu hình là `git@github.com:lionet-technology/dmd-order-platform.git`. Đặc tả nằm tại [Feature 45](../../docs/Feature/45-vnd-monthly-commission-closing.md).

- Kiểm tra mốc 16:59:59 và 17:00:00 UTC khi sang tháng giờ Việt Nam, checkpoint bất biến, chốt đồng thời từ hai tiến trình, rollback khi ghi snapshot lỗi, chốt bù và lần chạy lặp. Kỳ mua gốc có 7,3 VNĐ. Claim tháng sau giảm giá trị Order còn 1,25 VNĐ và ghi delta −6,05 VNĐ. Khi sửa giá ở kỳ kế tiếp, Order về 0 và delta là −1,25 VNĐ. Bank/Balance chỉ thực hiện nghĩa vụ đã ghi. [Kết quả kiểm tra riêng](monthly-commission.log).
- Chrome và HTTP trên localhost đạt 131 kiểm tra qua Admin, Sales, Client, Finance và BOD. Startup phục hồi kỳ quá hạn. Admin/BOD/Finance đọc toàn bộ snapshot. Sales chỉ nhận Order của mình trong JSON và Excel. Client bị từ chối cả hai. Excel và báo cáo đối chiếu đúng Order và tổng Sales. [Kết quả Chrome](browser-uat.json) · [Màn hình kỳ hoa hồng](uat-monthly-commission.png).
- Toàn bộ 70 suite trong `npm test` đạt. [Hồi quy](regression.log).
- Typecheck, lint và build cô lập đạt. Build có cảnh báo hiện hữu về truy vết filesystem động trong `src/lib/db.ts`. [Build](build.log) · [Typecheck](typecheck.log) · [Lint](lint.log).
- Backup/restore chạy trên SQLite TEST, so sánh nguyên vẹn snapshot, journal Refund và ledger, kiểm tra khóa ngoại, integrity và trigger bất biến sau khôi phục.
- Workbook nguồn giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

Kiểm chứng dùng dữ liệu tổng hợp. UAT vận hành và phục hồi trên môi trường triển khai chưa thực hiện. Commit cục bộ, không push. DevOps cần xác nhận job Jenkins, bộ lọc branch/ref và webhook trước khi push `main` hoặc `dev/*`. Backlog tiếp theo gồm Supplier Void, Emergency và Supplier Add-on. [Backlog GĐ1](../../docs/Feature/43-gd1-completion-decision-backlog.md).
