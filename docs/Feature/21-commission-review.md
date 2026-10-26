# Commission review MVP — 2026-10-26

## Owner policy
- Keep original Order sales_price, base_cost, Revenue, and GP Base unchanged by Client Claim/Refund. GP Base does not include tax or surcharge.
- Do not automate commission percentage, commission payouts, or partial-refund commission math yet.
- All Orders with Client Claim or Refund are excluded from commission-eligible GP Base by default and listed for Admin review. An open Claim is sufficient.
- Cancelled Orders are excluded without override.
- Manual exception: Admin may mark a noncancelled Order APPROVE_SUPPLEMENT, restoring the original positive GP Base as eligible for manual commission consideration. Admin may also explicitly EXCLUDE. Neither action posts Ledger, Balance, or actual commission.
- Select a reason category CANCELLATION, SHIPPING_INCIDENT, RECONCILIATION_ERROR, FORCE_MAJEURE, OTHER and write an explanation.
- Decisions are append-only, stored with actor and timestamp. Source changes invalidate earlier approval and return Order to review.
- Refund cash/Balance payout does not change eligible GP Base twice. Historical Sales is taken from immutable Order sales snapshot.

## Delivered
- Commission source detection + review command in src/lib/commission-review.ts
- API GET/POST /api/commission-review. Read: Admin, Finance, BOD. Decision: Admin only.
- Admin Action Dashboard contains queue and review form; BOD monthly report separates original GP Base and eligible GP Base.
- One reviewed Order can include multiple Claims/Refund sources; review does not attempt monetary allocation.

## Limits
- Eligibility flags only; no commission payment or payroll accounting.
- Queue currently shows latest 1,000 affected Orders, pagination/export pending.
- Category is a human judgment, not automatically inferred from keyword matching.
- Browser UAT for the new review form remains a release acceptance item; automated tests cannot replace it.
