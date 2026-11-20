# GĐ1 · Chốt hoa hồng VNĐ theo tháng

**Trạng thái:** Đã triển khai cục bộ và kiểm chứng TEST ngày 20/11/2026. [Bằng chứng](../../artifacts/gd1-monthly-commission-2026-11-20/VERIFICATION.md).

Scheduler trên tiến trình Node chạy khi khởi động và kiểm tra mỗi phút. Kỳ tính từ ngày 1 đến hết tháng lịch giờ Việt Nam. Từ 00:00 ngày 1 tháng sau, job chốt lần lượt các kỳ còn thiếu từ kỳ mua VNĐ đầu tiên. Mỗi tháng có một snapshot, lưu trong một giao dịch ghi SQLite và khóa cập nhật/xóa. Lần chạy tiếp tục từ kỳ đã lưu gần nhất. Các tiến trình dùng cùng DB kiểm tra kỳ dưới khóa ghi. Bảng ghi thời điểm chốt UTC. Chốt kỳ không xác nhận đã chi hoa hồng. GĐ1 không có luồng duyệt hoặc nút chốt tay.

- Tính theo từng Order, với Sales được ghi nhận lúc Purchase. Khi có doanh thu cước sau Refund cao hơn Base, hoa hồng = 0,1% cước sau Refund cộng 12% phần chênh lệch. Order hủy và Order chưa charge bằng 0. Thiếu Base hoặc Sales khi có charge được đánh dấu rà soát.
- Kỳ mua gốc đi cùng từng Order. Hoa hồng kỳ hiện tại là giá trị Order tại mốc chốt trừ giá trị lũy kế đã ghi nhận. Số ghi nhận có thể âm khi Order kỳ cũ có Refund hoặc sửa giá. Số hoa hồng của từng Order luôn từ 0 trở lên khi đủ dữ liệu. Chốt bù đọc ledger, quyết định Refund và lịch sử quote theo mốc cuối từng tháng.
- Số Refund lấy từ phân bổ đã chốt trong quyết định nghĩa vụ khi Complete Claim hoặc revision. Bank và Balance thực trả dùng journal Refund riêng. Claim test cũ thiếu phân bổ được đánh dấu và bỏ qua trong phép tính hoa hồng. Khi có phân bổ trong quyết định mới, kỳ của quyết định nhận phần chênh lệch. Không tạo posting tài chính bổ sung.
- Báo cáo và Excel dùng cùng dữ liệu kỳ. Dòng đối chiếu lưu tháng ghi nhận, kỳ mua, Sales, Order, ID ledger/quyết định và loại Claim. Sai lệch đối soát, sự cố dịch vụ và bất khả kháng hiển thị theo loại nguồn. Admin, BOD và Finance xem toàn bộ. Sales chỉ xem Order thuộc Sales ID lịch sử của mình và Base nội bộ được ẩn. Client và Warehouse không có quyền.
- Màn hình VNĐ có bảng kỳ riêng. Báo cáo BOD live theo kỳ mua và Excel live tại endpoint hiện hành tiếp tục phục vụ đối chiếu. Kỳ hiện tại hiển thị tạm tính. Nếu kỳ trước còn chờ job thì màn hình báo chưa có snapshot.

`GET /api/service-v1/commission-statements?month=YYYY-MM` trả trạng thái, dòng Order và tổng Sales. `format=xlsx` dùng cùng dữ liệu và cùng quyền. Bảng `vnd_commission_statements` lưu snapshot. Bộ kiểm tra `scripts/verify-vnd-monthly-commission.cjs` chạy cùng `npm test`. `scripts/e2e-vnd-v1.cjs` kiểm tra scheduler khởi động, màn hình và quyền JSON/Excel.

Nguồn liên quan gồm [Commission VNĐ](36-vnd-commission-report.md), [Claim VNĐ](42-vnd-claim-refund-next.md) và [Weekly Statement](44-vnd-credit-term-weekly-statement.md).
