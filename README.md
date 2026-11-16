# DMD Order Platform

Ứng dụng Next.js/SQLite quản lý Order, route/pricing, Purchase, kho/Manifest và Finance.

## Trạng thái hiện hành
Code baseline `2302d06` có đăng nhập và phân quyền server-side, Client service scope, giá ePacket USD/Base Rate độc lập, UPS/custom manual, reserve/charge và ledger/Statement/Debt/Supplier workflows. Không còn dùng role toggle giả lập.

Backend chuẩn bị V1 đã có cấu hình VNĐ bất biến, sequential pricing Review/Publish, UPS account Review/Publish và globals sau xác nhận; [bằng chứng 49 suite](artifacts/service-v1-2026-11-14/VERIFICATION.md). Các phần này chưa nối vào luồng mua/ledger vận hành.

Service Architecture V1 đang triển khai; ePacket mục tiêu VNĐ và Net→Base→Retail tuần tự. Không coi luồng USD hiện hành là V1 đã hoàn tất. Chưa chứng nhận production.

## Tài liệu chuẩn
- [Feature Index](docs/Feature/README.md)
- [V1 Approved Decisions](docs/Feature/SERVICE-V1-APPROVED-DECISIONS.md)
- [V1 Specification](docs/Feature/DMD_Order_Platform_Service_Architecture_V1_Specification.md)
- [V1 code gaps và acceptance](docs/Feature/23-service-architecture-v1.md)

Tài liệu nằm tại `/Users/quan/Desktop/report`. Trạng thái lịch sử index được lưu riêng trong archive.

## Development
`npm install`, `npm run dev`; mở http://localhost:3000.
SQLite mặc định: `data/dmd-finance-ops.db`; target tùy chọn qua `DMD_DB_PATH`. Xác minh target trước mọi reset/migration; không chạy lên production. Dữ liệu demo có thể reset sau xác minh.

Kiểm chứng: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Node và native better-sqlite3 phải cùng kiến trúc/ABI. Tests phải dùng DB tạm, không kế thừa DB vận hành. Không cần Jenkins.

Giá Net thật chỉ nhập từ Excel chuẩn của Owner; không suy giá từ ảnh/PDF hay activate fixture.

Current Service V1 requirements: [full handoff](docs/Feature/DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md), [implementation gaps](docs/Feature/31-service-v1-build-gap.md). Approval is distinct from implementation; operational VND cutover is pending.
