# Browser UI UAT — Client Carton / Admin Tracking, 20/10/2026

## Môi trường và phạm vi

Đã thực hiện kiểm tra thao tác bằng **Google Chrome headless thật** kết nối Chrome DevTools Protocol, riêng biệt với CodingAgent browser companion chưa được pair. Chạy local `http://127.0.0.1:34191` trên DB synthetic `.smoke/ui-multi-carton-20261020-unique.db` sinh từ `seed-epacket.cjs`, thêm Route test UPS Express tối đa 4 Carton cho Client test. Không kết nối carrier, không tạo label thật, không chuyển tiền, không dùng database mục tiêu triển khai. Không đụng `Codex/`.

## Bằng chứng thực tế

- Chrome đã thực sự render trang, đăng nhập bằng Client và Admin synthetic; không chỉ kiểm tra source hay API.
- Client mở modal `Tạo / Import & Đặt mua dịch vụ`, Route UPS Express có lựa chọn **Single Carton / Multiple Cartons**, chọn Multiple, nhấn Thêm Carton hai lần để thấy Carton 2 và 3. `Carton Quantity` tự tăng và không cho sửa; bấm Bỏ Carton 2 khiến tổng trở lại 2. **Đã PASS** bằng thao tác DOM trong Chrome.
- Admin đăng nhập, vào Orders rồi mở `Mua đơn hàng loạt`; Chrome đã render bảng với tiêu đề DOM **Giá bán USD (Order)**. Kiểm tra `th.textContent`, không dùng `innerText` vì CSS uppercase ảnh hưởng nhãn hiển thị. **Đã quan sát được**, nhưng cần rerun độc lập để thu nhận receipt PASS cuối và screenshot Admin.
- Ảnh Chrome Client: `evidence/manual-carton-ui-2026-10-20/client-multi-carton.png`. Screenshot/Admin thao tác nhập giá & Tracking chưa có evidence xác nhận thành công.

## Phát hiện và xử lý UI

- Trước đây chuyển **Single → Multiple** làm mất thông tin Order đang nhập vì reset toàn bộ form. Đã sửa để giữ các trường đã nhập. Chuyển **Multiple → Single** khi đã thêm Carton hiện cảnh báo xác nhận vì sẽ mất các Carton bổ sung; nếu đồng ý chỉ xóa dữ liệu Carton thêm, giữ thông tin Order/Carton 1.
- Bộ thử UI dùng `scripts/uat-browser-cdp.py`, chỉ làm việc với origin localhost và DB marker synthetic; Chrome headless có những lần khởi động không mở được cổng debugging khi máy gần đầy dung lượng. Các lần chạy lỗi môi trường không được tính là ứng dụng thất bại hay UI PASS.

## Regression và giới hạn

- Tính giá UPS/chuyên tuyến GĐ1 là giá bán **toàn Order do Admin nhập trước Tracking/Label**. Các test API trước đó đã kiểm tra 1 Reserve, 1 Charge dù 3 Carton, invalid price rollback, retry và Statement V2 (`VERIFICATION-MANUAL-UPS-CARTON-2026-10-20.md`). Browser UI nêu trên **không** thực hiện một giao dịch xuyên luồng UI từ Client đến Admin và Statement.
- Còn cần full browser UAT: nhập dữ liệu/submit thực sự trên form Client, Admin cấp giá + tracking thật trên fixture, retry/error UX, Supplier Template export, Warehouse Manifest và kiểm thử đủ 5 role/mobile. Không tuyên bố release/UAT hoàn tất.
