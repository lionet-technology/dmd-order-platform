## VNĐ V1 continuation — 17/11/2026
[Feature 41](41-vnd-supplier-period-gp-control-tower.md) records immutable Supplier period close/current-period late corrections, freight-only GP-Base and approved reference commission formula, whole-Claim same-cohort group reconciliation, before-Refund GP-Net, and scoped VNĐ Control Tower exceptions. Synthetic verification is separate from real-document pilot/deployment acceptance. Claim/watchlist/Complete Claim linking remains NEXT phase. This supersedes contrary earlier delivery-status notes only for this bounded VNĐ scope.

## VNĐ build continuation — 17/11/2026
[Feature 40](40-vnd-post-shipping-import-reconciliation.md) records current import/reconciliation behavior, money/reporting boundaries and the approved next-phase manual Claim/watchlist direction. Supplier TOTAL/SUPPLEMENT queue and Client surcharge/tax import are distinct; no import automatically creates a Claim/refund. Full V1/pilot remains partial.

## VNĐ Claim continuation — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md) supersedes the absence of a VNĐ Claim journal: processing-month category/Sales obligation deltas, executed Bank rows, Claim group markers and approved Supplier totals are available. Per-Order pool allocation and GP-minus-Refund remain unavailable, not zero.

[Feature 45](45-vnd-monthly-commission-closing.md) bổ sung kỳ hoa hồng VNĐ tự khóa và điều chỉnh kỳ hiện tại. Báo cáo live theo kỳ mua tiếp tục dùng để đối chiếu.

# VND commission reporting continuation — 17/11/2026

Status: bounded implementation verified; not full commission or production acceptance. [Evidence](../../artifacts/local-workspace-vnd-2026-11-17/VERIFICATION.md).

## Canonical workspace audit
Active workspace is `/Users/quan/Developer/report`. Starting local main and fetched origin/main both equal `16fecf75b07de5f9fc192e0af13c30f427b7f5a8`. All 771 tracked files read successfully; git fsck reports only dangling objects, no corruption. Final workbook is 60,966 bytes, SHA256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`. Both source copies have identical HEAD/status and eight latest all-ref commits. Compared 1,716 non-generated files from readable old copy: no missing file; only three Finder .DS_Store files differ. New tree audit excluding dependency/build caches found no dataless files or symlinks. No old files were copied back. Existing AGENTS.md change and untracked Codex/ remain owner work. README and active AGENTS path are updated; historical evidence paths are retained as historical facts. No active tracked script/config refers to Desktop. Connector workspace root is already Developer/report.

## Approved requirements and gap
Read Feature index, Decisions, Roadmap, Contributing, full V1 handoff, Feature 14/16/20/35 and previous verification. Current VND reporting only aggregates signed GP Base; it cannot clamp each Order before summation. Approved handoff §9 requires freight revenue excluding surcharge/tax, signed GP Base, per-Order max(0,GP Base), cancellation excluded and historical Sales attribution. No commission rate/payout is authorized. Claim/refund category totals require the unimplemented VND Claim journal and remain unavailable.

## Implemented bounded behavior
Extend existing BOD-only monthly VND reporting API with per-Order and Sales totals for commission consideration, using purchase cohort and captured Sales ID. Include only charged financial revenue; missing Base remains unavailable, not zero. Cancelled Orders have zero eligible GP. Reads must not change ledger, Statements or purchase state. No legacy USD reinterpretation, Claim allocation, commission payment or actual GP is introduced. Verified mixed positive/negative Orders, cancellation, missing Base, fractional money, historical ownership and read-only behavior: 21 new assertions; full 60-suite regression, build/typecheck/lint and five-role Chrome UAT (19 assertions) PASS. UI should display these explicit limits.

## Remaining work
VND Claim/Refund execution/recovery and Supplier actual/payable/claim cutover; full refund-group commission review; comprehensive pilot UAT. OPEN supplier/carrier policy and real-data acceptance are not defaults.
