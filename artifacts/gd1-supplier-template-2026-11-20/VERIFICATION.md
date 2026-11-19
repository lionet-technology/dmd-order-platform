# GĐ1 · Supplier Actual Cost Excel và đối soát · 20/11/2026

Phạm vi là template Excel Supplier VNĐ, hàng chờ đối soát và ghi Actual/payable sau duyệt. [Quy tắc và quy trình](../../docs/Feature/40-vnd-post-shipping-import-reconciliation.md).

## Kiểm chứng

- **Hồi quy toàn repo — 68 suite đạt.** [Nhật ký hồi quy](regression.log).

- **Supplier Import VNĐ — 64 kiểm tra.** Workbook TEST tạo bằng ExcelJS và đọc bằng bộ đọc Excel của ứng dụng. Có Tracking giữ số 0 đầu, nhiều Tracking, nhiều thành phần Net và surcharge, phí đã gồm và phí cộng riêng, hai dòng phụ phí thật cùng Tracking, dòng thừa cân và unmatched, dữ liệu USD/lỗi số, trùng mã dòng, replay, sửa sau khi loại dòng, và lần chốt kỳ đã khóa. Kiểm tra số thập phân, quyền Accept, delta payable, chống ghi lại, tính bất biến và tham chiếu kỳ gốc.
- **Chrome và HTTP — 111 kiểm tra qua 5 vai trò.** Mới kiểm tra tạo template qua giao diện, multipart Excel, hiển thị từng cấu phần, giữ payable khi đang chờ, Finance Accept và tải lại cùng chứng từ bằng request mới. Dùng SQLite TEST riêng. [Kết quả Chrome](browser-uat.json) · [Màn hình xem trước](uat-supplier-template.png).
- **Typecheck, lint và build cô lập** đạt. Build vẫn có cảnh báo truy vết tệp động tại `src/lib/db.ts`. [Nhật ký build](build.log).
- **Workbook giá gốc** khớp SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

## Giới hạn triển khai

- Mã chứng từ và mã dòng do Supplier/op nhập dưới dạng text ổn định. Template cho chứng từ phụ phí riêng chỉ cấu hình nhóm Surcharge. Chứng từ đã Accept cần chứng từ điều chỉnh mới; điều chỉnh tổng dùng delta của Actual đã chốt. Lần chạy này dùng mẫu tổng hợp, còn pilot với chứng từ Supplier thật.
- Checkout đầu phiên là `main` tại `ae312e4`, trước ref local `origin/main` tại `145b555` ba commit. Đợt này commit local. Push và Jenkins/production chưa được thực hiện. `dev/*` tiếp tục chờ DevOps đối chiếu ref filter và webhook của các job đang chạy.
- Pha tiếp theo là Credit Term và Weekly Statement thứ Hai–Chủ nhật. Monthly commission close và điều chỉnh, Supplier void/Emergency, Supplier Add-on BUY/SELL, số tiền theo Order/Lot và popup offer khi đổi dịch vụ vẫn ở backlog.
