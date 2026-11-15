# Service Architecture V1 — Approved Decisions

Ngày: 14/11/2026. Nguồn ưu tiên: yêu cầu Owner trong phiên triển khai hiện tại; tiếp theo là quyết định trực tiếp truy xuất được và Operational Flow 16/10. Không dùng lời khẳng định của trợ lý làm phê duyệt.

## CONFIRMED — Owner continuation 14/11/2026 (supersedes older OPEN labels)
Source: direct Owner request in the current continuation of chat 6ad35267-1ad8-83ec-a691-9d80c58281df.
- UPS Express/Saver: round each carton actual/dimensional up to 0.5kg, take the carton maximum, sum cartons; Lot ≤20kg rounds up to 0.5kg. Expedited rounds carton/Lot up to 1kg. Every Lot >20kg rounds up to 1kg. Dimensional divisor remains an explicit input; no new divisor decision is inferred.
- UPS Rate Card: FIXED ≤20kg; PER_KG ≥21kg, bands 21–44, 45–70, 71–99, 100+. Unit must match billable weight; do not multiply the whole NetCost by weight. Exact Excel tiers/zone mapping and missing/overlap handling require source validation; optimizer ties still reject.
- Broker = 3% of discounted UPS transportation Net (Td); Customs = 10,000 VND/kg. Both remain Global variables under explicit save/confirm/versioning, not per-account constants or silent seeds. Destination scope beyond the existing US formula remains OPEN.
- ePacket oversize uses longest side >55cm and >75cm (strict comparisons); non-cont: AK HI PR GU VI AS MP AA AE AP. Actual VND surcharge amounts/approved USD conversion and inclusive supplier components remain OPEN. No amount is inferred.
- UPS Shipment Surcharge once per Lot.
- Owner follow-up: complete work independent of actual rate cards first; Excel/rate-dependent work deferred for later input.

## Trạng thái thống nhất
- CONFIRMED: quyết định Owner có nguồn; không có nghĩa code đã triển khai.
- CURRENT: hành vi xác minh qua code tại commit cụ thể; test ghi riêng.
- PROPOSED: phương án trợ lý/chưa được Owner phê duyệt.
- OPEN: thiếu quyết định, mapping hoặc số liệu; chỉ chặn phần phụ thuộc.

## CONFIRMED — Owner yêu cầu hiện tại, 14/11/2026
1. Thứ tự: Service Configuration → Pricing Markup/Review & Publish → UPS → Fulfillment → Add-on/ledger. Không cần Jenkins.
2. ePacket code bằng VNĐ. Dữ liệu cũ đều demo/test: được migrate VNĐ hoặc reset khi cần; phải xác minh target, không đụng production. Không bắt buộc bảo toàn dữ liệu demo bằng mọi giá. Không coi quyền reset demo là quyền reset DB chưa xác minh.
3. Net → Base → Retail là markup tuần tự: Base=Net×(1+mN); Retail=Base×(1+mB). Hai markup đều Review & Publish; Net/Account changes cũng Review & Publish. Published V1 vẫn phục vụ khi Proposal V2 chưa publish; Admin publish. Snapshot đã mua bất biến.
4. UPS account VTT/SDS/JD; rate card có Min/Max kg, FIXED/PER_KG. FIXED là tổng transportation rate; PER_KG nhân W vào transportation trước công thức, không nhân cả NetCost.
5. Tính đủ Net từng account theo account/zone/phụ phí rồi mới tối ưu. Round carton trước khi cộng Lot, theo Sub-Service. Global Fuel/VAT/US Broker/Customs auto apply sau xác nhận; pending account không tự apply cùng global.
6. Fulfillment V1 là quy trình xử lý Order → mua dịch vụ từ Supplier → Tracking/Label → Manifest/bàn giao; tái dùng Purchase/reserve/charge và snapshot, không bypass Balance/Credit/Debt.
7. Add-on Revenue khóa sau ghi nhận; Cost/Supplier/Note editable. Sales được nhập Cost/Supplier riêng Add-on theo scope, không mở quyền Net/Cost dịch vụ khác.
8. Balance Adjustment được vượt limit, không tự sửa Revenue/GP hoặc thay đổi Credit Limit; Purchase vẫn giữ gate.
9. Giá Net thật phải do Owner cung cấp Excel chuẩn khi đến phần phụ thuộc. Không đọc đoán số từ ảnh/PDF, không coi fixture là giá thật. Làm phần không phụ thuộc số liệu trước.

## CONFIRMED — Owner làm rõ trong phiên 14/11/2026
- “Không cần làm tròn tiền VNĐ, cứ để số lẻ”: giữ phần thập phân ở Base/Retail/Sales và tổng, không tự làm tròn về đồng hoặc hai chữ số thập phân. Rounding cân UPS là rule riêng.
- UPS Shipment Surcharge tính một lần mỗi Lot. Mỗi Lot là một Order gửi lên mua UPS; Order trong DMD là đơn của khách gửi một địa chỉ, có thể nhiều Lot.
- Fulfillment V1 là “Quy trình xử lý Order/bàn giao”. Catalogue dịch vụ kho tính phí riêng không phải yêu cầu của phần Fulfillment đã chốt; bỏ khỏi blocker V1.

## CONFIRMED — nguồn Operational Flow 16/10 chưa bị thay thế
Service+Sub-Service+Supplier; Client enabled-service scope/discount; một Order một địa chỉ, nhiều Lot/Carton; Express reserve lúc mua và charge tracking+label đúng một lần; optional warehouse measurement; immutable purchased price; Supplier cost reconciliation per Lot; cost transport chỉ BOD/Finance. Rule tài chính mới hơn trong feature tương ứng được ưu tiên hơn bản 16/10.

## Nguồn đã phục hồi và giới hạn
- Chat 6ad35267-1ad8-83ec-a691-9d80c58281df: 5 lượt, hasMore=false, không cursor; đọc lại 14/11.
- Chat công thức UPS 6af5587f-90ac-83ec-856e-2562aa9b8da3: 5 lượt, không cursor. User 7cbdd8fd-84de-4e09-b3d0-b13c83f689b6 trực tiếp đưa công thức; assistant normalization/rounding là giải thích tham khảo, chưa phải quyết định DMD chi tiết.
- Chat phụ phí UPS 6af4441f-5c24-83ec-9175-51b33810f336: 2 lượt; ngưỡng/phí UPS US và đề xuất AHC/LPS/OMS không phải bảng DMD được duyệt.
- File /mnt/data không có trong workspace này; đã đọc bản sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md, read-only. Chưa chứng minh byte-identical với /mnt/data.
- Specification giữ nội dung tham khảo chi tiết và OPEN; tài liệu này ưu tiên các xác nhận mới trên.

## Nguồn bổ sung đã rà soát 14/11
Danh sách ChatGPT history (50 chat gần nhất) đã được duyệt để tìm nguồn liên quan:
- Định giá USPS UPS, 6ad875c6-3478-83ec-89d3-a82c0e614373: 5 lượt, hasMore=false. User b70c09fe-d13d-4528-84fe-4e87939a0b1e yêu cầu giải thích phụ phí thường gặp cho khách và giữ phương án phụ phí bổ sung sau vận chuyển cho ngoại lệ. Các giải pháp USPS Matrix/API/residential cache của assistant là PROPOSED; không có phê duyệt bảng giá DMD.
- Giải thích giá USPS, 6adce8a0-e5d4-83ec-9c2d-f8ef11b109b3: 2 lượt. Hỏi về oz/lb; không cung cấp rate V1, không nâng giải thích assistant thành rule DMD.
- Viết công thức tính giá, 6acdd0bb-7328-83ec-9b4d-8ad7d215d655: 2 lượt. User yêu cầu sheet lookup lên tier cân gần nhất trong bảng cụ thể; ảnh không được dùng suy số và không áp tier đó sang UPS quốc tế/ePacket V1.

Các nguồn bổ sung này chưa có ba chi tiết trên; Owner đã làm rõ trực tiếp trong phiên tiếp tục, như phần CONFIRMED mới. Không có cursor đọc trang cũ ở các chat này.

## OPEN / PROPOSED
OPEN: giá/zone thực VTT/SDS/JD, chi tiết cận Min/Max từng dòng Excel, missing/overlap rates, tie-break, scope phụ phí khác; ePacket mức phí VNĐ/FX và supplier-inclusive components (ngưỡng/danh sách đã CONFIRMED ở trên); chi tiết bàn giao Sheet/Zalo/PDF/Manifest nếu cần ngoài quy trình đã có.
PROPOSED: mọi mức AHC/LPS/OMS từ hội thoại UPS US; không import/activate. Tỷ giá 25.910 chỉ được audit cũ ghi nhận, chưa đọc được user turn gốc; không dùng nó tạo giá thật hoặc chạy migration ngầm.

## CURRENT — source audit baseline 2302d06
route-pricing.ts vẫn USD, Base Rate độc lập, base_markup bị cấm; ePacket adapter Standard/Eco DMD, UPS/custom manual USD; route identity/lifecycle/Client settings và reserve/charge có sẵn. Client Add-on V1 chưa có; Supplier BUY/SELL không thay thế. Xem [gap và acceptance matrix](23-service-architecture-v1.md). CURRENT không chứng minh production readiness.

## CONFIRMED — Owner continuation 16/11/2026: Edit Order / replacement
Source: direct Owner implementation request continuing chat 6ad35267-1ad8-83ec-a691-9d80c58281df. Supersedes assistant proposal to duplicate into Draft.
- Edit shipping input, Service and Order Selling Price only before ANY Tracking/Label, including partial issuance. Confirm Service then Selling Price within one editing session; final save is atomic and rechecks issuance.
- Issued Order Edit offers Cancel and Cancel & Duplicate only under current cancellation/refund policy. Denied cancellation cannot silently cancel or mark replacement complete.
- Duplicate receives a new DMD ID, source ID link and suitable shipping/carton/service input only; no old tracking, label, Net, Supplier Account or price snapshot. New Order is PURCHASING / PURCHASE REQUESTED, never Draft; new purchase is processing, conditional on current eligibility and financial gates, with supplier/charge/ledger idempotency.
- Recalculate against current VND prices. Demo/test permission does not authorize production access. Owner says Work processed Net Excel; the corresponding handoff/commit is not present in the inspected HEAD, and its location has been requested. Do not infer missing rates or convert USD silently.
- Purchased but unissued price changes require Price Confirmation Required, Client confirmation or Admin/assigned Sales override. Preserve Purchase Request identity. Auto-priced Draft uses current price. Tracking/Label remains a separate workflow.
- IMPLEMENTATION STATUS: legacy Tracking/Label edit-lock hardening plus versioned Rate UI/API and ePacket selected-row quote conversion in this continuation. Full consent, UI, replacement and VND financial integration are pending; see [audit](28-order-edit-v1.md).

### Owner clarification during implementation — 16/11/2026
All operational prices are VND. ePacket source Net table is USD; a Rate USD–VND variable converts Net to VND before sequential Net Cost → Base Cost → Retail Price. This supersedes treating ePacket source Net as necessarily VND. The current HEAD has no operational FX variable implementation. The final Owner answers below resolve Rate versioning and separate source cancellation from new-purchase eligibility. Do not infer a numeric rate from historical assistant audits.

### Owner final answers — 16/11/2026
- Cancel & Duplicate: when cancellation is allowed, cancel the source with 100% refund (net of prior refunds; release only if uncharged). New price goes through the approved charging/financial eligibility flow. This supersedes the earlier policy refund percentage **for this combined action only**; cancellation eligibility and ordinary Cancel policy remain. A failed new purchase must not be represented as a completed replacement or silently bypass money conditions.
- Rate USD–VND: Admin enters and confirms a version, retained in price snapshots; applies to new quotes/Purchases. No retrospective mutation of accepted snapshots. Numeric rate is configured, never inferred from old audits.
- CURRENT increment: [Rate UI/API and USD-source conversion](29-service-v1-fx.md). This is not yet operational VND ledger cutover or full Edit/Cancel & Duplicate implementation.
