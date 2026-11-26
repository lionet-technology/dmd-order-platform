# GĐ1 · Bước 1 UAT bằng dữ liệu giả lập

## Dựng lại TEST

Từ repo chính thức, dùng Node.js arm64 tương thích với SQLite của workspace. Mỗi lần chạy seed tạo thư mục tạm mới, SQLite riêng và tệp `test-access.json` có quyền đọc/ghi của người tạo. Seed tạo mật khẩu TEST mới mỗi lần. Tệp truy cập chứa tên đăng nhập, vai trò, ID và mật khẩu của lần seed đó.

```sh
node scripts/seed-gd1-synthetic-uat.cjs
npm run build
```

Dùng đường dẫn `database` in ra ở bước seed để khởi động ứng dụng tại localhost. Duy trì giá trị `DMD_DB_PATH` khi khởi động lại. Dựng mới fixture để quay về dữ liệu ban đầu.

```sh
DMD_DB_PATH='/đường/dẫn/test.db' npm run start -- -H 127.0.0.1 -p 43126
```

Mở `http://127.0.0.1:43126`. Các tài khoản chính là `synthetic.admin`, `synthetic.finance`, `synthetic.bod`, `synthetic.sales` và `synthetic.client`. Client phụ `synthetic.low-funds` dùng để kiểm tra thiếu sức mua. Mật khẩu chỉ nằm trong tệp truy cập được seed tạo trên máy.

Bộ Chrome sao lưu SQLite, đối chiếu từng dòng và chạy trên một bản sao. Thư mục kết quả cần là đường dẫn mới. Có thể đặt `DMD_BROWSER_NODE_MODULES` trỏ tới thư mục chứa Playwright và `DMD_CHROME_PATH` trỏ tới Chrome. Thư mục chạy chứa hai bản SQLite TEST để kiểm chứng phục hồi. Khi chia sẻ bằng chứng, lấy JSON kết quả và ảnh.

```sh
node scripts/e2e-gd1-synthetic-uat.cjs '/đường/dẫn/test-access.json' '/đường/dẫn/kết-quả-mới' after
```

## Dữ liệu và cách đọc hàng chờ

- 100 Order thử mua thuộc ba tuyến Chuyên tuyến giả lập. 85 có Reserve, 5 thiếu điện thoại, 5 thiếu sức mua và 5 bị Hold. Một số Order có hai carton và hai Lot. Fixture tạo thêm 470 Order đã phát để so khớp 500 dòng Supplier trong ba lần import, trong đó 30 dòng Tracking không khớp.
- `TEST-ISSUED-001` có cước, phụ phí và thuế Client, Actual Supplier, Refund trả về Balance và Supplier Recovery có cấn trừ. Seed kiểm tra GP-Net tăng đúng một lần khi duyệt Recovery và giữ nguyên khi cấn trừ. Account phụ có bút toán Debt giả lập.
- Mua đơn hàng loạt hiện dùng trạng thái mua VNĐ để đưa Order sang **Cần xử lý** với lý do cụ thể. Ô giá VNĐ hiển thị báo giá đã lưu. Luồng chốt giá và thay tuyến của Order VNĐ dùng các thao tác tương ứng ở màn hình VNĐ và Emergency. Lưu Tracking/Label tiếp tục kiểm tra giá và Reserve ở thời điểm ghi.
- Danh sách **Chưa chốt giá bán USD** ở Tổng quan dành cho quy trình chốt giá thủ công USD. Báo giá VNĐ xem trong luồng VNĐ.
- Dữ liệu workload Chuyên tuyến dùng giá, tên Carrier, Tracking và chứng từ giả lập. Bộ hồi quy baseline dùng thêm cấu hình tuyến và nguồn giá kiểm thử sẵn có trong repo cho ePacket, UPS và Yun.

## Kịch bản Owner UAT ở Bước 2

| Vai trò | Tác vụ đề nghị | Điểm đối chiếu |
|---|---|---|
| Admin | Mở Orders → Mua đơn hàng loạt. Mở tab Cần xử lý, đọc ba nhóm lý do. Quay lại Sẵn sàng mua, lọc TEST Express và chọn Order hai carton. | Một lựa chọn cho cả Order. Dán hai dòng Tracking và Label, đổi bộ lọc rồi quay lại trước khi lưu. Kiểm tra đủ hai carton mới ghi tiền. |
| Admin | Mở Order đang Hold và Pending Supplier Recovery. | Đọc nguyên nhân, phạm vi Hold và hành động tiếp theo. Mở liên kết Claim của `TEST-ISSUED-001` và đối chiếu Carrier/lượt fulfillment. |
| Finance | Mở Sổ VNĐ, nhập Supplier `TEST Carrier A` rồi chọn Tải queue Supplier và lọc hàng lỗi. Mở Balance và xem Claim/Refund cùng Recovery. | 30 Tracking chưa khớp. Xác định dòng đủ điều kiện và đọc nội dung cần sửa. Đối chiếu Refund, khoản phải thu còn lại và số Balance. |
| Sales | Mở Orders, tìm `TEST-ISSUED-001`, chọn View VNĐ, kiểm tra Tracking rồi quay lại danh sách. Mở báo cáo hoa hồng theo quyền Sales. | Bộ lọc được giữ. Thông tin Supplier và sổ nội bộ đi theo quyền hiện hành. |
| Client | Vào Orders và Balance Ledger; dùng tài khoản phụ để xem ca thiếu sức mua. | Thấy đơn của tài khoản, Tracking và giao dịch Refund/Balance. Đọc được điều kiện để tiếp tục Order thiếu sức mua. |
| BOD | Mở báo cáo VNĐ và Control Tower. | Đối chiếu GP-Net với Refund/Recovery và xem riêng số liệu tham chiếu GP-Base/hoa hồng. |

Các tác vụ Bước 2 dùng TEST. Ghi lại tài khoản, thiết bị, Order ID, bước thao tác và ảnh khi có vướng mắc. Điều hướng trên điện thoại thật, chứng từ Supplier thật, Claim lịch sử thiếu phân bổ và trường hợp bản sao cùng chứng từ dưới mã khác vẫn là hạng mục nghiệm thu thủ công. Chọn hồ sơ/mapping/định danh chứng từ và cấu hình void thực tế ở giai đoạn pilot sau UAT.
