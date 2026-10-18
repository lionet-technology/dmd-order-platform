# DMD Report — tài liệu

**Nguồn nghiệp vụ chuẩn:** [Feature/README.md](./Feature/README.md), [Business decisions](./Feature/DECISIONS-2026-10-13.md), [Roadmap](./Feature/ROADMAP.md).

- `Feature/`: business logic được quản lý tích cực; phân biệt AS-IS (code đã xác minh) / TARGET (Product đã duyệt) / OPEN (chưa chốt), và đường dẫn code/test.
- `deployment.md`: hướng dẫn deploy/backup (không phải bằng chứng app đã deploy).
- `demo-finance-operations.md`: hướng dẫn vận hành dữ liệu **demo/test only**, không phải business spec.
- `legacy-logic/`: tài liệu lịch sử đã giữ lại nguyên vẹn để tra cứu; nội dung có thể **sai với quyết định hiện tại và code mới**, không được làm nguồn triển khai tính năng nếu chưa đối chiếu docs/Feature và tests.

Mọi thay đổi nghiệp vụ cần cập nhật feature docs và ghi migration/verification tương ứng trong cùng PR; đọc [Feature/CONTRIBUTING.md](./Feature/CONTRIBUTING.md).

- [Luồng vận hành & Business Rules — cập nhật 16/10](Feature/OPERATIONAL-FLOW.md): source-of-truth, Mermaid và IMPLEMENTED/APPROVED/DEFERRED.
