# Chi tiêu nội bộ — VND

**Trạng thái:** Implemented MVP; kiểm chứng 27/10/2026; chưa nghiệm thu production.

## Phạm vi và quyền
BOD và FINANCE đều tạo, sửa, ghi thực chi, đảo khoản ghi sai và xem audit; không có phê duyệt nhiều cấp. ADMIN, SALES, CLIENT, WAREHOUSE và anonymous bị chặn trên server. Tab **Chi tiêu nội bộ** nằm trong workspace tài chính. Không xuất thông tin sang API Client/Sales, không ghi Client Ledger, Refund, Order GP hoặc Statement.

## Dữ liệu và lịch đến hạn
Mỗi khoản có tên, category, note bắt buộc, payee/document optional, tổng cam kết và 1–100 đợt gồm mã ổn định, ngày đến hạn và tiền riêng. Tổng đợt phải bằng tổng cam kết; mã không trùng; VND nguyên, >0, tối đa 1.000 tỷ cho một khoản/tổng thực chi một khoản. Tổng báo cáo vượt phạm vi số nguyên chính xác bị từ chối.

Category: PAYROLL_BONUS, RENT, OFFICE, IT_PROJECT, MARKETING, LEGAL, OTHER. Lương/thưởng có COMMISSION nhập tay (`commission_vnd`), **đã nằm trong tổng**, không cộng thêm hoặc tự tính từ Orders/GP. Chỉ VND; FX là công việc đầu tiên của giai đoạn 2. Không phân bổ/amortization kế toán.

## Thực chi, sửa và ngoại lệ
Mỗi lần chi chọn một đợt, số tiền, ngày thực chi đã qua/hôm nay, mã chứng từ và lý do. Hỗ trợ trả từng phần nhiều lần. Đã chi = tổng sự kiện có dấu; còn lại và vượt hiển thị riêng, không bù vượt giữa các khoản. Mặc định chặn vượt đợt hoặc cam kết. Ngoại lệ phải có `allow_overpay: true` và `exception_reason` khác rỗng; không tự tăng cam kết, không tự cap tiền.

Sửa kế hoạch dùng `expected_version`, lưu toàn bộ phiên bản/lý do/người sửa/thời điểm. Không hạ cam kết hoặc đợt xuống dưới đã chi, không xóa đợt đã có lịch sử; khoản đã có ngoại lệ vượt vẫn sửa metadata được nếu không giảm thêm cam kết/đợt. Thanh toán cũng yêu cầu phiên bản lịch hiện tại, tránh ghi theo lịch đã bị sửa.

Đảo **toàn bộ** một payment gốc bằng một sự kiện âm có `reversal_of` duy nhất, ngày hôm nay và lý do. Không đảo hai lần hoặc đảo bút toán đảo. Nếu nhập sai số tiền: đảo rồi ghi lại payment đúng với key mới; lịch sử gốc giữ nguyên. Đây là sửa bản ghi thực chi, không tự thực hiện chuyển khoản/thu hồi tiền từ ngân hàng.

Mọi lệnh và receipt nằm trong một SQLite immediate transaction. Key toàn module; hash gắn actor và payload chuẩn hóa, retry giữ nguyên trả đúng receipt gốc dù trạng thái sau đó thay đổi; key trùng payload khác/actor khác bị chặn. Unique reversal và kiểm tra dư trong transaction bảo vệ yêu cầu đồng thời. Không dựa vào warning ở UI để kiểm soát tiền.

## Báo cáo tháng / audit
BOD và Finance xem tổng cam kết **hiện tại**, thực chi lũy kế, còn lại/vượt, tổng lịch đến hạn trong tháng chọn và thực chi ròng trong tháng (theo `paid_date`, gồm đảo). API cũng trả breakdown category; category dùng phân loại hiện tại. Đây không phải báo cáo tổng lợi nhuận công ty hoặc đối soát bank tự động. Sửa kế hoạch/category có thể đổi số cam kết/đến hạn/category của báo cáo quá khứ; audit giữ phiên bản gốc, chưa có khóa sổ riêng cho chi tiêu nội bộ. Statement khách hàng đã finalize không đổi.

## API / DB / kiểm thử
`GET /api/internal-expenses?month=YYYY-MM` trả items + report, private/no-store. `POST` actions `create`, `edit`, `pay`, `reverse`; `request_key` hoặc header Idempotency-Key, lý do bắt buộc. Money VND lưu nguyên, không dùng cents USD của Client.

Các bảng additive: `internal_expenses`, `internal_expense_versions`, `internal_expense_payments`, `internal_expense_receipts`; UPDATE/DELETE bị trigger chặn. Không backfill, không reset dữ liệu cũ.

Code: `src/lib/internal-expenses.ts`, API tương ứng, `src/app/internal-expenses-workspace.tsx`.
Tests: `scripts/verify-internal-expenses.cjs` (domain/API, receipt rollback, quyền, race nhiều SQLite connection); `scripts/e2e-expenses-refunds.cjs` (HTTP thực, Chrome, mobile). Bằng chứng/kết quả và giới hạn xem [verification](VERIFICATION-EXPENSES-REFUNDS-2026-10-27.md).

## Chưa triển khai
FX, tự tính Commission, approval nhiều cấp, phân bổ kế toán, kết nối ngân hàng, khóa sổ chi tiêu và phân trang cho danh sách quy mô lớn. Không xóa audit hoặc suy diễn chứng từ/chi phí lịch sử.
