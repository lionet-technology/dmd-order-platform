# Rà soát Emergency Hold — 24/10/2026

## Phạm vi và nền tảng
Repo `/Users/quan/Desktop/report`, nhánh main, bắt đầu từ `38082c4`; sau fetch, origin/main vẫn sau local hai commits (`8deee62`, `38082c4`). Không sửa `Codex/`, không mở/reset database thật. Tất cả kiểm thử dùng synthetic SQLite trong thư mục tạm hoặc fixture `.smoke` của suite hiện hành.

## Đã sửa
1. Cho phép chỉ đổi Route, giữ nguyên hàng Tracking/lịch sử và Tracking/Label chính của Order; Net Cost blank giữ nguyên. Replacement vẫn yêu cầu đầy đủ bộ ACTIVE, mỗi old ID duy nhất. Không tạo Order/tracking giả.
2. Ghi expectation cost theo Lot/Tracking khi giữ Label; bill Supplier cũ không đủ để COMPLETE Supplier mới, kể cả nhãn cũ NOT_BILLED. Same-Supplier reroute không tái dùng bill trước Switch. Không tự phân bổ estimate nhiều Lot/component.
3. Nhập supplier cost sau Switch bỏ nhánh legacy sửa giá/Charge, chỉ cập nhật đối soát. Chi phí Supplier cũ+mới vẫn riêng chứng từ, tổng exposure/GP dùng toàn bộ actual khi đủ coverage. Không gọi Pending là finalized.
4. Excel parse theo dòng và xử lý từng Order độc lập; công thức/lỗi mapping/partial replacement không cản Order khác. Lưu last_error trên Order chưa resolved, hiển thị lại sau reload; thành công xóa lỗi và ra khỏi queue. File hỏng/header/limit được từ chối trước xử lý; unresolved vẫn trong Hold.
5. Dùng chung predicate handoff cho Hold/Switch. Manifest EXPORT/REMOVE history giữ nguyên. Guard thêm định danh/giá/estimate; bootstrap mã đơn bỏ qua Order đang Hold, hỗ trợ schema cũ/chưa có bảng Hold. Giao dịch Switch/Undo vẫn IMMEDIATE, retry lưu mapping chuẩn hóa; không thêm orchestration engine.
6. Audit nêu old/new Route/Supplier, KEEP/REPLACE_ALL, estimate, cost exposure theo Supplier; public note route-only không nói đã đổi Label.

## Kiểm chứng
- Full regression: **34 suites PASS** trên database synthetic, bao gồm các module tài chính, Supplier, Statements và Emergency.
- Emergency extended: **141 assertions PASS** trong lượt chạy cuối, gồm API omitted Tracking, giữ nguyên Tracking/Label, partial/duplicate/retry, mixed Excel formula lỗi xen success rồi repair, inactive route, cost cũ+mới, sai Supplier không đủ coverage, invoice import/retry không Charge, guard tài chính, fresh-process Hold bootstrap, audit rollback, concurrent Switch (4 workers), Switch–Undo race, Statement bytes/ledger bất biến và integrity_check.
- Typecheck, ESLint và production build PASS; build dùng database synthetic `/tmp`, không dùng dữ liệu thật. Các file `.next/types/* 2.ts` sinh trùng đã được chuyển vào `/tmp/dmd-duplicate-generated-types`; không đổi cấu hình TypeScript để né lỗi.
- Browser production build tại `127.0.0.1:3114` với fixture riêng: đăng nhập synthetic Admin, Hold Order 2 carton, chọn Route mới, để blank Tracking/Label/Net Cost, Switch thành công 1/1. Undo Hold cũ không đưa Order về Supplier cũ; tạo Hold trên Route mới vẫn thấy cả AUDITOLD1/AUDITOLD2. Mobile viewport **390×844**, scrollWidth=390, không tràn ngang; xem queue/inputs và khôi phục viewport.
- Browser không thay thế đầy đủ UAT mọi role/cost import/Excel file chooser; Excel và RBAC đã kiểm chứng bằng domain/API tests. Screenshot lưu ở `/tmp/dmd-emergency-mobile.png`.

## Quyết định Owner và giới hạn
Owner đã trả lời: Supplier giữ phạm vi invoice/payment thủ công; add-on là dịch vụ thực hưởng có doanh thu/GP, Balance Adjustment là thu hộ/chi hộ; dữ liệu cũ toàn TEST được phép reset; BOD ưu tiên GP Order đủ cost/duyệt, Estimated/Pending riêng. Đã ghi trong Decisions. Không triển khai lại bốn module này trong lượt Emergency, không gọi xác nhận nghiệp vụ là bằng chứng đã hoàn tất code/migration.

Same-Supplier route-only có bill gộp/cost mới bằng 0 hoặc miễn billing chưa có command xác nhận riêng: giữ Pending bảo thủ, không tự suy miễn phí hoặc tái dùng invoice cũ. Component coverage/ePacket aggregate và FX giữ quy tắc hiện hành; không tự suy mapping. Chưa deploy, chưa kết nối carrier thật, chưa nghiệm thu production. Các trường hợp dữ liệu/handoff không được nhập vào app vẫn cần vận hành xác minh.
