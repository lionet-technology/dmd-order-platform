# Sổ phải trả Supplier nội bộ — GĐ1

## Quyền hiện hành 18/10/2026
BOD/FINANCE là role riêng, được invoice/payment/allocation/reversal theo audit của module này. Admin vận hành không được đọc/ghi API. Root Owner cấp role tường minh. Không có chuyển tiền ngân hàng qua app. Supplier portal vẫn deferred; xem feature 01 và verification mới.

**APPROVED:** Owner chọn đưa invoice/thanh toán/còn phải trả vào GĐ1 trong chat tiếp tục ngày 16/10/2026. Portal/login Supplier vẫn DEFERRED. **IMPLEMENTED local:** module, API, UI, regression; chưa production/UAT với chứng từ thực tế.

## Phạm vi
- Invoice USD theo Supplier đang active, số invoice không trùng (không phân biệt hoa/thường), ngày invoice/hạn trả, tham chiếu chứng từ và lý do bắt buộc. Số tiền dương, tối đa hai chữ số thập phân; lưu integer cents. Không tự import lịch sử hoặc suy invoice từ supplier_costs.
- Ghi nhận khoản đã thanh toán thực tế, không gửi lệnh chuyển tiền. Phân bổ 1–200 invoice cùng Supplier, tổng phân bổ đúng tổng thanh toán, từng invoice không vượt số còn phải trả. UI GĐ1 ghi một invoice mỗi lần; API hỗ trợ nhiều invoice.
- Tham chiếu thanh toán unique theo Supplier; request_key bắt buộc. Replay cùng payload trả kết quả cũ, khác payload cùng key bị từ chối. SQLite immediate transaction bảo vệ kiểm tra outstanding + allocation + audit + receipt.
- Ngày invoice và ngày đã trả không ở tương lai; due date không trước invoice; paid date không trước invoice được phân bổ. Không FX/prepayment/credit note chưa phân bổ ở GĐ1.
- Có thể trả hết nghĩa vụ của Supplier đã inactive. Supplier đã có invoice không được đổi tên; deactivate tên cũ/tạo tên mới để giữ lịch sử. Không sửa tên lịch sử bằng cascade.

## Tính tổng và chỉnh sai
- Outstanding = invoice amount − tổng allocation từ payment chưa đảo. Invoice void có outstanding 0, giữ dữ liệu gốc.
- Trả một phần/đủ và quá hạn được tính theo hạn trả, ngày Asia/Ho_Chi_Minh.
- Đảo ghi nhận payment tạo reversal append-only, khôi phục outstanding; không xóa payment/allocations hoặc tự hoàn tiền ngân hàng. Hủy invoice chỉ khi chưa có active payment; lý do/audit bắt buộc. Chỉnh sai bằng đảo/hủy rồi ghi chứng từ mới.
- Invoice, payment, allocation, event, reversal, void đều có trigger chặn UPDATE/DELETE; audit failure rollback toàn bộ command. Repeated schema initialization additive giữ dữ liệu.

## Tiền và cost
- Sổ này độc lập Client Balance/Credit/Debt, Supplier Recovery và Order cost components. Ghi invoice/payment không sinh lại supplier_costs, không đổi Order GP/giá bán, không trừ Balance khách.
- Cost đã đối soát không chứng minh đã thanh toán Supplier. Payment không chứng minh coverage Mid-mile đã actual. Người vận hành đối chiếu tham chiếu chứng từ; chưa adapter tự mapping invoice → cost feed/Lot.

## Quyền và giao diện
- GET/POST `/api/supplier-payables`: ADMIN hiện hành; SALES/CLIENT/WAREHOUSE 403, chưa đăng nhập 401. Actor lấy từ session, không nhận created_by từ body.
- Màn **Supplier Costs & Phải trả** có bảng invoice, số còn trả theo Supplier, form ghi/đảo/hủy và lịch sử payment. API có allocation và 500 audit events gần nhất; lịch sử đầy đủ vẫn trong DB.
- Đây là quyền tạm theo Finance Controls hiện hành; yêu cầu D22 tách BOD/finance khỏi Admin vận hành chưa hoàn tất, vẫn là release blocker. Chưa cấp portal/login cho Supplier.

## Nguồn và kiểm chứng
- `src/lib/supplier-payables.ts`, `src/app/api/supplier-payables/route.ts`, `src/app/supplier-payables-workspace.tsx`, `src/lib/enums.ts`.
- `scripts/verify-supplier-payables.cjs`: 48 assertions PASS trên DB test riêng, gồm role API/domain, actor spoof, duplicate/retry/conflict, phân bổ, overpayment, rollback audit, reversal, immutable history, schema rerun và không đụng Client ledger/cost.
- Còn: UAT chứng từ thực tế, đối chiếu migration/backup, role finance riêng, FX, prepayment, credit note, export/đóng kỳ và adapter invoice/cost. Không coi đã vận hành production.
