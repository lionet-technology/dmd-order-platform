## Owner clarification — 17/11/2026 (supersedes earlier OPEN coverage notes)
- CONFIRMED: workbook Net for ePacket Standard/Eco already includes mid-mile + last-mile. Detailed component accounting is deferred to a later phase; it is not a V1 blocker and must not be added again to inclusive Net. Estimated workbook Net remains distinct from Supplier-approved Actual and finalized GP.
- CONFIRMED: Supplier cancellation/void policy and carrier evidence must be set up per service/route. Manual follow-up with Admin choosing a refund percentage/amount is approved. Values/evidence still need operational configuration; no default percentage, automatic carrier void or cost reversal follows from internal cancellation. Supplier money remains explicitly reconciled through its financial workflow.

# VNĐ Supplier receivables and Claim notifications continuation
**Status: PARTIAL V1; implemented slice verified on synthetic data, not pilot accepted. 2026-11-17.**

## Verified starting point
Local and origin/main both `20631973dcfccaf0de337b55c3bd86997230592b` (live ls-remote). Owner AGENTS.md and untracked Codex/ are preserved. Read Feature contract, Approved Decisions, full V1 handoff, Feature 37, Supplier Account rules and authoritative source index. Workbook SHA256 matches `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

## Approved versus implementation plan
- Existing VNĐ: Client Claim pool/payout/recovery, Supplier approved actual/payable/payments. Separate legacy USD journals remain untouched.
- This next slice: Finance/BOD internal Supplier Claim on explicit charged/cancelled VNĐ Lots, final approval capped by requested, partial actual Bank receipts/explicit offsets, effective decision corrections and full settlement reversals. Follow existing 24–25/10 rules; positive payable in VNĐ is the opposite sign of old USD Balance. Offset therefore DECREASES VNĐ payable. Neither approval nor Bank receipt changes payable. Never change Order GP/revenue/Client money.
- Durable in-app Client/assigned Sales Claim decision/refund notifications with scoped acknowledgement, public financial fields only. No email/external delivery.
- Remain pending: supplementary Supplier cost and Client surcharge/tax imports with mapping and duplicate review, Supplier period close/late-adjustment snapshots, complete GP/commission reconciliation and full real-document pilot.

## OPEN facts, not defaults
- CLOSED by Owner 17/11: ePacket Standard/Eco workbook Net includes mid-mile + last-mile. Detailed breakdown deferred; do not double-add components or confuse Estimated with Supplier Actual/finalized GP.
- APPROVED: manual Supplier follow-up with Admin-selected percentage/amount. Per-service policy values and carrier evidence still need configuration for unconfigured routes. Internal Order cancellation never voids carrier or reverses Supplier cost automatically.
Supplier period closing is still implementation backlog, not a request to reapprove the immutable-period/late-adjustment principle. Reopening must not be invented; existing issued Client Statements remain immutable.

## Implemented behavior and boundaries
`vnd_supplier_claims` and immutable `vnd_supplier_claim_events` store requested amount, explicit Lot scope, proof and actor. Finance/BOD only; Admin remains documentary-only. New Claims require ACTIVE Tracking in every selected Lot; immutable scope_json preserves those Tracking IDs/values. Replaced/cancelled Tracking requires reviewed source handling, not automatic inclusion. Each Lot can belong to one Claim in this journal; subsequent changes require correction/reversal. Explicit final approval 0..requested creates a separate receivable. Partial Bank/Offset settlements are capped by current outstanding inside the serialized action. Decision CAS rejects stale approval/correction. Zero decision closes, correction can reopen with proof; correction cannot fall below net settlements. Full reversal restores receivable; only Offset reversal restores payable. Original references remain consumed case-insensitively across this VNĐ claim/payment/adjustment journal, including reversed records. Legacy USD journals are separate and not converted.

Offset is permitted to produce Supplier credit/prepayment; no implicit netting with Client accounts. No GP, revenue, Order cost or Client ledger write occurs. Amount strings preserve fractional VNĐ. Same actor/key/payload replay performs no second write; changed payload/actor fails. Receipt insertion failure rolls back all journal writes.

Client/assigned Sales receive durable in-app notices for each new Claim decision and actual refund/recovery event, including pool-level payouts without fabricated Claim allocation. Acknowledgement is recipient-specific, append-only and idempotent. Current account scope/active actor is checked on every read/ack; reassigning Sales revokes prior Sales access, without replaying history to the new Sales. Notifications intentionally omit free-text reasons, decision evidence/context and all bank fields. Latest 100 notices only; pagination, unread badge, initial Claim submission alert/Admin inbox and Control Tower integration remain pending. No external messages are sent.

## Code / API / verification
- `src/lib/vnd-supplier-claims.ts`, `vnd-supplier.ts`, `vnd-operational-schema.ts`; existing `/api/service-v1/suppliers` accepts claim_create/claim_approve/claim_correct/claim_settle/claim_reverse, with reference/evidence/reason/request_key. All noncreate commands require loaded expected_decision_id; settlement channels BANK/OFFSET.
- `/api/service-v1/claim-notifications`: scoped GET client_id; POST client_id/id acknowledges. Only Client/Sales.
- `/vnd` Supplier detail includes requested/approved/Bank/Offset/outstanding, immutable evidence history and correction/reversal forms. Client Claim panel includes notifications/read action.
- `scripts/verify-vnd-supplier-claims.cjs`, expanded `verify-vnd-refunds.cjs`, `vnd-race-worker.cjs`, expanded five-role Chrome `e2e-vnd-v1.cjs`.
- Final gate results and remaining gaps: `artifacts/vnd-receivables-notifications-2026-11-17/VERIFICATION.md` (64 domain suites, build/typecheck/lint and 47 Chrome checks across five roles PASS).
