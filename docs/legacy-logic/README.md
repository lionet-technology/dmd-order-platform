# Archived legacy specifications (read-only historical reference)

Lưu 2026-10-13. Những tài liệu ở đây phản ánh nhiều giai đoạn thiết kế cũ. Có thể chứa công thức **Net→Base**, charge ngay khi purchase, role cũ và giả định chưa hoàn chỉnh. **Không dùng để xác nhận business rule đang có hiệu lực.**

Hãy dùng `docs/Feature/README.md` và `docs/Feature/DECISIONS-2026-10-13.md` trước, sau đó kiểm tra code và tests. Khi tìm thấy chi tiết lịch sử vẫn phù hợp mà Feature chưa có, chuyển nội dung đó vào Feature kèm nguồn xác minh (không copy mù).

Tài liệu archive:
- `logic.md`: mô hình MVP cũ, form, import, cost, pricing, auth.
- `epacket-pricing.md`: mô tả pricing/purchase ePacket ở một thời điểm trước khi chốt Base Rate + trigger.
- `operations-finance.md`: các giai đoạn rollout tài chính/case/claims.
- `domain-finance-consolidation.md`: nội bộ ledger/idempotency/audit, cần đối chiếu trước sửa.
- `warehouse-workflow.md`: workflow kho chi tiết, vẫn hữu ích để rà soát behavior hiện có.

Các file được **giữ nguyên nội dung**, chỉ thay đổi vị trí, không xóa dữ liệu nghiệp vụ.
