# Debt Management

## Owner correction — 23/10/2026 (supersedes combined aging below)
Statement Credit Term applies only to negative net Balance. Transferred Debt is excluded from this amount, even when the originating Statement is already overdue. Debt retains its own deadline; the existing policy blocks future purchases when that deadline is past. Extension affects that Debt deadline only. Partial transfers retain aging on the residual Balance; full transfers clear Balance aging without fabricating Payment, changing signed ledger Balance or releasing purchasing room twice. Payment priority remains posted interest → Debt principal → Balance.

Immutable Statements keep their issued values. The next reporting period records signed Balance→Debt movements; its UI explains the independent Debt deadline. Historical snapshots are never rewritten into payments. Opening certification requires the exact uncovered Balance amount and a valid date, records the actor/audit, and accepts an empty optional evidence note. No existing DB was reset.

See [verification and UI findings](VERIFICATION-BALANCE-DEBT-SPLIT-2026-10-23.md).

## Cập nhật Owner 23/10/2026 — tuổi nợ đơn giản theo Statement
**Nguồn tuổi nợ:** khoản gốc còn phải trả theo Balance + Debt, không đếm trùng chuyển sổ; so với **nghĩa vụ gốc kinh tế tăng thêm theo từng kỳ Statement Finalized**, đọc từ chỉ mục bất biến `statement_v2_aging_basis` khi đã có. Kỳ mở giảm sức mua ngay nhưng chưa tạo ngày quá hạn. Credit Term bắt đầu từ **period_end** chứ không phải finalized_at. Payment chỉ giảm khoản còn phải trả, không lập bảng FIFO Payment→Statement. Phần lãi dự phóng chưa ghi sổ tách khỏi tuổi gốc; UI hiển thị lãi đã ghi sổ và tạm tính riêng, cùng `1/2 tuần`, `3/4 tuần` nếu Credit Term là bội số 7 ngày. Credit Note âm không tự gây REVIEW; thiếu coverage thực sự cần Admin đối chiếu mốc mở sổ, nhập chứng từ và số tiền chính xác một lần (không thay đổi Money Ledger). Chốt kỳ mới vẫn phải theo thứ tự; khi thiếu giá UPS/chuyên tuyến, Alert ưu tiên từ Dashboard. Chi tiết thay đổi, giới hạn kiểm thử và migration fixture kiểm chứng opening: `VERIFICATION-DEBT-AGING-2026-10-23.md`.

Current implementation: 22/10/2026. [Owner execution and accounting assumptions](OWNER-EXECUTION-2026-10-22.md).

## Account and actions
A Client has one Debt account. Admin converts only existing negative net Balance, with amount, deadline, optional daily rate and reason/proof text. Review shows before/after Balance and Debt; submit revalidates the amount inside an immediate transaction. The existing financial command creates an idempotency receipt, adds principal to the same account, records immutable transfer before/after and audit. No Payment is fabricated. Multiple legacy accounts block purchasing and require reconciliation; they are not merged.

The horizontal Debt tab shows remaining principal, posted plus projected unpaid completed-day interest, total due, Debt deadline/status, oldest covered finalized Statement date, credit-term due/status and the Client credit term. Admin can change prospective rate or extend Debt deadline through existing actions. Principal changes, interest rows and Payments are visible in bounded history. Extending a Debt deadline does not rewrite frozen Statement aging.

## Age and safety
Coverage uses signed combined remaining obligations and frozen incremental economic buckets newest-to-oldest, including open-period capacity without giving it an invented finalized date. Transfers and allocations cancel; Payment settlement is not treated as new obligation capacity. Partial Payment can move the oldest covered bucket. No allocation is written by financial GET. Ambiguous legacy opening, unknown types or late edits to frozen sources are REVIEW and block new buying.

Daily interest projection rounds each completed Vietnam day separately, uses the effective principal/rate segment and excludes already posted days and the current day. It is read-only and labelled separately from posted Statement balances. Explicit monetary commands materialize the same completed days before settlement.

Payment priority remains interest → principal → wallet. Signed Refund and immutable Statement snapshots are independent. See the linked execution note for assumptions, caller audit, test boundaries and the default-DB bootstrap incident.
