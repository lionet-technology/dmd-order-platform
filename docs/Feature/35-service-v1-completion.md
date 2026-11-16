# V1 continuation — 17/11/2026

Status: implementation in progress; no production acceptance.

## Verified starting point
Local main and remote main are 3c6811aa3728ae424b7ed9805a7a7936abccf207. Existing AGENTS.md and Codex/ changes are outside this work. Final workbook (2) opened directly through the source parser: SHA a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2, three sheets. Source decisions are not reopened.

## Approved vs delivered gap review
- UPS: pure source resolver and account/global Review/Publish exist. Operational VND adapter, account-bearing export and lot editing are missing.
- ePacket EU: separate rate tables exist; destination routing from Standard/Eco is missing. Only an eligible configured ePacket EU route may be selected; never Yun or a US fallback.
- Shipping Edit: existing VND requests block all shipping edits. Separate pre-issuance edit is required; partial Tracking OR Label locks it. Offer and post-charge correction remain separate.
- Cancel & Duplicate: policy cancellation/supplier follow-up exist; atomic linked Purchasing replacement is missing.
- Client Add-on and Statements/Debt/reporting: VND cutover is missing; legacy USD is not relabelled.
- Browser UAT: dedicated VND role/workflow verification remains open.

## Owner decision recorded
Handoff §5 explicitly leaves Service change after a manual offer OPEN. Owner answered 17/11: Service change requires explicit new offer or automatic-price selection, followed by price consent; retain the old reserve while pending. This does not block UPS or destination routing work.

## Implemented continuation (under verification)
- UPS imported immutable account drafts (including explicit wholly unavailable accounts), separate Review/Publish, per-zone weight surcharges, final source zones and explicit China-region selection. Published selling references frozen account versions; current published accounts supply Estimated Net. Confirmed globals recalculate both from the correct versions; pending account drafts never activate.
- UPS Purchase uses the existing VND request/consent/FIFO/reserve/charge engine. Each Lot calculates the full exact Net formula and selects the minimum full cost with SDS→VTT→JD tie priority. Source decimal tails are retained. One Shipment Surcharge per Lot. Missing intervals fail; source o alone excludes an unavailable account. Generic export and configured Lot/Carton placeholders carry the selected supplier account.
- Destination routing applies only within ePacket at VND creation/edit and first Purchase of an existing unissued Draft. A non-US Standard/Eco selection requires exactly one active, eligible, configured EU route and source market. No Yun substitution, fuzzy-country guessing or unsupported-country fallback.
- Separate Admin pre-issuance shipping edit, including Lot/carton edits and China region; any historical Tracking OR Label locks shipping. A Service change after manual offer requires NEW_OFFER or AUTOMATIC. Reserve stays intact while quote/consent/funds are pending.
- Admin Cancel & Duplicate reuses configured cancellation and supplier follow-up, copies only shipping/items/cartons, links a new Purchasing request and never copies issuance/charge/reserve/cost snapshots. Business price/funds pending do not undo cancellation; SQLite failure rolls everything back. A receipt prevents duplicate replacement on exact retry.
- Client Add-on: scoped Sales/Admin/BOD, required name, nonnegative revenue, nullable pending cost, free-text supplier, revision checks and immutable history. Revenue changes post exact deltas; cost-only edit leaves Balance unchanged. Financial postings can exceed credit, retain reserves, and never create Debt. Dedicated scoped Add-on endpoint retains the narrow Sales cost/supplier exception; Client projection omits both.
- VND Statements capture immutable ledger/debt movements, openings/closings and journal cursors; first period includes account activation, consecutive periods, late-posting carry-forward and exact amounts. Preview is read-only. Claim Refund balance is explicitly unavailable, never fabricated zero.
- Manual VND Debt transfer only from negative net Balance, one account, independent deadline, prospective daily rate, exact completed-Vietnam-day simple interest, immutable daily rows, and Payment settlement interest→principal→Balance. Read-only projections do not accrue. No payment is fabricated by transfer; purchasing room is released only once. Overdue Debt and frozen-Statement Credit Term block Purchase.
- BOD-only monthly VND report separates order purchase-period performance from posting-period cash flow; manual/missing cost is marked incomplete, actual GP is unavailable until reconciliation, and historical Sales attribution uses the existing immutable purchase trigger.
- Workspace /vnd exposes shipping edit, duplicate, Add-on, Statements and Debt separately from offer, correction and Add Tracking/Label. Service pricing UI exposes UPS account import/Review/Publish and separately confirmed globals.

## Remaining V1 boundaries
This is new-account VND implementation, not migration of legacy USD. Full VND Claim/refund pool, Supplier payable/actual reconciliation cutover, complete Sales commission/refund-group reporting and fully automated Statement period scheduling remain outside verified delivery. No real Supplier cancellation policy or carrier void was invented. Root-only configuration authority remains narrower than the target full Admin/BOD policy. Manual pricing modes and broad live pilot acceptance still require separate reconciliation. Test evidence does not activate production.

## Verification and commits
Gap audit: 65b6596. Implementation: 647ee72. Full regression: 59 suites PASS; new continuation 37 and finance 39 assertions; typecheck/lint/build PASS. Actual Chrome targeted UAT: 13 assertions, Admin/Sales/Client/Finance/BOD, isolated DB, desktop/mobile screenshots inspected. [Detailed evidence and limitations](../../artifacts/service-v1-continuation-2026-11-17/VERIFICATION.md). Documentation-only evidence follows the implementation commit.

## Guardrails
Reuse VND consent, atomic FIFO reserve, one-time charge and immutable ledger. Financial postings may exceed credit with no automatic Debt. Cancellation policy is route-specific; Claim refund remains separate. Internal Purchase/export never calls a Supplier. Preserve source workbook and existing working changes; no Jenkins/production.
