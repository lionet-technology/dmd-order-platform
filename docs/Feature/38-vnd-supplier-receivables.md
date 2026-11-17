# VNĐ Supplier receivables and Claim notifications continuation
**Status: PLANNED, not implemented or pilot accepted. 2026-11-17.**

## Verified starting point
Local and origin/main both `20631973dcfccaf0de337b55c3bd86997230592b` (live ls-remote). Owner AGENTS.md and untracked Codex/ are preserved. Read Feature contract, Approved Decisions, full V1 handoff, Feature 37, Supplier Account rules and authoritative source index. Workbook SHA256 matches `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

## Approved versus implementation plan
- Existing VNĐ: Client Claim pool/payout/recovery, Supplier approved actual/payable/payments. Separate legacy USD journals remain untouched.
- This next slice: Finance/BOD internal Supplier Claim on explicit charged/cancelled VNĐ Lots, final approval capped by requested, partial actual Bank receipts/explicit offsets, effective decision corrections and full settlement reversals. Follow existing 24–25/10 rules; positive payable in VNĐ is the opposite sign of old USD Balance. Offset therefore DECREASES VNĐ payable. Neither approval nor Bank receipt changes payable. Never change Order GP/revenue/Client money.
- Durable in-app Client/assigned Sales Claim decision/refund notifications with scoped acknowledgement, public financial fields only. No email/external delivery.
- Remain pending: supplementary Supplier cost and Client surcharge/tax imports with mapping and duplicate review, Supplier period close/late-adjustment snapshots, complete GP/commission reconciliation and full real-document pilot.

## OPEN facts, not defaults
- ePacket workbook supplies rates and fixed fees, but not whether cost includes mid-mile plus last-mile, supplier/component mapping or inclusive overlap evidence. Keep estimated/approved-total distinct from finalized GP. Minimal proposal: explicit coverage confirmation per service/route/version backed by Supplier evidence; until then no fully actual label.
- Supplier cancellation/void policy values and carrier acknowledgement remain absent for unconfigured routes. Minimal proposal: keep manual follow-up pending; explicit evidence-based handling only. Internal Order cancellation never voids carrier or reverses Supplier cost automatically.
- Formal Supplier close/reopen authority, boundary and correction references require reconciliation of current close mechanism before implementing. Existing issued Client Statements remain immutable.
