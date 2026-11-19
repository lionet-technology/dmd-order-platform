# GĐ1 · Phần vượt Refund và kiểm tra Git/Jenkins · 19/11/2026

## Kiểm thử trên dữ liệu TEST

| Hạng mục | Kết quả |
|---|---|
| Hồi quy domain | 68 suite PASS, gồm Refund 88, Commission 48, Emergency Hold 154, Supplier Cancellation 47, Supplier Import VNĐ 40. [Nhật ký](regression.log.txt) |
| Typecheck, lint và build cô lập | PASS trên Node 20.20.2. Build có cảnh báo tracing hiện hữu tại `src/lib/db.ts`. |
| Chrome và HTTP localhost | 104 kiểm tra qua 5 vai trò. Client mở Claim gồm hai Order đã Charge, Admin Complete, snapshot giữ USD và VND, phần vượt 6 VNĐ chia 2 và 4. Suite còn kiểm tra BOD tải Excel, quyền truy cập và các luồng Supplier hiện hữu. [Kết quả](browser-uat.json) |
| SQLite TEST restore | 11 bảng khớp, integrity OK, 0 lỗi khóa ngoại. [Kết quả](claim-restore.json) |
| Workbook nguồn | SHA-256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. |

Hồi quy domain kiểm thêm ca USD/EUR/VND, nhân số lượng, chia đều khi tổng trọng số bằng 0 và revision dùng dữ liệu đóng băng dù giá trị khai báo trên Order đã đổi. Giữ nguyên dữ liệu quyết định cũ.

## Git và Jenkins

- Repo chính thức `/Users/quan/Developer/report` bắt đầu tại `91cd42f`, ngay sau `6bf3b45`. `origin/main` và kết quả GitHub `git ls-remote origin refs/heads/main` cùng trả `145b5552445a26db5681f2d9c2694e9665d42da6`. Hai checkout có cùng remote; `/Users/quan/Desktop/report` còn tồn tại với Git riêng và HEAD `16fecf7`.
- Checkout chính dùng `.git/config`, upstream `origin/main`, thư mục hooks mặc định chỉ có file mẫu. Truy vấn Git config không thấy `core.worktree` hay `core.hooksPath`. AGENTS.md, Codex và workbook nguồn được bảo toàn.
- [Jenkinsfile](../../Jenkinsfile) khai báo `githubPush()`, lấy `main` rồi triển khai Docker Compose từ `/home/lionet/workspace/thuantv/dmd-finance-platform`. [XML trong repo](../../jenkins/job-config.xml) chỉ định `*/main`. [Tài liệu triển khai](../../docs/deployment.md) mô tả webhook GitHub. Các đường dẫn máy Mac chỉ liên quan checkout local. Nếu một tác vụ cục bộ còn mở checkout Desktop, tác vụ đó có thể thấy phiên bản cũ.
- Trigger và `GIT_BRANCH=main` có từ `68dfb8c` ngày 27/09. XML có trigger và bộ lọc `*/main` từ `f761112` cùng ngày. `2a81675` ngày 30/09 cập nhật URL repo và thông tin job, giữ bộ lọc và trigger. Cấu hình job đang chạy và delivery logs chưa được kiểm chứng. Không có push, chạy Jenkins, thay đổi webhook hay thao tác production.
- DevOps cần đối chiếu SCM/refspec và branch spec của job đang chạy, GitHub push delivery với polling/build logs quanh thời điểm sự cố, cùng các job khác hoặc multibranch lắng nghe cùng repo. Cần xác nhận push `refs/heads/dev/*` không thể khởi chạy job hoặc bước deploy trước khi push nhánh dev.
