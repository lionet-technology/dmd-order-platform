# VNĐ Claim và Refund NEXT · 18/11/2026

Điểm bắt đầu đã kiểm tra độc lập: HEAD, origin/main và GitHub main cùng ở `7b7fec388fa7ebfc30d145f05f961e6f7fda8777`. Đã đối chiếu V1 verification, Approved Decisions, Feature 37/38/40/41 và các API Claim, Refund, Supplier, Reporting hiện có.

## Phạm vi

- [Feature 42](../../docs/Feature/42-vnd-claim-refund-next.md) thống nhất đặc tả hai case, hai watchlist, liên kết thủ công, Complete, Refund và cancellation. Tài liệu đối chiếu phần hiện có và còn thiếu, kèm checklist pilot và rehearsal.
- Báo cáo BOD VNĐ bổ sung danh sách Claim chưa phân bổ liên nhóm/kỳ/Sales. Mỗi Claim xuất hiện một lần trong kết quả kỳ đang xem, có toàn bộ Order ID và số tiền duyệt cấp Claim. GP-Base sau Refund của nhóm liên quan vẫn chưa xác định.
- Báo cáo chỉ đọc, không chia pool theo Order, không ghi bút toán, không đổi công thức tham khảo hay cơ chế Bank/Balance, Supplier Actual/payable/receivable, khóa kỳ và điều chỉnh kỳ hiện tại.

## Kết quả

- Regression **68 suites PASS**, gồm Commission **43 assertions**, Client Refund **59**, Supplier receivables **55** và Supplier close **38**. Commission kiểm tra cùng nhóm, xuyên nhóm và hai kỳ mua, không tính lặp toàn bộ Claim trong cùng báo cáo.
- Typecheck, lint, production build và diff whitespace **PASS**. Build dùng DB tạm riêng.
- [Chrome UAT](browser-uat.json) **83 assertions / 5 roles**, Chrome thật localhost và DB TEST. BOD thấy đúng một dòng cho case liên kỳ, có đủ Order ID và toàn bộ số tiền duyệt. ADMIN, FINANCE, SALES và CLIENT bị từ chối endpoint BOD. Lần chạy đầu dùng fixture thiếu snapshot attribution, đã bổ sung và chạy lại.
- [Restore rehearsal](pilot-restore.json) **PASS**, 8 bảng, integrity check và foreign keys. Snapshot đóng kỳ và liên kết bút toán gốc được so sánh sau khi restore sang file TEST mới.

## Còn mở

Processing/history, thao tác Complete Claim, hai watchlist và link Client ↔ Supplier còn ở phần triển khai vận hành. Quyết toán GP/commission cho Claim liên nhóm giữ OPEN. Pilot chứng từ thật, diễn tập tại môi trường triển khai non-production và nghiệm thu vận hành vẫn chờ dữ liệu và môi trường tương ứng. Không dùng DB vận hành, Jenkins hay production.
