# Supplier accounts — Owner continuation 24/10/2026
**Status: Partial MVP locally verified. No production migration or carrier activity.**

## Approved decision
The latest Owner request supersedes older restrictions against Supplier prepayment/credit notes. Supplier is the primary navigation entity: overview → Supplier detail → Orders/Tracking, reconciliation, signed Balance, Add-ons and internal Claims. Client Balance follows overview → Client detail with scoped financial tools.

## Implemented scope
- Finance/BOD open Supplier as their initial workspace. Cost import opens from Supplier detail; the detail reuses the reconciliation workspace with Supplier scope. The generic Cost/Reconciliation task items are removed from the primary menu. Existing invoice/payment history is scoped to the selected Supplier.
- Signed USD integer-cent account: positive means DMD prepaid credit; negative means DMD owes. Explicit opening, payment, adjustment, confirmed Actual Cost and actual Claim credit/refund entries are immutable.
- Existing invoices remain documentary payables, not an additional cost posting. Existing invoice/payment records are preserved and **not** automatically imported into the new account. Operators must reconcile an explicit opening, including which historical movements it covers. New Balance payments and legacy Payables payments reject the same Supplier/reference in either entry path.
- An explicit Finance/BOD `confirm_cost` references a matched `supplier_costs` row. Reconciliation is recalculated within the write transaction; only PASS with actual cost may post. Estimated, unmatched or Review cost never posts. The same cost source is globally unique across actors/request keys. Lot adjustments need explicit Supplier allocation and are blocked from this shortcut.
- Add-on direction BUY: decrease Supplier Balance, record purchase cost. SELL: increase Supplier Balance, record revenue and entered net cost. Service catalogue required; manual amounts; optional Order must belong to Supplier. Order linkage is informational and creates no Client charge or second Order cost. Add-on data belongs to the new Supplier commercial report; existing Order/BOD GP is not modified.
- Adjustment is a signed Balance movement with no commercial revenue/cost. Opening and actual payments likewise do not become revenue.
- Active Tracking can be marked refund requested with reason/evidence, then 1–200 requests for the same Supplier can be grouped into one claim. Tracking cannot be claimed twice. Claims store requested amount, evidence, actor and immutable status events: OPEN → SUBMITTED/APPROVED/REJECTED; SUBMITTED → APPROVED/REJECTED.
- Approval changes no money. A full approved claim posts once on CREDIT_ISSUED or REFUND_RECEIVED, with required document reference. Recording both for the same claim is rejected.
- Due date is optional, validated and used only for a simple overdue warning when net Balance is negative. It never blocks purchasing. The warning is a prompt to reconcile due dates, not invoice-level FIFO aging.
- Client hub reuses the existing account overview and detail. Debt, Payment, Refund and Statement tools open after selecting a Client; Payment queries and Refund display are scoped to that Client. Existing server authorization remains authoritative.

## Atomicity / RBAC / data
`src/lib/supplier-account.ts`, `src/app/api/supplier-accounts/route.ts`, `src/app/supplier-account-workspace.tsx`.
Finance/BOD only; Admin, Sales, Client, Warehouse and anonymous callers cannot read or mutate Supplier financial accounts. Actor comes from the authenticated session.
`moneyCommand` wraps business validation, append-only history, postings and actor-scoped receipts in one immediate transaction. A receipt cannot bypass authorization. Global unique source constraints protect against a second request/actor. Failed commands leave no success receipt. Supplier rename is blocked once account/request/claim history exists.
Additive CREATE TABLE migrations preserve old data. No destructive migration, automatic opening calculation, `fc_*` activation, real DB access or carrier integration is part of this work.

## Pending / limits
- Invoice-to-cost matching and opening reconciliation wizard; no automatic historical cutover. Do not add invoice outstanding to signed Balance.
- Supplier-specific add-on catalogue/rate mapping, third-party Supplier-to-Supplier counterparty allocation and company-wide BOD GP integration. Current explicit BUY/SELL represents DMD's side with each selected Supplier.
- Component/replacement-cost/late-adjustment allocation across Suppliers, including historical Emergency reroutes. Confirmed postings are immutable snapshots; later source corrections require explicit signed account adjustment with evidence, not automatic retroactive rewriting.
- Partial claim approval/receipt, claim amount revisions, reopening/cancellation and an evidence upload store. Current evidence/reference is text; settlement is the full requested amount once.
- Formal payment-term defaults and invoice allocation aging. Simple per-entry due-date warnings only.
- Supplier lists show at most the latest 1,000 Tracking and Cost records; older records remain preserved. Full server pagination/search is pending. Account/claim history currently loads all rows.
- Orders/Tracking identification follows current Order Supplier. Replaced/cancelled Tracking cannot be newly marked via the refund action; historical Supplier mapping needs explicit allocation before extending that workflow.
- Complete operational-role/device UAT and production rollout remain pending.

## Verification
Regression: `scripts/verify-supplier-account.cjs` (synthetic temp DB), included in `scripts/verify-all.cjs`; legacy `verify-supplier-payables.cjs`.
[Final executed checks, evidence and limits](VERIFICATION-SUPPLIER-ACCOUNTS-2026-10-24.md): 35 domain suites, Supplier Account 70 assertions, typecheck/lint/build and desktop/mobile browser checks PASS.
