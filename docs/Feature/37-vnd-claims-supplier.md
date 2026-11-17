# VNĐ Claims, Refund pool and Supplier actual/payable increment
**Status: PARTIAL, locally verified on synthetic data; not pilot/production accepted. Reviewed 2026-11-17.**

## Approved scope and implementation
Canonical workspace /Users/quan/Developer/report; starts at 6245e7d. No USD conversion, real-data migration, deployment, Supplier portal or Cargo allocation.

Client/assigned Sales/Admin create a Claim for one or more charged VNĐ Orders. Categories: shipping issue, force majeure, reconciliation error. Admin alone approves/revises a nonnegative total with expected revision and evidence. Every decision appends its signed delta to the Client Refund pool. Goods line quantities/declared manufacturing values retain their source currency; current charged revenue includes price corrections, surcharges and taxes. Evidence and these values are snapshotted at each decision. No inferred FX, compensation percentage, cap or per-Order allocation. Creating a Claim requires charged, noncancelled Orders; later decisions may revise an existing Claim even after cancellation.

Finance alone executes positive partial Bank/Balance payouts, rejecting the entire request above the positive pool. Bank requires actual executed date, reference, source/destination and proof; it never credits the wallet. Admin/Finance explicitly recover only the negative pool by actual Bank receipt or funded Balance after all active reserves. Credit cannot fund recovery; no automatic collection, Debt or Hold. Downward approval revision does not rewrite any payout. Same actor/key/payload retries return the receipt before current-pool checks; conflicts fail. Transactions include journal, wallet, history and receipt. Independent concurrent writers serialize the pool test.

Claim payout is separate from route-policy Cancellation Refund. Cancellation still uses configured policy and shipment denial, never this pool. The old USD Claim/Refund adapter rejects VNĐ Clients, including bank-only paths. History omits bank fields for Client/assigned Sales; a receipt replay also redacts according to the actor's current role.

New Statements capture refund opening/closing and event cursor, with only public event fields. Previously issued JSON stays unchanged, including historical null Refund openings. The next snapshot treats a preactivation null as zero and includes new events by cursor; no old USD obligation is inferred.

## Supplier slice
Dedicated /api/service-v1/suppliers supports canonical Supplier registry names and isolated exact VNĐ journals. Admin/Finance/BOD may submit documentary totals by explicit Lot or uniquely matched Tracking. They must reference a VNĐ purchased/charged or cancelled Order; no inference from a tracking that matches multiple Lots. All submissions remain pending; duplicate documents leave approved actual and payable unchanged. Finance/BOD explicitly accept/chốt actual with the expected currently approved cost ID; Admin/Finance can retain old actual. Duplicate resolution never adds totals together.

Only accepted actual appends the delta from the prior approved total to Supplier payable. Estimate is reference only (UPS Lot snapshot, or single-Lot quote); missing/multi-Lot manual estimates remain null. Finance/BOD record partial payments, signed prepayments and explicit payable adjustments with immutable references/history. A repeated payment reference is rejected within the VNĐ journal. Supplier writes never post Client money, change selling snapshots or treat Order cancellation as carrier void/cost reversal. Admin sees documentary costs/reviews but not the payable/payment ledger, preserving current explicit permissions.

This is a separate new VNĐ journal, not an opening-balance migration from old USD Supplier accounts. Never add their balances or reinterpret old documentary invoices as new VNĐ costs.

## Reporting / access
BOD-only enterprise report adds Claim obligation deltas by processing month/category and historical Sales when every linked Order has the same Sales; mixed/missing attribution remains review. Actual Bank execution is reported by executed month, independently of wallet movements and approval. No second GP reduction for payout. Commission performance marks Claim groups separately from cancellation and non-Claim groups, but does not allocate multi-Order pool amounts or fabricate GP-minus-Refund totals. Pending Claims are a group marker, not a financial refund.

Supplier approved total costs are exposed separately per Order. Missing Lots remain missing. ePacket Standard/Eco component coverage is explicitly OPEN and does not certify fully actual GP. Broader actual GP and commission payout remain unaccepted.

Server authorization checks current active actor and Client ownership. Sales/Client cannot read Supplier endpoint; Admin/Finance/Sales/Client cannot read enterprise report. No added inheritance for BOD Claim decisions or Admin Supplier financial ledger.

## Transaction connection hardening
Actual production-build Chrome UAT exposed SQLITE_BUSY while finalizing a Statement after financial writes. Server bundling can evaluate the DB module more than once through the financial import graph; production previously skipped global connection caching. The DB module now reuses the open connection for the same resolved file in every mode, preventing a command's nested module from opening a second writer. A closed connection or changed file is not reused. A duplicate-module production regression verifies identity and cross-module rollback. Independent worker connections still serialize through SQLite.

## Code / tests
- src/lib/vnd-refunds.ts, vnd-supplier.ts, vnd-operational-schema.ts, vnd-operational.ts, vnd-statements.ts, vnd-reporting.ts, vnd-commission.ts.
- /vnd UI Claim/Refund and Supplier sections, /api/service-v1/operations and /suppliers.
- scripts/verify-vnd-refunds.cjs: fractional pool, snapshots, RBAC, payout/revision/recovery, reserve protection, bank privacy, rollback, immutable Statements and independent writer race.
- scripts/verify-vnd-supplier.cjs: pending/old/new totals, CAS, actual-to-payable delta, payments/prepayments, reference duplicate, role isolation, rollback and unchanged Client/Order.
- Full gates and actual browser evidence: artifacts/vnd-claims-supplier-2026-11-17/VERIFICATION.md.

## Remaining implementation, distinguished from OPEN decisions
Not delivered in this increment: VNĐ Supplier surcharge template/import mappings and duplicate supplementary confirmation, Supplier Claim receivable/partial receipts/offset/reversal cutover, Supplier period locking/late-period references, durable Claim notifications/acknowledgements and integration with public Control Tower cases. Existing USD implementations are not certified VNĐ. These are implementation backlog, not requests to reapprove established rules.

Actual OPEN dependencies: ePacket inclusive cost-component mapping/coverage; exact unconfigured Supplier cancellation/void policies and real carrier evidence. Mixed-Sales/per-Order Claim allocation is deliberately not inferred from a Client pool; manual group review remains the approved boundary. Pilot, real documentary reconciliation, backup/restore target rehearsal and comprehensive manual UAT remain required. V1 is not done.
