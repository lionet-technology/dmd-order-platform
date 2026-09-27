import fs from "node:fs/promises";
import path from "node:path";
import writeExcelFile from "write-excel-file/node";

const dir = path.resolve("public/templates");
await fs.mkdir(dir, { recursive: true });

const salesOrderHeader = [
  "Ngày tạo","Khách","Dịch vụ","Sub-Service","Order ID","Note",
  "Mặt hàng","Chất liệu","Giá trị hàng hoá","Số lượng Carton",
  "Dài","Rộng","Cao","Khối lượng",
  "Tên người nhận","Địa chỉ*","Địa chỉ 2","Thành phố*","Bang*","ZIP*","Nước*","Điện thoại"
];
const salesRule = [
  "RULE: Không đổi tên cột. Order ID là bắt buộc. Sales account được lấy tự động từ người đang đăng nhập.",
  "Không nhập Supplier/Tracking/Net Cost/Base/Retail/Tax ở template Sales."
];
await writeExcelFile([salesOrderHeader, salesRule]).toFile(path.join(dir, "dmd-sales-orders.xlsx"));

const adminOrderHeader = [
  "Ngày tạo","Sales","Khách","Supplier","Dịch vụ","Sub-Service","Label","Tracking","Order ID",
  "Net Cost","Base Cost","Retail","Discount","Sales Price","Phụ phí","Thuế NK","Tổng cần thu","Note",
  "Mặt hàng","Chất liệu","Giá trị hàng hoá","Số lượng Carton","Dài","Rộng","Cao","Thể tích","Khối lượng",
  "Hạng cân","Tên người nhận","Địa chỉ*","Địa chỉ 2","Thành phố*","Bang*","ZIP*","Nước*","Điện thoại"
];
const adminRule = [
  "RULE: Không đổi tên cột. Sales nên khớp Display Name hoặc Username của account đang Active."
];
await writeExcelFile([adminOrderHeader, adminRule]).toFile(path.join(dir, "dmd-admin-orders.xlsx"));

const costHeader = [
  "Supplier","Dịch vụ","Sub-Service","Tracking","Ngày","Mặt hàng","Điểm đến","Cân nặng",
  "Net Price","Phụ phí","Phí HQ - Xuất khẩu -","Phí HQ - Nhập khẩu -","Total Net Cost",
  "Phụ phí Bổ sung","Thuế NK","Note"
];
const costRule = ["RULE: Tracking là khóa link với Order. Total Net Cost có thể nhập trực tiếp."];
await writeExcelFile([costHeader, costRule]).toFile(path.join(dir, "dmd-supplier-costs.xlsx"));

const balanceHeader = [
  "Ngày","Hạng mục","Số tiền","Bill","Note","",
  "Service","From","To","Quantity","Total","Payment Due Date","Note","",
  "Status","Hạng mục","ID","Mô tả","Total","Note"
];
const balanceRule = ["RULE: Giữ nguyên cấu trúc 3 block Payment / Service Cost / Error."];
await writeExcelFile([balanceHeader, balanceRule]).toFile(path.join(dir, "dmd-balance.xlsx"));

console.log("Generated templates in", dir);
