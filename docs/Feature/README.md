# Feature Index — DMD Order Platform
Cập nhật 14/11/2026. **CONFIRMED** = quyết định có nguồn; **CURRENT** = hành vi kiểm qua code; **PROPOSED** = chưa duyệt; **OPEN** = thiếu rule/bằng chứng/số liệu. Không nhãn nào tự chứng nhận production.

## Service Architecture V1
- [CURRENT selected-row VND quotes, Client Discount and immutable history; operational Purchase pending](27-service-v1-quotes.md)
Owner 14/11 đã chốt: giữ số lẻ VNĐ; UPS Shipment Surcharge một lần/Lot; Fulfillment là xử lý Order/bàn giao. [Cập nhật và kiểm chứng](../../artifacts/service-v1-2026-11-14/OWNER-CLARIFICATION.md).
- [CURRENT UPS calculator, account Review/Publish and global confirmation](26-ups-v1-core.md)
- [CURRENT staged pricing increment](25-service-v1-pricing.md)
- [CURRENT staged configuration increment](24-service-v1-configuration.md)
- [Approved Decisions và nguồn](SERVICE-V1-APPROVED-DECISIONS.md)
- [Specification chi tiết](DMD_Order_Platform_Service_Architecture_V1_Specification.md)
- [Feature 23: CURRENT, gaps, acceptance và thứ tự triển khai](23-service-architecture-v1.md)
- [Lịch sử cập nhật index trước 14/11](archive/FEATURE-INDEX-BEFORE-2026-11-14.md) — chỉ là lịch sử, không đọc trạng thái cũ như trạng thái hiện hành.

CURRENT baseline 2302d06: ePacket giá USD/Base độc lập; UPS/custom manual; reserve/charge, financial ledger, Statement V2, Debt và Supplier workflows đã có code. V1 VNĐ/sequential markup/UPS optimizer/Client Add-on chưa hoàn tất. Feature docs mô tả phạm vi và verification riêng; cần test theo thay đổi.

## Tài liệu điều hành
- [Operational Flow 16/10 — nguồn chuẩn nghiệp vụ hiện tại](./OPERATIONAL-FLOW.md): cập nhật Owner được ưu tiên hơn quyết định cũ; code/tests mô tả as-is, không thay thế yêu cầu đã chốt.
- [Kiểm chứng 16/10](./VERIFICATION-2026-10-16.md): kết quả thực tế và khoảng trống.
- [Decisions 2026-10-13](./DECISIONS-2026-10-13.md): quyết định nghiệp vụ mới, phân biệt với code hiện có.
- [Roadmap](./ROADMAP.md): 3 giai đoạn và release gates.
- [Quy trình cập nhật](./CONTRIBUTING.md).

## Danh mục
- [Debt Management](17-debt-management.md)
- [Claims & Refund Management](14-refund-management.md)
- [Tài khoản & phân quyền](./01-auth-rbac.md)
- [Orders, Draft & cấu trúc kiện](./02-orders-drafts.md)
- [Service Route & Pricing](./03-service-route-pricing.md)
- [Mua đơn & xử lý thất bại](./04-purchase-engine.md)
- [Tracking, Label & trạng thái vận chuyển](./05-tracking-label.md)
- [Huỷ đơn & hoàn tiền](./06-cancellation.md)
- [Kho, scan & Manifest](./07-warehouse-manifest.md)
- [Balance, Credit & Statement](./08-finance-balance.md)
- [Supplier Cost & Reconciliation](./09-supplier-reconciliation.md)
- [Control Tower, Cases, Claims & SLA](./10-operations-cases-claims.md)
- [Import, mẫu mua & export](./11-import-templates.md)
- [Danh mục & cấu hình dùng chung](./12-master-data.md)
