# Service Architecture V1 — Approved Decisions

Ngày: 14/11/2026. Nguồn ưu tiên: yêu cầu Owner trong phiên triển khai hiện tại; tiếp theo là quyết định trực tiếp truy xuất được và Operational Flow 16/10. Không dùng lời khẳng định của trợ lý làm phê duyệt.

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
6. Fulfillment là module trong phạm vi V1; tái dùng Purchase/reserve/charge và snapshot, không bypass Balance/Credit/Debt.
7. Add-on Revenue khóa sau ghi nhận; Cost/Supplier/Note editable. Sales được nhập Cost/Supplier riêng Add-on theo scope, không mở quyền Net/Cost dịch vụ khác.
8. Balance Adjustment được vượt limit, không tự sửa Revenue/GP hoặc thay đổi Credit Limit; Purchase vẫn giữ gate.
9. Giá Net thật phải do Owner cung cấp Excel chuẩn khi đến phần phụ thuộc. Không đọc đoán số từ ảnh/PDF, không coi fixture là giá thật. Làm phần không phụ thuộc số liệu trước.

## CONFIRMED — nguồn Operational Flow 16/10 chưa bị thay thế
Service+Sub-Service+Supplier; Client enabled-service scope/discount; một Order một địa chỉ, nhiều Lot/Carton; Express reserve lúc mua và charge tracking+label đúng một lần; optional warehouse measurement; immutable purchased price; Supplier cost reconciliation per Lot; cost transport chỉ BOD/Finance. Rule tài chính mới hơn trong feature tương ứng được ưu tiên hơn bản 16/10.

## Nguồn đã phục hồi và giới hạn
- Chat 6ad35267-1ad8-83ec-a691-9d80c58281df: 5 lượt, hasMore=false, không cursor; đọc lại 14/11.
- Chat công thức UPS 6af5587f-90ac-83ec-856e-2562aa9b8da3: 5 lượt, không cursor. User 7cbdd8fd-84de-4e09-b3d0-b13c83f689b6 trực tiếp đưa công thức; assistant normalization/rounding là giải thích tham khảo, chưa phải quyết định DMD chi tiết.
- Chat phụ phí UPS 6af4441f-5c24-83ec-9175-51b33810f336: 2 lượt; ngưỡng/phí UPS US và đề xuất AHC/LPS/OMS không phải bảng DMD được duyệt.
- File /mnt/data không có trong workspace này; đã đọc bản sources/DMD_Report_Operational_Flow_Business_Rules_2026-10-16.md, read-only. Chưa chứng minh byte-identical với /mnt/data.
- Specification giữ nội dung tham khảo chi tiết và OPEN; tài liệu này ưu tiên các xác nhận mới trên.

## OPEN / PROPOSED
OPEN: giá/zone thực VTT/SDS/JD, cận Min/Max inclusive/exclusive, missing/overlap rates, tie-break, mapping shipment→Lot, scope surcharge và rounding tiền; ePacket ngưỡng oversize/non-cont cuối cùng bằng VNĐ và supplier-inclusive components; catalogue/phí Fulfillment riêng, Sheet/Zalo/PDF/Manifest automation chi tiết.
PROPOSED: mọi mức AHC/LPS/OMS từ hội thoại UPS US; không import/activate. Tỷ giá 25.910 chỉ được audit cũ ghi nhận, chưa đọc được user turn gốc; không dùng nó tạo giá thật hoặc chạy migration ngầm.

## CURRENT — source audit baseline 2302d06
route-pricing.ts vẫn USD, Base Rate độc lập, base_markup bị cấm; ePacket adapter Standard/Eco DMD, UPS/custom manual USD; route identity/lifecycle/Client settings và reserve/charge có sẵn. Client Add-on V1 chưa có; Supplier BUY/SELL không thay thế. Xem [gap và acceptance matrix](23-service-architecture-v1.md). CURRENT không chứng minh production readiness.
