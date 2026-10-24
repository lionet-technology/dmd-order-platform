# Supplier / Client continuation — verification 24/10/2026
**Result: Partial MVP implemented and locally verified. No production deployment/acceptance.**

## Delivered
Supplier overview/detail, scoped Orders/Tracking and reconciliation, reused cost import entry from Supplier detail, invoice/payment history, signed Balance, commercial BUY/SELL Add-ons and internal multi-Tracking Claims. Client hub selects an account before showing scoped financial tasks. Details, current rules and pending scope: [Feature 19](19-supplier-accounts.md).

## Executed checks
- Full `scripts/verify-all.cjs`: **35 suites PASS**, including Emergency regression unchanged and Supplier Account **70 assertions**. Evidence: [domain log](evidence/supplier-accounts-20261024/domain.log).
- TypeScript `tsc --noEmit`: PASS.
- Full ESLint: PASS, no warnings in final run.
- Next production build: PASS, explicitly targeting a disposable synthetic DB under /tmp. [Build log](evidence/supplier-accounts-20261024/build.log).
- `scripts/e2e-supplier-accounts.cjs`: **6 browser assertions PASS**, Chrome, rebuilt production candidate, synthetic temporary DB/accounts only. Desktop 1440×1000, mobile 390×844. BUY/Supplier Balance −$10; SELL +$25; both Supplier and Client have no document-level horizontal overflow; selected Client retained through Statement → Ledger; back to overview works; no page errors.
- Browser screenshots visually inspected: [Supplier desktop](evidence/supplier-accounts-20261024/supplier-desktop.png), [Supplier mobile](evidence/supplier-accounts-20261024/supplier-mobile.png), [Claims mobile](evidence/supplier-accounts-20261024/supplier-claims-mobile.png), [Client desktop](evidence/supplier-accounts-20261024/client-desktop.png), [Client mobile](evidence/supplier-accounts-20261024/client-mobile.png).
- UI script requires a local Playwright installation via `DMD_BROWSER_NODE_MODULES` and uses installed Chrome. Runtime Node 20.20.2 matches the repository's existing better-sqlite3 binary. No dependencies were reinstalled.

## Financial/security evidence
Tests cover authorization before receipt replay; API deny matrix; session-derived actor; immutable history; exact retry and changed-payload rejection; cross-actor duplicate Cost rejection; Estimated/Review/unmatched non-posting; BUY/SELL signed postings and separate commercial totals; optional Order Supplier validation; no Client charges; no duplicate Tracking claims; approval non-posting; actual credit vs received refund globally once; injected posting failure with full rollback/no success receipt; schema rerun preserving data; Supplier rename protection; both directions of legacy/new Payment reference collision; invalid due-date rollback and warning-only overdue.

## Safety and limits
The real database, carrier, Emergency implementation and `Codex/` were not changed. Existing migrations/data are preserved; no reset or inferred historical opening was executed.
This is the Owner-authorized priority MVP, not the entire requested long-term module. Pending: reviewed legacy opening/import mapping, Supplier-specific catalogue and third-party allocations, partial claims/refunds and amount revisions, cross-Supplier cost-component/adjustment allocation, formal payment-term defaults, full history pagination and company-wide Add-on GP/report integration. See Feature 19 for exact restrictions. Browser coverage verifies the named flows; it does not certify every role/action on every device.
