# Audit kỹ thuật GĐ1 · DMD Order Platform · 18/11/2026

**Kết luận GĐ1: PARTIAL.** Điểm xuất phát `145b5552445a26db5681f2d9c2694e9665d42da6` khớp local HEAD, origin/main và kết quả đọc main trên GitHub. Kiểm thử chạy trên SQLite tổng hợp do script tạo và Chrome localhost. Workbook giá giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

| Trạng thái | Luồng | Bằng chứng và phạm vi |
|---|---|---|
| PASS | Chuyên tuyến: Net/Base trước khi giữ tiền | `verify-vnd-operations.cjs` thử Admin ghi cặp Net/Base cùng Selling, quyền Sales, thiếu một trường, bảo toàn số lẻ, consent, FIFO, Reserve, Charge một lần và khóa sửa sau phát hành. Giá Selling không đổi giữ consent hiện hành. Offer trước đây vẫn hoạt động khi chưa đủ dữ liệu cost. Estimate cấp Lot chỉ dùng tổng Order khi có đúng một Lot. |
| PASS | Emergency VNĐ qua hai Supplier khác nhau | `verify-vnd-supplier.cjs` chạy Emergency Hold/Switch thật, giữ Tracking/Label, retry, kiểm tra payable cũ giữ nguyên, Supplier mới ghi toàn bộ Actual lần đầu, correction import chỉ ghi delta và retry không ghi thêm. Balance Client giữ nguyên. |
| PARTIAL | Emergency VNĐ còn lại | Edit Estimated Net hiện bị từ chối trên tài khoản VNĐ vì form và writer Emergency đang nhận USD. Cần fixture cho replacement Tracking, đổi cùng Supplier, quay lại Supplier cũ và chứng từ tới trễ của tuyến cũ. GP hiện hành dựa trên Actual Supplier hiện hành, vì vậy cần đối chiếu phần chi phí tuyến cũ chưa xử lý trước khi chốt GP. |
| PASS | Hồi quy, typecheck, lint, build | [68 suite](regression.log.txt), [typecheck](typecheck.log.txt), [lint](lint.log.txt), [build cô lập](build.log.txt). Suite Supplier trong hồi quy ghi 53 assertions. Sau khi bổ sung nhãn thực vào fixture, chạy riêng lại PASS 54 assertions. |
| PASS | Chrome/HTTP TEST | [96 kiểm tra qua 5 vai trò](browser-uat.json), từ Purchase VNĐ đến Supplier/Claim/Statement và phân quyền. Bộ Chrome dùng fixture tổng hợp có sẵn. |
| PASS | Backup/restore TEST | [Đối chiếu 11 bảng](claim-restore.json), kiểm tra SQLite integrity và foreign keys. |
| PARTIAL | Mapping, Supplier Add-on, Statement và trend | Supplier import dùng schema chuẩn. Chưa tìm được mẫu file theo Supplier/Service có cột và nhận diện dòng đã xác nhận. Feature 19 có hướng BUY/SELL và báo cáo thương mại cho sổ legacy, trong khi sổ VNĐ dùng dấu payable khác; cần chốt nguồn mapping và đối chiếu journal VNĐ trước khi mở đường ghi mới. Statement VNĐ chốt thủ công và giữ snapshot. Báo cáo VNĐ hiện truy vấn từng tháng. |
| OPEN | Pilot, UI/UX và UAT | Chờ bộ chứng từ thật và kiểm chứng non-production theo cấu hình môi trường triển khai. |

Các kiểm thử trọng điểm có thể chạy bằng Node 20.20.2 với `node scripts/verify-vnd-operations.cjs` và `node scripts/verify-vnd-supplier.cjs`. Với Chrome, chạy `npm run build` tới khi hoàn tất rồi đặt `DMD_UAT_OUTPUT` vào một thư mục artifacts mới trước khi chạy `node scripts/e2e-vnd-v1.cjs`. Build còn cảnh báo Turbopack tracing động hiện hữu. Jenkinsfile có `githubPush()` và stage triển khai theo main, nên bằng chứng ở đây dùng Git local và TEST.

## Quyết định P0 sau GĐ1

| Chủ đề | Bằng chứng và tác động | Phương án cần Owner chốt |
|---|---|---|
| Refund giao nhiều Order/Sales/kỳ/nhóm | `vnd-commission.ts` giữ tổng cấp Claim, gắn cờ và để phần GP chưa phân bổ trống. Phân bổ sai sẽ đẩy tiền hoặc lãi sang Sales/kỳ khác. | Tiếp tục giữ ngoài quyết toán tự động, hoặc Finance nhập phân bổ có chứng từ, giới hạn tổng, duyệt revision và ghi điều chỉnh ở kỳ mở. |
| Commission sau Refund | Giá trị hiện hành là tham khảo theo cước. Chi Bank/Balance đi theo pool, có thể trả nhiều đợt. | Chốt basis và người duyệt, thời điểm ghi, quy tắc clawback và xử lý adjustment sau khóa kỳ. |
| Supplier void theo tuyến và chi phí Emergency | Queue Supplier có bước ghi bằng chứng và mức hoàn thủ công. Sau đổi tuyến, payable cũ có thể vẫn mở. | Chốt mốc carrier, bằng chứng, người xác minh, denied/expired và chọn xử lý chi phí tuyến cũ như exposure riêng hoặc điều chỉnh GP đã được duyệt. |
| Credit note xuyên Actual/payable/receivable | Journal Actual, payable và receivable ghi sự kiện riêng. Dùng cùng chứng từ ở nhiều đường có thể giảm cost hoặc payable hai lần. | Chốt khóa document và line, loại posting tương ứng từng chứng từ và quy tắc reversal/late correction. |
| Credit Term và khóa Statement | `vnd-statements.ts` chốt thủ công, Purchase đọc trạng thái overdue. | Chốt ngày kỳ, múi giờ, ngày nghỉ, điều kiện khóa mua, catch-up khi chạy trễ và người có quyền chốt lại/điều chỉnh. |

## Nitpick còn mở

- Chuyên tuyến nhiều Lot cần nguồn phân bổ Estimated Net. Xem xét phiên bản riêng cho thay đổi chỉ Net/Base khi có hai Admin thao tác đồng thời.
- Emergency cần nhận diện tuyến và tracking hiệu lực khi import chứng từ tới trễ. Cần hiển thị exposure Supplier cũ trước khi dùng chỉ tiêu GP cho quyết toán.
- Supplier cần mẫu file/cột được xác nhận, cách nhận diện tham chiếu ổn định khi file đổi mẫu và quyền xác nhận mapping. Thuế/pass-through vẫn OPEN.
- Trend VNĐ cần kiểm chứng giao kỳ theo ICT, tháng rỗng, correction kỳ sau và Claim liên kỳ. Quyền Cancel & Duplicate của BOD và quyền Publish vẫn theo backlog đang chờ chốt.

[Feature backlog](../../docs/Feature/43-gd1-completion-decision-backlog.md) · [Hồi quy của đợt trước](../gd1-regression-2026-11-18/VERIFICATION.md).
