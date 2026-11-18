# Claim và Refund VNĐ · NEXT

Đợt 18/11/2026 bổ sung truy vết Claim chưa phân bổ trong báo cáo BOD. Bảng hiển thị một dòng cho mỗi Claim trong phạm vi kỳ mua đang xem, gồm toàn bộ Order ID và số tiền duyệt mới nhất. Một Claim giao nhiều kỳ có thể xuất hiện khi xem từng kỳ. Các nhóm bị ảnh hưởng tiếp tục trả về số Refund và GP-Base sau Refund là null. Báo cáo chỉ đọc, giữ nguyên phương pháp tính GP-Net và hoa hồng tham khảo của [Feature 41](41-vnd-supplier-period-gp-control-tower.md).

## Đặc tả và mốc trước triển khai vận hành

| Luồng | Quy tắc đã chốt | Mốc f9c90f1 |
|---|---|---|
| Client Claim | Case gồm một hoặc nhiều Order của cùng Client. Created → Processing có lịch sử trao đổi/chứng từ → Complete Claim có kết luận, số tiền có thể bằng 0. | API VNĐ tạo case, lưu chứng từ, Admin ghi quyết định có revision; quyết định 0 không thêm nghĩa vụ. Còn thiếu Processing, lịch sử trao đổi và thao tác Complete rõ ràng. |
| Supplier Claim | Case gồm một hoặc nhiều Order. Chọn thủ công các Order cần xử lý. Lưu chứng từ, kết luận và số tiền khi Complete. | Case hiện tại nhận nhiều Lot cùng Supplier, với điều kiện Tracking ACTIVE và phạm vi Order VNĐ được kiểm tra phía server. Dùng chứng từ và journal hiện có. Còn thiếu thao tác bắt đầu từ Order, Processing và Complete riêng khỏi trạng thái thu tiền. |
| Watchlist và liên kết | Hai watchlist ghi Order được đánh dấu, lý do và Claim ID nếu đã đưa vào case. Đánh dấu Supplier và liên kết Client ↔ Supplier bằng thao tác thủ công; đặt liên kết khi có các case tương ứng. | Chưa triển khai. Hàng đợi đối soát lỗi hiện tại là nguồn để operator rà soát. Không tạo case khi import hoặc khi đánh dấu. |
| Client Refund | Khi Complete có số tiền dương, ghi vào pool cấp Client. Finance thực trả Bank/Balance từng đợt trong hạn mức pool. | Tái sử dụng quyết định, pool và API thực trả hiện có. Quyết định ghi delta, thực trả giảm pool, Bank không ghi ví. Không thêm tầng duyệt. |
| Supplier settlement | Chứng từ điều chỉnh Actual/payable hoặc ghi recovery rồi thu Bank/offset. Hạch toán một lần theo bản chất khoản điều chỉnh. | Luồng sửa Actual/payable và luồng receivable đã có. Bank chỉ thu receivable; offset giảm payable; cả hai không giảm Actual lần nữa. Liên kết chứng từ giữa hai luồng còn cần hoàn thiện để operator tránh ghi trùng. |
| Cancellation Refund | Dùng policy theo service/route và tổng doanh thu hiện tại đủ điều kiện, hoàn phần còn lại theo quy định. | Luồng huỷ riêng. Việc huỷ nội bộ không tự void carrier hay tạo Supplier recovery. |

## Triển khai vận hành trên /vnd

- Client/assigned Sales/Admin quản lý watchlist Client, tạo một Claim từ nhiều Order và thêm trao đổi. Finance/BOD quản lý watchlist, trao đổi và liên kết Supplier Claim. Watchlist ghi thêm từng lần đánh dấu/gỡ, gồm Order, lý do, actor và thời điểm. Danh sách hiện tại hiển thị Claim ID theo Order. Đánh dấu độc lập với tạo Claim.
- Processing lưu trao đổi theo thứ tự ghi nhận, với ghi chú, chứng từ tùy chọn, actor và thời điểm. Khi tạo, case lưu yêu cầu chính và chứng từ. Case đã Complete giữ nguyên chronology; correction của quyết định đi qua revision tài chính.
- Complete Client Claim do Admin, Complete Supplier Claim do Finance/BOD. Kết luận, chứng từ và số tiền từ 0 được ghi trong cùng transaction với quyết định. Mốc Complete được suy ra từ quyết định đầu tiên, gồm dữ liệu trước triển khai. Trạng thái thu tiền Supplier hiển thị riêng. Client Bank/Balance và Supplier Bank/Offset tiếp tục theo hạn mức và receipt hiện có.
- Supplier có thể tạo một case từ nhiều Order cùng Supplier. Mỗi Order được ánh xạ sang các Lot, giữ điều kiện Tracking ACTIVE và chặn Lot đã có Claim. Vẫn hỗ trợ nhập Lot trực tiếp. Link thủ công yêu cầu hai case có Order chung thuộc đúng Client/Supplier. Link và chứng từ Supplier chỉ hiển thị ở màn hình Supplier Finance/BOD.
- API hiện có `/api/service-v1/operations` và `/api/service-v1/suppliers` bổ sung `claim_process`, `claim_watchlist` và `claim_complete`; Supplier thêm `claim_link`. Lệnh cũ vẫn đọc/ghi cùng journal. Schema bổ sung ba bảng lịch sử append-only. Quy tắc cancellation theo Service và GP/commission liên nhóm tiếp tục như bảng trên.

## Phân quyền và bất biến

- Client/Sales chỉ xem tài khoản thuộc phạm vi được cấp. Client/Sales/Admin có thể tạo Client Claim. Admin quyết định, Finance thực trả. BOD đọc báo cáo chưa phân bổ qua endpoint chỉ cấp cho BOD. Chứng từ Bank nội bộ.
- Supplier documentary và Supplier Finance tiếp tục dùng quyền hiện có. Finance/BOD sở hữu journal chi/thu/offset và khóa kỳ. Khi triển khai watchlist, kiểm tra quyền của cả hai case và Order chung trước khi ghi link. Phía Client không nhận chứng từ, giá hoặc journal Supplier.
- Quyết định và payout dùng transaction cùng receipt chống retry. Revision/decision ID bảo vệ ghi đè đồng thời. Giữ nguyên hồ sơ khóa kỳ và liên kết bút toán điều chỉnh kỳ hiện tại.
- Refund chưa phân bổ giữ tổng cấp Claim. Dùng dữ liệu whole-Claim cho cùng Sales/kỳ/nhóm theo Feature 41. OPEN cho quyết toán hậu Refund và hoa hồng cuối cùng của case liên nhóm. Chỉ cần Owner chọn giữa giữ ngoài quyết toán tự động và ghi phân bổ thủ công có chứng từ khi đưa phần quyết toán này vào phạm vi triển khai.

## Checklist pilot và rehearsal

| Bước | Fixture TEST | Bằng chứng cần có để nghiệm thu |
|---|---|---|
| Client Claim và thực trả | Case nhiều Order, quyết định 0 hoặc dương, chi một phần Bank/Balance, retry và thử vượt pool | Hồ sơ sự cố, quyết định, sao kê/biên nhận, số dư pool trước và sau, ledger và quyền truy cập |
| Refund liên nhóm | Hai Order qua nhóm hoặc kỳ mua; một Claim hiển thị một lần mỗi báo cáo và giữ nguyên tổng | Đối chiếu danh sách Order, Sales/kỳ mua, tổng Claim, trạng thái chưa phân bổ và GP/commission |
| Supplier | Invoice tổng, phụ phí, trùng Tracking, unmatched, khóa kỳ rồi sửa vào kỳ sau. Bank và offset từng phần | Invoice/credit note, tracking đối chiếu, nhận tiền, journal Actual/payable/receivable và liên kết kỳ gốc |
| Cancellation | Policy theo tuyến, doanh thu có điều chỉnh, ghi nhận follow-up thủ công | Policy đã ký, doanh thu hiện tại, chứng từ carrier và biên nhận hoàn tiền |
| Restore NON-production | Backup từ DB TEST, restore sang file mới, đối chiếu journal/snapshot, integrity và foreign keys | Khi có môi trường rehearsal, ghi rõ nguồn TEST, cấu hình và phiên bản, thời điểm backup/restore, đối chiếu số dư và người vận hành xác nhận |

Pilot chứng từ thật và restore tại môi trường triển khai vẫn chờ dữ liệu và môi trường xác nhận.
