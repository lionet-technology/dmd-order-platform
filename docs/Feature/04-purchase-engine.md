# Mua đơn & xử lý thất bại

## Owner financial update — 20/10/2026

Approved target: Client partial-success bulk purchase, explicit failed-Draft reselection, no auto retry; READY requires purchased/reserved, complete data/template and no Hold, without another balance check. Only overdue Debt and independent locks block; Statement paid/unpaid does not. Current application integration remains pending. See [approved rules](OWNER-FINANCE-2026-10-20.md) and [verification/migration/UAT](VERIFICATION-FINANCIAL-CORE-2026-10-20.md).

## Delta 18/10/2026
Purchase mới ePacket Standard/Eco DMD bị chặn nếu version active thiếu Base Rate do Owner nhập; không tự đổi Net thành Base. Snapshot lịch sử không repricing. Gate Base Rate cho luồng manual UPS/Yun/custom vẫn chưa hoàn tất, không tự tuyên bố áp dụng toàn GĐ1.

## Chốt nghiệp vụ 13/10/2026 — TARGET
- Draft không ảnh hưởng sức mua. Accepted Purchase **Reserve** giá phải thu, chưa ghi Charge. Khi event đủ điều kiện → **Charge một lần**, đồng thời giải phóng reserve tương ứng; failure/cancel trước Charge → release reserve. Sau Charge áp dụng hoàn/huỷ riêng.
- Config route có `charge_trigger`: **TRACKING_AND_LABEL** cho ePacket, UPS, YunExpress và Express; **ETD_REACHED** cho Cargo; **USAGE_RECORDED** cho Scan Active/Relabel.
- Tracking/Label không phải điều kiện charge phổ quát. ETD phải có nguồn thời gian hợp lệ; usage event phải có source ID/idempotency key. Giai đoạn 2 mới tích hợp source Label production; Cargo giai đoạn 3.
- Retry, update tracking, duplicate webhook không được charge hai lần; reserve + ledger/credit cập nhật cùng transaction.
- **AS-IS/TO-BE GAP:** code versioned hiện có reserve và tracking+label charge, nhưng chưa xác nhận framework trigger Cargo/usage; tài liệu cũ nói charge tại Purchase không được dùng làm target.


**Trạng thái:** Có triển khai trong repository, không đồng nghĩa đã được nghiệm thu production. **Rà soát:** 2026-10-13 (đọc code và tài liệu; chưa chạy E2E). **Quy tắc:** code + automated tests là bằng chứng hành vi hiện tại; yêu cầu chưa triển khai ghi riêng, không mô tả như đã chạy.

## Hành vi
- Preview/validation Draft trước khi mua; hệ thống kiểm tra quyền client, route, hold, trọng lượng/kiện, hạn mức và trạng thái.
- Mua hàng loạt dùng giao dịch nguyên tử theo mô tả ePacket: batch không hợp lệ rollback toàn bộ; tránh mua trùng bằng cơ chế idempotency.
- Phiên bản tài chính mới có reserve khi mua đang chờ, ghi charge khi tracking + label được cung cấp; thất bại/huỷ giải phóng reserve. Admin có nghiệp vụ retry theo quy định.
- Tài liệu cũ `docs/legacy-logic/epacket-pricing.md` mô tả trừ charge ngay khi purchase; cần đối chiếu với logic `docs/legacy-logic/operations-finance.md` mới hơn trước khi điều chỉnh tài chính.
## Điểm kiểm tra
- Partial failure, retry, concurrency, balance không đủ, quyền Sales, không để lộ Net Cost cho Client.
## Nguồn
- `src/app/api/purchase-jobs/`, `src/lib/credit.ts`, `src/lib/route-pricing.ts`, `scripts/verify-purchase-engine.cjs`, `scripts/verify-credit.cjs`.
## Cần xác nhận
- Màn retry/filter Draft và thời điểm thu tiền cuối cùng theo từng loại purchase legacy/versioned.

## Cập nhật 14/10/2026 — Debt gate
- Purchase gọi credit gate hiện hành: Debt/statement quá hạn block, không bypass bằng credit limit.
- Chuyển receivable sang một active Debt giải phóng room không tạo Payment; trả Debt không tăng room lần hai. Xem [Finance](./08-finance-balance.md).
