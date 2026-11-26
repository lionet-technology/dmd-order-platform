# Owner UAT · Bước 2

Mở [DMD Order Platform TEST](http://127.0.0.1:43126/) bằng Chrome trên máy Mac chạy TEST. Mỗi vai trò dùng một phiên đăng nhập riêng. [Kiểm tra HTTP](http://127.0.0.1:43126/api/auth/status).

Tài khoản TEST gồm `synthetic.admin`, `synthetic.finance`, `synthetic.bod`, `synthetic.sales`, `synthetic.client`. Dùng `synthetic.low-funds` để xem ca thiếu sức mua. Trên máy chạy TEST, mở `test-access.json` do seed tạo và dùng giá trị `password` để đăng nhập. Tệp có quyền `0600`. Giữ tệp và mật khẩu trên máy. Lần seed mới tạo mật khẩu mới.

## Thứ tự kiểm tra

| Vai trò | Thao tác | Đối chiếu |
|---|---|---|
| Admin | Orders → Mua đơn hàng loạt. Lọc TEST Express, mở `TEST-BULK-010` và thử dán hai dòng Tracking/Label. Mở ca `TEST-ISSUED-001` trong Order Detail và xem Control Tower. | 85 sẵn sàng, 15 cần xử lý. `TEST-BULK-086` đang Hold, `TEST-BULK-091` thiếu điện thoại, `TEST-BULK-096` thiếu sức mua. `TEST-BULK-010` có hai carton. `TEST-ISSUED-001` có `TEST-TRACK-001`. |
| Finance | Mở [Sổ VNĐ](http://127.0.0.1:43126/vnd), nhập `TEST Carrier A` rồi chọn Tải queue Supplier. Lọc hàng lỗi. Chọn dòng có thể Accept để duyệt phần đủ điều kiện. Với Excel giả lập đã nhập bằng template có cấu phần, mở Điều chỉnh thành phần qua Excel, xuất Exception Queue, sửa Proposed VNĐ, xem trước và lưu đề xuất. | Fixture có 500 dòng, 30 Tracking không khớp từ `TEST-UNMATCHED-001` đến `TEST-UNMATCHED-030`. Dòng bị chặn ở lại queue. Đối chiếu Claim/Refund của `TEST-ISSUED-001` và khoản Supplier còn phải trả DMD là 15.000,115 VNĐ. |
| BOD | Mở [Sổ VNĐ](http://127.0.0.1:43126/vnd), chọn tháng 11/2026 và Xem báo cáo VNĐ. | GP-Net mẫu 94.500,34 VNĐ. Control Tower thuộc luồng Admin trong kịch bản này. Qua BOD, tuyến Control Tower trả 403 theo phân quyền hiện tại. |
| Sales | Mở Orders → `TEST-ISSUED-001` → View VNĐ, xem Tracking/Label và quay lại danh sách. Xem Balance Ledger và giao dịch VNĐ của Client được phân công. | Client chính và Client phụ đều thuộc Sales mẫu. Sales bị chặn khỏi hàng chờ mua của Admin. |
| Client | Mở Orders → `TEST-ISSUED-001` → View VNĐ, rồi mở Balance Ledger và kiểm tra Refund VNĐ. Đăng nhập bằng `synthetic.low-funds` để xem `TEST-BULK-096`. | Client chính thấy Tracking và Refund của chính mình. Client chính không thấy Order của Client phụ. |

## Kết quả smoke ngày 26/11/2026

Bản chạy TEST được dựng từ `1f5bfec9bb5db5629ca301f715ddc1621da6137e`. Sau khởi động lại, SQLite TEST giữ 570 Order và 500 dòng Supplier, SQLite quick check trả `ok`. Chrome đăng nhập đủ năm vai trò trên cổng 43126. Admin và Finance chạy ở 1440 px, BOD, Sales và Client ở 390 px. Chrome chạy lại trên bản sao TEST ở 1440 px và 390 px, lưu một lần đổi Tracking/Label sau khi xem trước lại, giữ nháp qua lỗi 503 và ghi đúng một charge `-200000.125` VNĐ khi thử lại. Backup/restore so khớp từng dòng ở 152 bảng của SQLite đang chạy, gồm kiểm tra toàn vẹn và khóa ngoại. Bộ hồi quy Supplier Import chạy 97 kiểm tra trên SQLite riêng, gồm sửa cấu phần Excel, duyệt riêng dòng đủ điều kiện và chặn dòng lỗi.

## Ghi phản hồi

`Vai trò · Thiết bị/trình duyệt · Order/Tracking · Các bước · Kỳ vọng · Thực tế · PASS/FAIL · Ảnh nếu có`

Chụp ảnh phần cần minh họa và bỏ thông tin đăng nhập khỏi ảnh. Đánh giá thứ tự thao tác, cách đọc lỗi và khả năng tự phục hồi khi quay lại một màn hình. Điều hướng trên điện thoại thật, thao tác của Owner và Excel Supplier thật còn OPEN. Dùng dữ liệu giả lập cho đợt này. Pilot chưa bắt đầu.

## Khởi động lại hoặc reset

Để giữ các thao tác Owner đã ghi, dừng tiến trình TEST đang dùng cổng 43126 rồi chạy lại cùng SQLite. Để reset, tạo SQLite TEST mới bằng seed, đổi sang đường dẫn `database` vừa in và lấy mật khẩu từ `accessFile` mới. Seed cũng là cách khôi phục khi thư mục tạm hết hạn.

```sh
cd /Users/quan/Developer/report
# Chạy với Node.js arm64 tương thích với SQLite.
node scripts/seed-gd1-synthetic-uat.cjs
node scripts/build-isolated.cjs --webpack
DMD_DB_PATH='/đường/dẫn/test.db' node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 43126
```

[Hướng dẫn và kịch bản chi tiết](UAT-GD1-SYNTHETIC.md) · [Bằng chứng Bước 1](../../artifacts/gd1-synthetic-uat-2026-11-26/ACCEPTANCE.md)
