# GĐ1 · Bằng chứng Functional Acceptance Audit

Ngày 20/11/2026, nền `25faf1227b822e8305fe277a2ab18ee9eff183b7`. Kiểm thử trên bản làm việc tách riêng từ repo chính thức, Node 20.20.2 và cơ sở dữ liệu SQLite TEST dùng một lần. [Acceptance Checklist](../../docs/Feature/46-gd1-acceptance-checklist.md).

- `npm test` đạt 71/71 suite. [Nhật ký hồi quy](regression.log.txt)
- `npm run typecheck`, `npm run lint` và `npm run build` đều thoát mã 0. Build ghi một cảnh báo Turbopack về truy vết đường dẫn SQLite động.
- Chrome/HTTP đạt 161 kiểm tra trên Admin, Sales, Client, Finance và BOD trên production build chạy localhost. Kiểm chứng popup cảnh báo dưới Net và quyền bulk Purchase Excel của Sales/Client. [Kết quả Chrome](browser-uat.json) · [Popup](uat-service-price-choice.png)
- SQLite TEST backup/restore đối chiếu 21 bảng, integrity OK và 0 vi phạm khóa ngoại. Diễn tập schema phí cũ chạy installer hai lần, giữ hai dòng phí và 20 bảng khác. [Backup/restore](claim-restore.json) · [Nâng cấp](upgrade-test.json)
- Xóa Lot 1 khỏi Order vẫn giữ kiện số 2 thuộc Lot 2 sau khi khởi động lại tiến trình. Sau khi duyệt Actual 39 VNĐ cho Lot 2, báo cáo trả APPROVED_TOTAL 39 VNĐ. Slot trống không làm mất kết quả.
- Hồi quy A → B → A xác nhận Actual 58.001999 VNĐ từ ba lượt. Bổ sung và thay Tracking đưa tổng lên 68.001999 VNĐ. Các snapshot kỳ Supplier đã khóa giữ nguyên.
- Workbook nguồn SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Trạng thái deploy/restore trên DEV/TEST chưa xác minh. Bằng chứng lần trước ghi Jenkins HTTP 403.
