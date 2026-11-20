# GĐ1 · Credit Term và Weekly Statement Client VNĐ · 20/11/2026

Phase 2 hoàn tất triển khai và kiểm chứng TEST trong repo chính thức `/Users/quan/Developer/report`. Đầu phiên, local `main` tại `50c11b5` đi trước ref local `origin/main` tại `145b555` bốn commit. Bằng chứng Phase 1 được đối chiếu với [Feature 40](../../docs/Feature/40-vnd-post-shipping-import-reconciliation.md) và [kiểm chứng Supplier Excel](../gd1-supplier-template-2026-11-20/VERIFICATION.md). Quy tắc theo [Feature 44](../../docs/Feature/44-vnd-credit-term-weekly-statement.md) và [Approved Decisions](../../docs/Feature/SERVICE-V1-APPROVED-DECISIONS.md).

- **Hồi quy 69 suite đạt.** Weekly Statement 48 kiểm tra, Purchase VNĐ 74 kiểm tra, Supplier Import 64 kiểm tra. Kiểm tra tuần đổi ngày lúc 17:00 UTC, Term 0 và 2, trả một phần, reset về 0 rồi âm lại trong cùng ngày, đổi Term, Credit Limit độc lập, Debt, khóa thủ công, Purchase chờ tiền, hai tiến trình chốt cùng lúc, lỗi audit rollback, lần chạy bị lỡ và kỳ cũ bất biến. [Nhật ký hồi quy](regression.log).
- **Chrome và HTTP trên localhost đạt 115 kiểm tra qua Admin, Sales, Client, Finance và BOD.** SQLite TEST riêng. Scheduler chốt bù khi server khởi động. Client thấy số tuần quá hạn trên dashboard, Admin đổi Term ở sổ VNĐ và Finance chạy chốt bù lặp lại không tạo kỳ trùng. Hồi quy Supplier Excel gồm preview mapping nhiều cột, Accept và nhập lại cùng chứng từ. [Kết quả Chrome](browser-uat.json) · [Dashboard Client](client-credit-term.png) · [Statement Finance](uat-finance-statement.png).
- **Typecheck, lint và build cô lập đạt.** Build có cảnh báo hiện hữu về truy vết tệp động trong `src/lib/db.ts`. [Nhật ký build](build.log).
- **Workbook giá gốc** vẫn khớp SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

Các lần chạy dùng dữ liệu tổng hợp. Pilot với chứng từ Supplier thật và UAT vận hành còn mở. Với Debt lịch sử, giao dịch trùng người ghi, lý do và thời điểm đến cùng giây có thể cần đối chiếu nếu thứ tự ảnh hưởng tới mốc reset. Posting mới lưu liên kết và thứ tự.

Commit cục bộ. DevOps cần xác nhận danh sách job Jenkins đang bật cho repo, webhook/push và branch indexing nào gọi từng job, các bộ lọc ref thực tế và nhánh checkout/deploy hiệu lực, bao gồm xác nhận ref `refs/heads/dev/<tên-nhánh>` được loại khỏi mọi job có thể deploy `main`. Jenkins và production không tham gia kiểm chứng.
