## VNĐ V1 continuation — 17/11/2026
[Feature 41](41-vnd-supplier-period-gp-control-tower.md) records immutable Supplier period close/current-period late corrections, freight-only GP-Base and approved reference commission formula, whole-Claim same-cohort group reconciliation, before-Refund GP-Net, and scoped VNĐ Control Tower exceptions. Synthetic verification is separate from real-document pilot/deployment acceptance. Claim/watchlist/Complete Claim linking remains NEXT phase. This supersedes contrary earlier delivery-status notes only for this bounded VNĐ scope.

# Post-shipping imports and Supplier reconciliation queue
**Status: implemented bounded VNĐ slice; 66 regression suites, build/typecheck/lint and five-role Chrome 62 checks PASS. Reviewed 17/11/2026.** This is the current scope for the Owner continuation; full V1/pilot remains partial.

## Approved decisions and boundaries
- ePacket Standard/Eco USD table is RAW NET RATE. Global confirmed USD/VND FX produces Estimated Net Cost VND. The service profile already includes mid-mile + last-mile; no second mid-mile amount or user all-in/partial choice. EU/Yun VND tables are Net Cost; UPS VND raw rate requires the configured full formula. Existing source/quote tests remain the formula evidence. Breakdown is deferred.
- A higher Supplier Net or weight is an error/variance requiring review, not proof the Supplier is wrong. Imported rows never become True/Actual cost, payable or finalized GP merely because parsing/matching succeeded.
- Cancellation uses each service policy and current collected total Order revenue; Claim Refund remains separate. No automatic carrier void, Supplier receivable or Client refund from this import.
- Claim/Refund redesign is a separate short next phase. Do not expand approval layers.

## Supplier import and queue
Admin/Finance/BOD use existing scoped Supplier VNĐ endpoint. Multipart Excel headers: `Tracking | Actual Net VNĐ | Cân Supplier kg | Tham chiếu | Lý do`; first column may instead be `Order ID`. Identifier cells must be text (preserve leading zeroes), amounts/weight nonnegative decimal VNĐ strings after parsing. 10 MB maximum, 1–200 nonblank rows. Blank weight is allowed; reason/reference required. No FX inferred from Supplier documents. JSON supports a single explicit Lot ID instead of Tracking/Order code.

`action=import`, `kind=TOTAL|SUPPLEMENT` appends immutable source rows. All rows await explicit review, including clean ones. Queue retains unmatched and ambiguous rows. Errors: ORDER_NOT_MATCHED, AMBIGUOUS_MATCH, WEIGHT_ABOVE_DMD, MISSING_DMD_WEIGHT, NET_ABOVE_ESTIMATE, MISSING_ESTIMATE, DUPLICATE_IN_FILE, DUPLICATE_HISTORY, MISSING_APPROVED_BASE. Weight compares purchased quote Lot billable weight when present, otherwise complete carton chargeable weights; never substitutes scale weight for missing billable weight. Historical/in-file duplicate checks retain source context; new-key import creates pending evidence, never another charge.

`action=review_import`, `decision=accept|skip`, 1–200 selected rows, reason and current row token required. Finance/BOD accept; documentary Admin may skip but cannot post payable. Unmatched rows on Lots without fulfillment changes can use an eligible charged/cancelled VNĐ Lot of the same Supplier. Ambiguous matches require documentary evidence that identifies a single attempt. Current approved cost ID must be supplied, including manual mappings (0 if none). The UI exposes manual Lot and current Actual cost ID, with the existing cost list as reference.

Bulk is one immediate transaction: stale/missing/already-reviewed row, wrong Supplier, duplicate selected ID, invalid target, missing supplemental base or stale current Actual rolls back the entire batch. At most one accepted row per Lot and fulfillment attempt per batch; duplicate evidence for one attempt must be reviewed sequentially, consciously choosing total versus supplement. No silent best-match or duplicate summation.
- TOTAL replaces approved total using a payable delta (new total minus old).
- SUPPLEMENT adds an explicit commercial Supplier cost to the approved total; delta equals only the supplementary amount. Repeated real charges require a new row and explicit review, with historical duplicate warnings.
- Accept records original source, actor, time, reason and review snapshot, creates approved cost + payable atomically. Skip is immutable and posts nothing. Imported pending rows never participate in approvedVndLot/report Actual.
- Client money, Selling, issued Statements and Supplier Claim receivables are untouched.
- Same actor/key/payload retry does not create another row/decision. Changed payload/key reuse rejects. All pending rows remain visible; recent decision history is capped at 200 globally in the basic view. Large-volume pagination/performance refinement is not delivered.
- Existing single-document Lot/Tracking cost entry retains its established pending approve/keep-old workflow; the Excel queue is the new bulk workflow. Old USD costs/review APIs are not reinterpreted as VND.

## Client post-shipping surcharge/tax import
Admin and assigned Sales only, server-authorized Client scope. Excel headers `Order ID | Loại | Số tiền VNĐ | Tham chiếu | Lý do`; kind `surcharge` or `tax`, positive amounts, text identifiers (Order ID or Tracking as the first column), 1–200 rows / 10 MB. Preview endpoint parses without posting. Confirmation calls existing operations endpoint with `action=import_charges`, selected Client, items, reason and request_key.

Each Order must match uniquely within Client and be VNĐ CHARGED, not cancelled. Tracking uses the existing normalized tracking registry, including historical identifiers still linked to that Order. An identifier from another Client is rejected. Both identifier formats resolve to the same Order before source deduplication. Each reference identifies one source row uniquely within the Client; use document+line references when one invoice covers multiple Orders. Same reference and identical normalized Order/kind/amount/reason is skipped even with a new request key; changed content rejects. Repeated reference within one batch rejects. All rows, source audit and Ledger postings commit or roll back together.

Uses existing ORDER_SURCHARGE / ORDER_TAX exact decimal journals. It may exceed Credit Limit without creating Debt or changing reserves; later Purchase still obeys funds rules. No Supplier payable from a Client import. Cancellation/refund context already includes both categories in current collected revenue. Commercial performance reporting now includes ORDER_SURCHARGE; tax remains separately in cash/Statement/collected total, excluded from commercial revenue/GP. Existing commission reference inputs deliberately keep ORDER_CHARGE/ORDER_CORRECTION scope; no new commission eligibility/formula is inferred. Reconciliation of supplementary revenue with final commission remains incomplete. Issued Statement history is immutable; late posting follows the existing new-period flow.

## Claim/watchlist direction — APPROVED, NOT BUILT IN THIS SLICE
Client and Supplier Claim cases remain separate. One Supplier case may contain N Orders or one Order; manually select from error/watchlist, never auto-create one Claim per error. Manually flag a Client-claimed Order for Supplier follow-up, optionally link the two cases. Both sides should have a simple watchlist/case queue showing linked Claim ID(s) or no Claim yet. Current VNĐ Claim approval is a financial decision journal, not yet a Complete Claim transition in Control Tower. Detailed UX, case lifecycle, links and queue-to-case bulk creation belong to the next Claim/Refund phase. Current receivable foundation is retained; no claim is created by import/review.

## Code, tests and remaining work
Code: vnd-supplier-import.ts, vnd-supplier.ts, vnd-operational-schema.ts, vnd-operational.ts, vnd-reporting.ts; existing commission inputs retained; Supplier/charges-import API and VNĐ tools.
Regression: verify-vnd-supplier-import.cjs, verify-vnd-charge-import.cjs, existing full suite; browser: e2e-vnd-v1.cjs.
Evidence: ../../artifacts/vnd-import-reconciliation-2026-11-17/VERIFICATION.md.

Not delivered: Supplier tax/pass-through accounting import (do not disguise tax as commercial supplemental cost), Supplier period close/reopen/late-adjustment policy, full finalized GP/commission reconciliation, redesigned Claims/watchlists, complete Control Tower and pilot with real evidence. Supplier commercial supplement and Client surcharge/tax imports are delivered; these are distinct money flows.


## Template Excel có phiên bản · 20/11/2026

- Chọn Supplier và tuyến Service/Sub-Service. Lưu phiên bản mới từ cấu hình riêng cho tuyến. Mỗi nhóm Actual Net và Supplier Surcharge chọn một cột tổng hoặc cộng các cột thành phần. Ô trống trong nhóm cộng bằng 0. Cột tổng bắt buộc có giá trị. Một cột chỉ map một lần. Nếu phí đã nằm trong Actual, tổng phí chỉ dùng để đối chiếu. Nếu phí nằm ngoài Actual, cộng đúng một lần. Dòng chỉ có phụ phí cần Actual gốc đã duyệt.
- Chứng từ khai mã ổn định và mỗi dòng có mã text ổn định, độc lập với Tracking và vị trí Excel. Các dòng phí thật có mã riêng. Cùng nguồn được tải lại thì giữ phiên bản đã gắn với bản chờ/đã duyệt. Muốn đọc lại bằng phiên bản khác, bỏ qua bản chờ trước rồi tải lại. Nếu đã Accept, dùng chứng từ điều chỉnh mới có tham chiếu và giải trình về chứng từ gốc. Dùng tổng Actual đã sửa để điều chỉnh bằng delta.
- Luồng VNĐ giữ số thập phân chính xác và không tự làm tròn hoặc đổi tiền. Workbook phải cung cấp giá trị VNĐ. Nếu map cột loại tiền, dòng mang loại tiền khác VNĐ bị báo lỗi. Queue lưu dòng/cột gốc, các khoản thành phần, kiểu cộng, phiên bản và lỗi parse. Lỗi parse chặn Accept. Sai lệch cân và Net, match mơ hồ hoặc thiếu match tiếp tục qua quy trình đối soát. Match tự động và ghép Lot thủ công đều yêu cầu đúng tuyến của template.
- Import hoặc bỏ qua chưa ghi Actual/payable. Finance/BOD Accept ghi Actual, delta payable và quyết định một lần trong cùng transaction. Điều chỉnh nhập sau khóa kỳ dùng ngày ghi sổ hiện tại và nối kỳ gốc theo cơ chế Supplier period. Luồng Excel chuẩn cũ tiếp tục khả dụng.

Admin, Finance và BOD dùng cùng màn hình cấu hình/nhập. Chỉ Finance/BOD Accept được. API Supplier hiện có nhận `save_import_template`, Excel multipart theo `template_id` và `review_import`. [Mapping và lịch sử](../../src/lib/vnd-supplier-templates.ts) · [Hồi quy Excel](../../scripts/verify-vnd-supplier-import.cjs) · [Kiểm chứng trên TEST](../../artifacts/gd1-supplier-template-2026-11-20/VERIFICATION.md).

## Chứng từ Supplier cần đối soát lượt fulfillment

Mỗi Lot có lượt gốc và các lượt tiếp theo gắn với sự kiện đổi tuyến hoặc đổi Tracking/Label. Hàng đợi đối chiếu Supplier, Tracking, URL Label nếu có, và Service/Sub-Service từ phiên bản template. Excel chuẩn dùng Tracking có thể thêm cột `URL Label` cuối bảng. Template tùy chỉnh có thể map cột URL Label. Dòng từ luồng nhập trực tiếp sau đổi tuyến hoặc đổi Tracking/Label cũng vào hàng đợi.

Nếu bằng chứng chỉ ra một lượt duy nhất, Finance/BOD có thể chốt Actual cho lượt đó, kể cả lượt lịch sử. Tracking dùng lại qua nhiều lượt cùng Supplier cần thêm bằng chứng từ chứng từ. Thiếu lịch sử hoặc còn nhiều lượt thì báo `FULFILLMENT_REVIEW_REQUIRED`. Ghép Lot thủ công không giải quyết được ngoại lệ này. Người xử lý có thể bỏ qua dòng và nhập lại với bằng chứng đầy đủ. Chứng từ đã duyệt cần tham chiếu điều chỉnh riêng. Một tham chiếu đã ghi Actual cho cùng Supplier/Lot không được ghi lần nữa.

TOTAL thay tổng của đúng lượt bằng delta. SUPPLEMENT cần Actual gốc của đúng lượt. Kỳ đóng giữ nguyên. Delta đến muộn liên kết bút toán đã khóa của cùng lượt, nếu có. Actual cũ chưa có mã lượt được đối chiếu với mốc ghi sổ và lịch sử tuyến. Khi thiếu bằng chứng để xác định phạm vi của Actual cũ, hàng đợi chặn ghi thêm.

[Kiểm thử Phase 4](../../artifacts/gd1-phase4-fulfillment-epochs-2026-11-20/VERIFICATION.md).

## Supplier Reconciliation V2 · triển khai từng phần

Form cấu hình và API Supplier hỗ trợ `mapping.components` với `column`, `id`, `group` (Cost, Surcharge, Tax). Ô trống giữ giá trị đã duyệt của Component ID, số 0 là giá trị có chủ đích. Tổng từng nhóm được cộng từ thành phần. Đối chiếu Estimated Net dùng nhóm Cost của template V2. Cân Supplier V2 so với tổng cân đo của kiện trong Lot khi đầy đủ. Queue cảnh báo khi tổng nghĩa vụ của một dòng V2 đã vượt toàn bộ doanh thu thương mại đã ghi sổ của Order. Quyết định Accept lưu snapshot so sánh, và luồng Finance/BOD hiện tại ghi chênh lệch tổng nghĩa vụ theo lượt. Nếu Actual cũ chỉ có tổng hoặc Component ID bị chuyển nhóm, dòng V2 bị chặn để tránh suy diễn chi tiết từ tổng lịch sử. Control Tower và queue hiển thị nhãn tiếng Anh từ cùng danh mục. Queue lọc theo tag và cho xem số cũ, số sau báo giá và delta theo nhóm và thành phần. Finance/BOD tiếp tục chọn từng dòng hoặc chọn nhiều dòng để duyệt có lý do.

[Bằng chứng TEST đợt 1](../../artifacts/supplier-reconciliation-v2-2026-11-25/VERIFICATION.md).

Tại cuối đợt 1, phần còn lại của V2 gồm lưu file gốc theo batch, xuất/sửa/preview nhập lại exception, đối chiếu phí void theo phần trăm, xử lý baseline Actual chỉ có tổng, tự chốt dòng sạch và cảnh báo nghĩa vụ cộng dồn toàn Order.

## Phạm vi kiện/Lot của phụ phí và thuế Client

Dòng nhập bằng Tracking lưu ID Tracking, kiện và Lot nếu có trong hồ sơ. Dòng nhập bằng Order ID giữ phạm vi Order. Tham chiếu dòng vẫn duy nhất theo Client và tra lại được bằng Order ID hoặc Tracking của cùng dòng. Một tham chiếu đã gắn Tracking không được gắn lại sang Tracking khác. Mỗi dòng tạo một bút toán Client cấp Order. Bản ghi cũ vẫn đọc được với tham chiếu kiện/Lot để trống.

## Xung đột tham chiếu qua sổ Supplier

Finance/BOD duyệt Actual sau khi kiểm tra tham chiếu, theo Supplier và không phân biệt hoa thường. Tham chiếu đã có trong payment, adjustment, các dòng offset hoặc hồ sơ/sự kiện Supplier Claim phát sinh lỗi `SUPPLIER_REFERENCE_IN_USE` ở queue hoặc thông báo lỗi khi duyệt Actual thủ công. Người xử lý có thể bỏ qua dòng queue kèm lý do. Khi một bút toán làm tình trạng tham chiếu thay đổi, tải lại queue trước khi rà soát. [Memo P0](47-gd1-p0-decision-memo.md).

## Supplier Reconciliation V2 · đợt 2

- Upload Excel lưu byte gốc, SHA-256, tên file, người nhập, mã batch và phiên bản template trong cùng giao dịch với các dòng. Hàng chờ và lịch sử nối về số dòng vật lý Excel. File gốc tải dưới dạng attachment theo quyền Supplier. Chứng từ nhập trước đợt này có lịch sử dòng sẵn có và thiếu file gốc. Batch hiển thị tối đa 200 file gần nhất, trạng thái quyết định, lỗi, delta phải trả và kỳ ghi sổ. Finance/BOD xem đã thanh toán theo kỳ khóa. Thanh toán cấp Supplier chưa có phân bổ theo từng quotation.
- Từ Exception Queue, xuất các dòng thành phần V2 đang chờ. Mỗi dòng Excel mang mã batch nguồn, Queue ID, mã kiểm tra trạng thái và Component ID. Chỉ cột Proposed VNĐ thay đổi số đề xuất. Ô trống giữ Actual đã duyệt. Số 0 là đề xuất có chủ đích. Excel dùng giá trị tĩnh. Hệ thống giới hạn dung lượng nén và giải nén, từ chối formula, macro và liên kết workbook ngoài.
- Admin, Finance hoặc BOD xem trước và lưu đề xuất có lý do. Đề xuất thêm một phiên bản bất biến, lưu file điều chỉnh và giữ nguyên chứng từ gốc. Bản Excel lỗi thời hoặc sai batch/mapping bị từ chối. Finance/BOD chọn từng dòng hoặc nhiều dòng và xác nhận có lý do, độc lập với các dòng còn chờ trong file. Các lỗi fulfillment mơ hồ, tham chiếu đã dùng và Actual lịch sử chưa xác minh thành phần tiếp tục chặn ghi sổ. Dòng trùng chứng từ hoặc có chênh lệch hiển thị tag để duyệt rõ ràng. Quyết định đã lưu hiển thị lại snapshot tại thời điểm duyệt.
- Cảnh báo khoản lỗ dùng tổng delta Actual đã ghi cho toàn Order qua các lượt và Supplier, cộng delta đề xuất của dòng đang xét. Doanh thu có thể thu gồm giá vận chuyển, sửa giá, phụ phí và thuế, sau hoàn do hủy và các khoản Client Claim đã duyệt có phân bổ. Claim lịch sử thiếu phân bổ khiến phép so sánh chờ xác minh. Kiểm tra Estimated Net vẫn chỉ dùng nhóm Cost. Cảnh báo chỉ phục vụ rà soát.
- Đối chiếu phí hủy dùng chính sách được chụp lúc mở hồ sơ của lượt fulfillment. Xem [Feature 30](30-supplier-cancellation-followup.md#đối-chiếu-phí-void-trong-exception-queue).
