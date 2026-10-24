## Emergency đơn giản hóa — 24/10/2026
Đổi Route trên Order gốc, Tracking/Label và Net Cost optional; blank giữ nguyên. Nếu thay Tracking thì thay đủ bộ ACTIVE. Cost Supplier cũ/mới tách chứng từ, không tự COMPLETE chỉ vì giữ label; cost import sau Switch không sửa Charge. Order upload lỗi còn HOLD, lưu alert để retry; từng Order thành công được giữ. Bất kỳ carton đã export Manifest thì toàn Order xử lý thủ công. [Quy tắc hiện hành](18-emergency-route-hold.md).

# Kho, scan & Manifest

**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Mỗi thùng kho gắn đầy đủ Service + Sub-Service + Supplier, tùy chọn segment; cho phép nhiều OPEN/PAUSED.
- Quét ADD kiểm tra đồng thời tất cả kiện: sai route, Order bị huỷ/hold, hold cả route, segment mismatch sẽ BLOCK; REMOVE là thao tác lấy kiện ra và không chịu các guard nhập thêm.
- OPEN ↔ PAUSED, CLOSE và REOPEN có điều kiện; CLOSE kiểm lại guard; có history kèm actor và item snapshot.
- Phân vùng nâng cao mặc định OFF; evaluator không tồn tại/không cho kết quả không tự suy ra East/West.
## Nguồn & kiểm tra
- `src/lib/manifest-cartons.ts`, `src/lib/warehouse-guard.ts`, `src/lib/route-segmentation.ts`, `src/app/api/manifest-cartons/`, `scripts/verify-manifest-cartons.cjs`, `scripts/verify-route-segmentation.cjs`.
## Chưa triển khai
- Bộ đánh giá ZIP East/West thực tế theo quy tắc nhà vận chuyển.

## Delta đầu ngày 16/10 — lịch sử trước lượt tiếp tục (D18–D19)
- IMPLEMENTED: guard kho không bắt buộc MEASURED; cân đo thủ công, không tự động hóa và không bắt buộc trước phân loại/outbound. Không nhầm với dữ liệu khách khai để báo giá.
- APPROVED chưa hoàn tất: trội cân hợp lệ tự thu phụ phí không cần duyệt; vượt service lưu evidence, Admin hold/reroute/return. `inbound.ts` hiện vẫn PENDING_APPROVAL, quote không eligible throw/rollback, legacy route cần báo giá thủ công.
- Giữ declared/measured riêng; regression tài chính cần retry/đo lại không debit trùng và kiểm tra refund/report. Không thêm gate đo bắt buộc. Xem [Operational Flow](OPERATIONAL-FLOW.md).

## Delta lượt tiếp tục 16/10/2026
IMPLEMENTED local D19 cho ePacket Standard/Eco DMD có snapshot/version: tự charge delta dương, cùng tier thêm length surcharge cũng tính; không thu trùng/không tự refund khi đo giảm. Giữ measurement + Case HOLD khi service-invalid hoặc thiếu config; chỉ Admin giải phóng. Legacy/manual route vẫn APPROVED chưa tự động; reroute/return/đổi label chưa hoàn tất. Operations 72 checks PASS gồm audit rollback; không tự thu pending adjustment lịch sử.
