# GĐ1 · Hồi quy kỹ thuật VNĐ ngày 18/11/2026

Điểm xuất phát `92250efda6516392ca6825f0239a7f18f752cbd7` đã đối chiếu local HEAD, origin/main và GitHub main. Kiểm thử dùng Node 20.20.2 arm64, Chrome localhost, database TEST tạm do script sở hữu và workbook chuẩn ở chế độ đọc.

## Ma trận kiểm thử

| Luồng | Suite hoặc ca HTTP/Chrome | Điều kiện kiểm tra |
|---|---|---|
| Giá và Purchase | `verify-final-source`, `verify-vnd-auto`, `verify-vnd-continuation`, Chrome | Published price và FX/UPS globals, Net/Base/Retail, tuyến ePacket EU, exact VNĐ Draft và giá khi bấm Purchase. Giá khớp đi thẳng tới Reserve, giá lệch chờ consent. |
| Concurrent funds và Charge | `verify-vnd-operations`, `verify-purchase-consent`, `verify-atomic-reserve`, `verify-shared-funds-race` | Các writer độc lập, FIFO, giữ Reserve cũ, thiếu tiền không overspend, sai revision, partial Tracking/Label, retry Charge chỉ một lần. |
| Edit, Cancel & Duplicate | `verify-vnd-continuation`, `verify-supplier-cancellation` | Hủy theo policy và doanh thu đã correction/phụ phí. Trùng mã draft và lỗi ghi DB cùng kiểm tra rollback, giữ draft và sổ nguồn. |
| Tax, surcharge và Balance âm | `verify-vnd-charge-import`, `verify-vnd-financial-cutover`, Chrome | Preview chỉ đọc, Tracking giữ số 0 đầu, reject mã ngoài Client, chống ghi trùng giữa Tracking và Order ID, thuế tách cước và phụ phí, vượt credit không tự sinh Debt, Statement cũ bất biến. |
| Supplier invoice, review và posting | `verify-vnd-supplier`, `verify-vnd-supplier-import`, `verify-supplier-accounting-oracle`, Chrome | TOTAL/SUPPLEMENT, variance/duplicate, unmatched chờ review, accept Actual ghi payable theo delta, payment và ghi chứng từ đúng quyền. |
| Claim và Refund | `verify-vnd-refunds`, `verify-vnd-supplier-claims`, Chrome | 1..N Orders, watchlist/link, Processing, Complete 0, Bank/Balance, Bank/Offset, receipt, trùng chứng từ, vượt số đã duyệt và privacy. |
| Khóa kỳ, báo cáo và RBAC | `verify-vnd-period-close`, `verify-vnd-commission`, `verify-vnd-financial-cutover`, `verify-rbac`, `verify-vnd-exceptions`, Chrome | Snapshot bất biến, điều chỉnh kỳ hiện tại, GP và commission tham khảo, Refund giao nhóm giữ tổng Claim và gắn cờ, BOD-only, scope Sales/Client và Supplier Finance. |

## Kết quả kỹ thuật

- [Hồi quy toàn repo](regression.log.txt) PASS đủ 68 suites trên bản thay đổi cuối.

- [Regression Chrome và HTTP](browser-uat.json) PASS 96 kiểm tra qua Admin, Sales, Client, Finance và BOD. Tên file theo script có sẵn. Kết quả ghi nhận kiểm thử kỹ thuật bằng dữ liệu tổng hợp.
- [Backup/restore TEST](claim-restore.json) PASS, đối chiếu nội dung 11 bảng và kiểm tra SQLite integrity/foreign keys.
- Typecheck, lint và build PASS. Build dùng DB tạm riêng và còn cảnh báo Turbopack tracing động ở `src/lib/db.ts`.

[Trạng thái GĐ1 và backlog quyết định](../../docs/Feature/43-gd1-completion-decision-backlog.md). Pilot chứng từ thật, restore môi trường triển khai và UAT vận hành còn mở. Đợt này không chạy Jenkins hoặc production.
