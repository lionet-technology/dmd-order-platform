# GĐ1 Phase 4 · Kiểm chứng Supplier Void và Emergency · 20/11/2026

**PARTIAL.** Repo chính thức ở `/Users/quan/Developer/report`. Trước khi sửa, HEAD, `origin/main` và GitHub `refs/heads/main` đều là `ca159b0259e6a3dcbec2ce112facd605aa6025a8`. Đối chiếu Feature 30, Feature 43, Approved Decisions và hồ sơ predeploy 20/11.

| Kiểm thử local | Kết quả |
|---|---|
| Emergency Hold và Switch | 179 kiểm tra đạt. Rollback khi lỗi audit, bốn yêu cầu Switch đồng thời, route-only, đổi Tracking, A → B → A, cùng Supplier, replay sau chuyển tuyến tiếp theo, lọc Incident và RBAC. |
| Supplier VNĐ | 58 kiểm tra đạt. Xác nhận hồ sơ phí void giữ nguyên Client Balance và toàn bộ bút toán payable cũ. Luồng Review Actual VNĐ hiện hữu tiếp tục tạo delta khi duyệt. |
| Chrome/HTTP VNĐ | 134 kiểm tra đạt trên Chrome thật và localhost, năm vai trò, SQLite mẫu. Admin mở hồ sơ void độc lập, lưu xác nhận carrier, tìm lại bằng lọc trạng thái và xem lịch sử; Client Balance/ledger bằng nhau trước và sau. |
| Hồi quy toàn bộ | 70/70 suite đạt. |
| TypeScript, ESLint, production build | Đạt. Build có cảnh báo Turbopack về truy vết đường dẫn SQLite động. |

[Biên bản Chrome](chrome/browser-uat.json) · [Ảnh hàng đợi void](chrome/uat-admin-supplier-void.png).

Phí void là mức VNĐ cố định lưu theo phiên bản Route. Chứng từ carrier được ghi vào lịch sử cùng trạng thái. Phí và xác nhận chỉ phục vụ đối soát. Module hiện giữ phạm vi Admin/Finance/BOD và các màn lọc theo Supplier; tài khoản Supplier đăng nhập riêng chưa có trong hệ thống.

Phần còn mở gồm định danh fulfillment attempt trên chứng từ đến trễ và Actual/payable để chống ghi trùng khi giữ Tracking, đổi cùng Supplier hoặc A → B → A. Hồ sơ lịch sử theo tuyến đã có, nhưng chưa đủ để pilot đối soát các chứng từ này. Supplier Add-on BUY/SELL vẫn mở. Xem [Feature 30](../../docs/Feature/30-supplier-cancellation-followup.md) và [Feature 43](../../docs/Feature/43-gd1-completion-decision-backlog.md).

Bộ kiểm thử dùng dữ liệu SQLite mẫu. Bằng chứng deploy DEV/TEST cần Jenkins build trỏ đúng SHA và health check từ Dev. Hồ sơ trước đó ghi Jenkins API HTTP 403. Workbook giá giữ SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.
