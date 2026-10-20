# Service Route & Pricing

## Tạm thời UPS / Chuyên tuyến — Owner 20/10/2026
UPS/chuyên tuyến cho Client lên Order trước khi có bảng giá tự động. Khi Admin chuẩn bị cấp Tracking/Label bắt buộc nhập **giá bán tổng toàn Order USD** (không phải Supplier Net Cost, không nhân theo số Carton). Reserve đúng một lần theo giá đó và kiểm tra Balance/Credit; khi Label xuất hiện mới Charge một lần theo `completeReserve`; giữ Snapshot/Statement V2. Giá không được sửa sau khi có Tracking/Reserve/Snapshot; thay giá sau phải theo flow Adjustment/case, không sửa im lặng. ePacket/Yun giữ báo giá tự động và 1 Carton. Khi thiếu Supplier Template vẫn được Admin nhập Tracking thủ công, nhưng export file mua Supplier không có fallback. Xem `VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`.

**Hiện hành: 18/10/2026.** Owner chọn nhập Base Rate được duyệt; không tự chuyển Net thành bảng giá bán. Xem [verification](VERIFICATION-COMMIT-2026-10-18.md).

## ePacket Standard/Eco DMD
- Version mới có weight,net,base_rate. Base Rate nhập độc lập; Net phục vụ cost.
- Retail = Base Rate × (1 + markup%); Sales Price = Retail × (1 − discount%). Đổi Net không đổi Base/Retail/Sales Price.
- Upload CSV/XLSX cần Root Owner, xác nhận bảng đã duyệt; Activate chỉ chấp nhận Base Rate dương. Không chấp nhận Base markup cũ.
- Purchase mới bị chặn nếu active version cũ thiếu Base Rate. Không tự backfill giá từ Net.
- Snapshot mua bất biến. Công thức Net→Base/Retail cũ chỉ giữ cho snapshot lịch sử/reweigh, không dùng để chấp nhận Purchase mới.
- Billable kg = max(weight,volume/5000), tier đầu tiên đủ cân, tối đa 10 kg; không round trước khi chọn tier.
- Phụ phí chiều dài/vùng xa và reweigh dùng version đã khóa.
- API config/CSV vận hành không trả Net. Download để trống Net; file nhập cần estimate hợp lệ từ nguồn được phép, không đoán giá hoặc coi ô bị che là 0.
- Seed không tự sinh Base từ Net trên DB vận hành. Giá giả lập chỉ dùng NODE_ENV=test với DB riêng.

## Route khác và giới hạn
- Khóa route: Service + Sub-Service + Supplier.
- Adapter Base Rate tự động cho UPS/Yun/custom chưa được triển khai trong thay đổi này. Luồng manual legacy còn tồn tại: không coi mọi route GĐ1 đã có gate Base Rate.
- Chưa nhận bảng giá Owner thực tế; không activate giá demo hoặc coi test fixture là UAT giá thật.
- Supplier Cost không được tự thay snapshot giá bán. Phụ phí khách riêng cần lý do/audit; coverage/FX xem feature 09.
- Cancellation theo route xem feature 06.

## Nguồn và test
src/lib/epacket-pricing.ts, route-pricing.ts; API route-pricing; route-pricing-panel.tsx.
verify-epacket.cjs kiểm tra tier/surcharge/snapshot; verify-release-gates.cjs kiểm tra Net đổi không thay giá, chặn bảng thiếu Base, Owner reload markup và không nhận Net.
