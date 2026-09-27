import fs from "node:fs/promises";
import path from "node:path";
import writeExcelFile from "write-excel-file/node";

const dir = path.resolve(".smoke");
await fs.mkdir(dir, { recursive: true });

const orderHeader = [
  "Ngày tạo","Sales","Khách","Supplier","Dịch vụ","Sub-Service","Label","Tracking","Order ID",
  "Net Cost","Base Cost","Retail","Discount","Sales Price","Phụ phí","Thuế NK","Tổng cần thu","Note",
  "Mặt hàng","Chất liệu","Giá trị hàng hoá","Số lượng Carton","Dài","Rộng","Cao","Thể tích","Khối lượng",
  "Hạng cân","Tên người nhận","Địa chỉ*","Địa chỉ 2","Thành phố*","Bang*","ZIP*","Nước*","Điện thoại"
];

const salesRow = [
  "2026-09-27","Leo Sales","Smoke Customer","","ePacket","US","","","ORD-001",
  "", "", "", 10, "", 0, 0, "", "sales draft",
  "T-shirt","Cotton",25,1,60,30,20,36000,2,"","John Doe","1 Test St","","Austin","TX","78701","US","0000000000"
];

const adminRow = [
  "2026-09-27","Leo Sales","Smoke Customer","DMD","ePacket","US","https://example.invalid/label.pdf","TRK001","ORD-001",
  10, "", "", 10, "", 0, 0, "", "admin updated",
  "T-shirt","Cotton",25,1,60,30,20,36000,2,"","John Doe","1 Test St","","Austin","TX","78701","US","0000000000"
];

await writeExcelFile([orderHeader, salesRow]).toFile(path.join(dir, "orders-sales.xlsx"));
await writeExcelFile([orderHeader, adminRow]).toFile(path.join(dir, "orders-admin.xlsx"));

const costHeader = [
  "Supplier","Dịch vụ","Sub-Service","Tracking","Ngày","Mặt hàng","Điểm đến","Cân nặng",
  "Net Price","Phụ phí","Phí HQ - Xuất khẩu -","Phí HQ - Nhập khẩu -","Total Net Cost",
  "Phụ phí Bổ sung","Thuế NK","Note"
];
const costRow = ["DMD","ePacket","US","TRK001","2026-09-27","T-shirt","US",2,10,1,0.5,0.5,12,1.5,0.5,"true cost"];
await writeExcelFile([costHeader, costRow]).toFile(path.join(dir, "costs.xlsx"));

const balanceHeader = [
  "Ngày","Hạng mục","Số tiền","Bill","Note","",
  "Service","From","To","Quantity","Total","Payment Due Date","Note","",
  "Status","Hạng mục","ID","Mô tả","Total","Note"
];
const payment = ["2026-09-27","Thanh toán",100,"https://example.invalid/bill","smoke payment"];
const serviceCost = ["","","","","","", "Manual Ops","2026-09-01","2026-09-30",1,20,"2026-10-05","smoke service cost"];
const error = ["","","","","","","","","","","","","","", "Chargeable","Carrier fee","ERR-001","smoke error",5,"chargeable"];
await writeExcelFile([balanceHeader, payment, serviceCost, error]).toFile(path.join(dir, "balance.xlsx"));

console.log(dir);
