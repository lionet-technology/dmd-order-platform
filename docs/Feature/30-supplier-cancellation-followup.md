# Đơn huỷ chờ xử lý Supplier
Reviewed 16/11/2026, starting HEAD 6279d417cccc5a6db4214fe8d9aa0f867b2791fc, real repository /Users/quan/Desktop/report.
Status: implemented increment; full V1 Edit / Cancel & Duplicate and VND financial cutover remain incomplete.

## Confirmed Owner decision
Latest direct Owner request supersedes legacy route cancellation percentages and the prior unconditional 100% Duplicate interpretation.
- No Tracking or Label: refund 100% of eligible charged money.
- Any Tracking OR Label, not handed over: default 90%; only ADMIN can select 100% support.
- Started shipment / historical handover / delivered / closed: cannot cancel. Historical/replaced Tracking and fulfillment latch remain authoritative.
- Only ADMIN may use Cancel & Duplicate. No extension to BOD. BOD/Finance Supplier finance access is separate.
- Both ordinary cancellation and future atomic Cancel & Duplicate must record follow-up against the original Supplier. Client refund never proves Supplier cancellation/refund.

## Current implementation
Ordinary cancel calls recordSupplierCancellation within the same immediate transaction as reserve release, refund, tracking deactivation, public notice and Order history.
supplier_cancellations has one immutable record per source Order with original Supplier name, reason, actor/time and legacy plus normalized Tracking IDs/values/Label URLs. Blank Supplier stays blank, visibly requiring follow-up; no guessed account. No automatic backfill of previously cancelled orders.
supplier_cancellation_events is append-only: PENDING, FOLLOWING_UP, RESOLVED. RESOLVED means an operator finished follow-up, not a bank receipt, Supplier approval, receivable, cost write or automatic reversal. Note required; reopen allowed with history. Actor-scoped payload replay with unique request_key, optimistic expected_event_id, audit failure rollback.
Original Supplier name cannot be renamed once cancellation history exists. Deactivation remains available.

## Roles / UI / API
GET/POST /api/supplier-cancellations: ADMIN/FINANCE/BOD only; SALES/CLIENT/WAREHOUSE and anonymous denied. Follow-up status access does not confer cancellation or Duplicate rights.
GET supports supplier exact name and status PENDING/FOLLOWING_UP/RESOLVED/ALL. Default shows unresolved. History and original issuance snapshot accompany each record.
Admin Orders has an expandable dedicated queue. Finance/BOD Supplier detail has a scoped tab “Đơn huỷ chờ xử lý Supplier”. Tracking/Label are marked archived; the initial note says Supplier cancellation or refund is unconfirmed.
POST /api/orders/:id/cancel accepts optional refund_percent 90/100 only for ADMIN, and optional reason. Unissued cannot be changed to 90. SALES/CLIENT ordinary cancel still requires ownership. BOD/FINANCE/WAREHOUSE cannot cancel.
Supplier follow-up Order events use ADMIN visibility; Client/Sales cannot read these notes. The independent Supplier API uses its own role checks, without opening Supplier financial account access to Admin.

## Money / version boundary
Client cancellation retains existing charged-ledger/prior-refund cap, release-only before charge, one refund after charge, atomic audit and retry guards. Current operational ledger remains USD cents. This change does not relabel USD as VND or activate V1 Purchase.
No Supplier Balance, Actual Cost, Claim, receivable, payment or bank receipt is created by cancellation or follow-up status updates.
Legacy per-route policies remain stored and immutable but do not control the newly confirmed 100/90/shipped-deny cancellation outcome. Cargo remains outside automatic cancellation as in the existing scope.
No production DB, carrier API, deployment or Jenkins work.

## Acceptance / verification
- verify-order-cancellation.cjs: 128 assertions, Owner policy, all authorized roles, prior refunds/fees/reserves, issued legacy/partial/history, shipping deny, rollback/restart.
- verify-supplier-cancellation.cjs: 32 assertions, original linkage/snapshots, filters/status/history, support RBAC, replay/stale guards, no Supplier money/cost side effects, rollback/immutability/privacy.
- e2e-supplier-cancellation.cjs: own disposable DB and localhost server, role/API guards, concurrent cancel and follow-up retries, queue/filter, Admin support and audit rollback.
- verify-all.cjs includes the new domain suite. Evidence: artifacts/supplier-cancellation-2026-11-16/.
Browser UI acceptance remains unverified; API/domain tests are not a substitute.

## Remaining work and discussion
Full Cancel & Duplicate is not implemented or enabled. It must call the common cancellation command, create exactly one new source-linked Order and fresh Purchase Request with a valid current quote or approved manual Awaiting Quote flow, never Draft, never copied pricing/charges/account/Tracking/Label.
Unified Edit/Client confirmation/scoped Sales override and Purchase/ledger VND are also incomplete.
Excel located read-only at /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx (ePacket, Yun Express, UPS); absence of the workbook is no longer a blocker. Need actual import/mapping validation and operational financial integration, not renewed approval of known Owner rules.
The pending-consent financial behavior to discuss is whether to keep the original Reserve while blocking new issuance until Client confirms, then replace Reserve with a fresh balance gate; this is a proposal, not a confirmed new rule.
