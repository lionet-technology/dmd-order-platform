# GĐ1 Acceptance Checklist · DMD Order Platform

Audit chức năng VNĐ cho tài khoản mở mới, 20/11/2026, repo chính thức `/Users/quan/Developer/report`. Nền xác minh độc lập `25faf1227b822e8305fe277a2ab18ee9eff183b7` trên local HEAD, origin/main và GitHub main. Nguồn chuẩn gồm [Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md), [Feature 43](43-gd1-completion-decision-backlog.md) và [bằng chứng trước audit](../../artifacts/gd1-final-2026-11-20/VERIFICATION.md).

## Kết quả theo luồng

| Trạng thái | Luồng và ca kiểm thử | Bằng chứng |
|---|---|---|
| PASS | Draft VNĐ và giá Publish ePacket/Yun/UPS, Chuyên tuyến manual, thiếu cấu hình báo lỗi, báo giá thay đổi yêu cầu consent. | `verify-vnd-continuation`, `verify-vnd-auto`, `e2e-vnd-v1` |
| BUG → PASS | Xóa hết kiện của Lot đã báo giá bị chặn với yêu cầu chuyển giá lên Order. Edit nay cộng lại Selling/Net/Base theo Lot còn lại, giữ trường cấp Order, ghi lịch sử và revision cùng giao dịch. Ca xóa Lot đầu, đọc lại số kiện và Lot còn lại, SQLite rollback, replay, giữ Reserve cũ khi chờ consent, đổi Reserve sau consent và chỉ một Charge theo giá mới. | `verify-vnd-operations`, [Feature 33](33-vnd-manual-purchase.md) |
| BUG → PASS | Đổi Service thiếu cảnh báo khi giữ offer dưới Net của tuyến mới. Popup cảnh báo Admin. Server yêu cầu xác nhận cảnh báo khi chọn giữ; offer được bảo toàn và consent theo revision mới. | `verify-vnd-continuation`, Chrome, [Feature 28](28-order-edit-v1.md) |
| PASS | Purchase/Consent/Awaiting Funds/FIFO, giữ Reserve khi chờ giá hoặc thiếu tiền, nhiều SQLite writer cạnh tranh, idempotency và rollback. Tracking/Label một phần giữ Reserve; đủ kiện ghi Charge một lần. | `verify-vnd-operations`, `verify-shared-funds-race`, `verify-vnd-financial-cutover` |
| PASS | Thuế/phụ phí sau Charge theo Tracking giữ liên kết kiện/Lot. Replay cùng chứng từ qua định danh khác và cùng khoảng thời gian. Balance âm do nghĩa vụ tài chính, sổ Debt riêng. | `verify-vnd-charge-import`, `verify-vnd-operations`, Chrome |
| PASS | Mapping Supplier Excel có version, TOTAL/SUPPLEMENT, review trùng/unmatched; Actual/payable ghi theo delta, khóa kỳ và điều chỉnh kỳ hiện hành nối nguồn gốc. | `verify-vnd-supplier-import`, `verify-vnd-period-close`, Chrome |
| PASS | Supplier void độc lập, Emergency A → B → A. Chứng từ phân biệt theo lượt Tracking/Label, chứng từ mơ hồ chờ review. Actual của ba lượt duyệt cộng thành 58.001999, sau supplement và lượt thay Tracking thành 68.001999. Thiếu Actual lượt hiện hành trả trạng thái chờ đối soát. | `verify-vnd-supplier`, [Feature 30](30-supplier-cancellation-followup.md), [Feature 41](41-vnd-supplier-period-gp-control-tower.md) |
| PASS | Claim nhiều Order, phân bổ doanh thu và phần vượt theo trọng số đã duyệt, thực chi từng phần Bank/Balance và Supplier Bank/Offset, chặn vượt duyệt và retry. | `verify-vnd-refunds`, `verify-vnd-supplier-claims`, Chrome |
| PASS | GP-Net trước Client Refund dùng toàn bộ Actual được duyệt theo lượt; GP-Base theo doanh thu vận chuyển và Base snapshot. Hoa hồng chốt theo tháng lịch VN, kỳ lịch sử bất biến, Refund/correction muộn tính delta kỳ mới kèm kỳ gốc. | `verify-vnd-supplier`, `verify-vnd-monthly-commission`, Chrome |
| PASS | Credit Term theo tuần, kỳ thứ Hai–Chủ nhật, chốt bù, số kỳ âm liên tiếp, reset về 0 và phát sinh âm cùng ngày. | `verify-vnd-weekly-statement`, Chrome |
| PASS | RBAC trên năm vai trò. Sales/Client có phạm vi Order và sổ, không xem Supplier Actual. Bulk Purchase Excel chỉ Admin. BOD xem báo cáo, Finance xử lý journal, Sales xem hoa hồng theo phạm vi. | `verify-rbac`, `verify-vnd-exceptions`, `verify-vnd-monthly-commission`, Chrome |

## Quyết định nghiệp vụ trước nghiệm thu vận hành

| Trạng thái | Mức | Tình huống cần Owner/Finance quyết định |
|---|---|---|
| BUSINESS DECISION | P0 cho đối soát | Supplier đã duyệt Actual 100, phát credit note 15, sau đó Bank trả hoặc offset 15. Xác định khóa Supplier + số chứng từ + dòng giữa payable/receivable, bút toán nào thay Actual dùng cho GP, bút toán nào chỉ tất toán và quy tắc khi kỳ gốc đã khóa. GĐ1 đã hoãn module Credit Note riêng. |
| BUSINESS DECISION | P0 cho pilot tuyến | Khi đổi tuyến sau phát Label, Supplier A xác nhận void trễ sau ETD. Với từng Service/Sub-Service/Supplier, xác nhận mốc giờ, chứng từ, người phê duyệt, số tiền/tỷ lệ và cách xử lý từ chối hoặc hết hạn. |
| BUSINESS DECISION | P0 cho nghiệm thu chỉ tiêu | Claim 30 qua hai Order khác Sales/kỳ, allocation đã đóng băng 20/10 và Supplier B thu hồi 8. Xác nhận GP-Net sau Refund ghi 20/10 vào cohort mua hay theo tháng quyết định, 8 theo Order/lượt nào và tại thời điểm duyệt hay thu. Hoa hồng đã có quy tắc riêng tại Feature 45. |
| BUSINESS DECISION | P1 | Invoice có freight 100 và thuế 10 thu hộ. Xác nhận cột mapping, khoản chịu thuế, journal và vai trò duyệt; quyết định cộng vào Actual/payable và loại khỏi GP theo trường hợp nào. |
| BUSINESS DECISION | P1 | BOD cần xử lý Cancel & Duplicate hoặc publish giá tại một nhóm tuyến. Xác nhận quyền ghi theo vai trò, phạm vi và yêu cầu audit trước khi nới quyền. |
| DEFERRED | Tùy chọn | Supplier riêng theo Lot. Route, void và fulfillment attempt dùng khóa cấp Order. Giữ phạm vi từ Feature 43. |
| DEFERRED | Sau GĐ1 | Báo cáo xu hướng tháng và đối chiếu/cutover tài khoản USD cũ. |

## Đổi Tracking và Label hàng loạt · kiểm tra lại sau chỉnh sửa

Admin kiểm tra dữ liệu để hiện mã Order, Client và người nhận. Sửa ô hoặc dán dữ liệu sẽ xoá kết quả đối chiếu của các dòng đã thay đổi và yêu cầu kiểm tra lại trước khi xác nhận. Sheet khóa nhập trong lúc chờ phản hồi để bảo toàn dữ liệu đang xử lý. [Checklist UI và pilot 26/11/2026](UAT-GD1-PILOT-2026-11-26.md).

## Điều kiện bàn giao

UI/UX có thể tiếp nối sau khi các ca sửa đạt kiểm thử kỹ thuật. Các quyết định P0 chi phối màn hình hạch toán hoặc chỉ tiêu tương ứng. UAT Admin/Sales/Client/Finance/BOD và pilot cần chứng từ thật, template đã duyệt, rate/zone/cap, điều kiện void theo tuyến, bằng chứng ngân hàng và đối chiếu trên kỳ thật. Triển khai và phục hồi ở DEV/TEST cần xác nhận riêng. Jenkins HTTP 403 là kết quả lần bàn giao trước, trạng thái deploy hiện chưa xác minh.

[Kết quả chạy audit và dữ liệu TEST](../../artifacts/gd1-acceptance-2026-11-20/VERIFICATION.md)

## Supplier Reconciliation V2 · đợt 2

Kịch bản kiểm tra gồm tải lại đúng byte file gốc, truy vết dòng về batch, xem trước và lưu Excel chỉnh sửa, từ chối token cũ và ô công thức, Finance/BOD ghi delta sau xác nhận và khôi phục được workbook cùng revision từ SQLite TEST. [Phạm vi Feature 40](40-vnd-post-shipping-import-reconciliation.md#supplier-reconciliation-v2--đợt-2).
