# DMD Report — rà soát bổ sung 15/10/2026

Source: /Users/quan/Desktop/report, branch main, baseline HEAD cebd058. Thay đổi local được tiếp tục; chỉ Owner và ChatGPT phát triển source. Báo cáo này thay thế các mục TypeScript/Claim allocation còn thiếu trong báo cáo trước cùng ngày, không xác nhận production-ready.

## Đã hoàn thiện
- TypeScript: loại thư mục Codex/ chứa bản sao source lịch sử khỏi compilation; giữ strict và kiểm tra source hiện hành. Bổ sung npm run typecheck. Không xoá các bản sao.
- Claim mới: Admin nhập số tiền refund từng Order; tổng bằng refund Claim, mỗi Order xuất hiện đúng một lần và không vượt cước còn được hoàn. Một Order tự phân bổ toàn bộ. Compensation vẫn riêng theo Claim.
- Bảng additive claim_refund_allocations lưu cent cho mọi Order của Claim, kể cả 0. Ghi cùng immediate transaction với decision, ledger, audit; retry không trả tiền thêm.
- Claim và Cancellation dùng chung phép tính charge/refund theo Order, bao gồm phụ phí Order/Lot. Claim chồng lặp không làm mất số tiền còn được hoàn của Order khác.
- Claim lịch sử chưa phân bổ vẫn trừ bảo thủ toàn Claim khi kiểm tra từng Order. Không tự gán tỷ lệ hoặc ghi lại lịch sử.
- UI Admin thêm trường phân bổ theo Order; public note ghi phần hoàn cước riêng Order. Audit FINALIZED chứa phân bổ.
- Sửa seed demo tương thích rule Debt deadline, allocation và các bảng mới: tạo Debt hợp lệ rồi đặt deadline quá hạn riêng fixture; trạng thái draft CANCELLED là fixture tĩnh, không seed policy Supplier giả. Dọn bảng con trước bảng cha; giữ kiểm tra foreign keys và bảo vệ reset demo.
- Feature Docs 06, 08, 10 và README cập nhật cùng code.

## Kết quả thực chạy
Node 20.20.2; database test tạm hoặc fixture .smoke, không dùng DB thật.

| Kiểm tra | Kết quả |
|---|---:|
| npm run typecheck | PASS |
| npm run build (DMD_DB_PATH=/tmp/dmd-build-20261015.db) | PASS |
| ESLint các file sửa | PASS |
| git diff --check | PASS |
| RBAC | 23 |
| Order Flow | 24 |
| Cancellation | 128 |
| Purchase Engine | 45 |
| Route Segmentation | 36 |
| Manifest Cartons | 57 |
| ePacket | 159 |
| Debt/Reconciliation | 48 |
| Credit | 48 |
| Operations | 57 |
| SLA/demo | 47 |
| Domain Finance | 69 |
| Balance idempotency | 6 |

13 bộ regression PASS, tổng 747 checks/assertions. Operations thêm kiểm tra allocation đúng Order, giới hạn từng Order, tổng sai, Order trùng, Claim chồng lặp, refund cancellation và legacy chưa phân bổ. SLA/demo ban đầu phát hiện fixture cũ không theo rule mới; đã sửa và chạy lại PASS.

Chưa chạy browser UAT hoặc migration dữ liệu thật. Build local không phải deploy. Không reset/xoá DB production, không push, không deploy. Source vẫn chưa commit.

## Owner cần cung cấp/chốt trước release
1. Ma trận huỷ thực tế cho từng Service/Sub-Service/Supplier: trạng thái được huỷ, tỷ lệ hoàn, điều kiện và căn cứ hợp đồng. Route thiếu policy tiếp tục bị chặn.
2. Carrier: tài liệu API void/cancel, môi trường sandbox, credentials và quy trình xử lý khi carrier từ chối/timeout. Chưa tích hợp API carrier; huỷ trong app chưa chứng minh label đã void tại carrier.
3. Claim lịch sử: phân bổ từng Order dựa trên chứng từ; phê duyệt danh sách đối chiếu. Không tự backfill. Claim mới do Admin quyết định số tiền từng Order, không tự chọn tỷ lệ.
4. UAT cùng Owner theo role Admin/Sales/Client/Warehouse; database snapshot an toàn và môi trường staging để diễn tập migration/rollback, đối chiếu Balance, refund, Debt và đối soát Lot. Chưa có nghiệm thu này.
5. Các giới hạn hiện hữu cần scope tiếp: nhiều Debt legacy, FX/supplier cost mapping, báo cáo GP kỳ khoá, scheduler lãi độc lập và quy tắc phân bổ support credit vào GP.

Không nên xác nhận mọi thứ đã sẵn sàng production chỉ dựa trên automated checks.
