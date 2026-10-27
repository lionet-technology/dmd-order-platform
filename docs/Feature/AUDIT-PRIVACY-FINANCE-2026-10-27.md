# Financial and role audit — 27/10/2026

## Follow-up (27/10, Order History content leak)
A synthetic Order carrying internal Supplier sentinel and Net Cost in an INTERNAL event was visible to an assigned Sales user through the Order detail timeline; a PUBLIC note also disclosed the Supplier sentinel to Sales and Client. This was reproduced in a failing privacy test before remediation. The read projection in order-audit now filters restricted internal event summaries and source fields for Sales/Client and sanitizes public-note text using the Order's Supplier; legitimate delivery notes remain. Original audit source rows are not modified and Admin retains full history. The privacy fixture now asserts the leak is blocked without hiding legitimate delivery history.
Limitation: free-text confidentiality across other workflows, attachments and exported binary content still needs separate inspection. Because Supplier labels may overlap with public brand terms, UX acceptance should inspect redacted timeline summaries on real route names.


Baseline: `178baa18e5b1132463d9e175049e96e6ffad7f07`. Local tracked tree was clean; untracked operator `Codex/` preserved. Work and every test ran in a separate checkout with newly created temporary databases. Operator `data/`, environment and existing build were not used or reset. No deployment or production acceptance.

## Verified findings and repairs

| Severity | Reproduction at baseline | Repair | Evidence |
| --- | --- | --- | --- |
| P1 | Login as Sales or Client; GET `/api/enums` returns active Supplier enum values. | Role-aware JSON projection removes Supplier enum rows for both roles. | New regression fails on baseline with `no Supplier disclosure SALES/api/enums`; passes after fix. |
| P1 | GET `/api/client-services?clientUserId=<assigned client>` or `?view=setup&clientUserId=...` returns `default_supplier` and its internal name to Sales/Client. | Remove Supplier-named keys recursively for Sales/Client, including JSON serialized as strings; preserve Admin routing. | Fixture Supplier sentinel, both roles, normal/setup responses, nested projection, unassigned Sales denial and Admin preservation. |
| P1 | Unassigned Sales GET `/api/orders/<other client draft>` returns 403 but updates the draft's quote first. | Read identity/ownership and authorize before calling mutating `refreshDraft`. | Active approved ePacket quote fixture, full Order row comparison. Red test observed actual mutation before fix. |
| P2 | Orders search placeholder wraps into two lines and is clipped by its fixed-height box at 1440/390; clear icon lacks a descriptive accessible name. | Short placeholder, accessible search and clear names, long paste instruction in tooltip. | Browser screenshots; bulk matching logic unchanged. |

No P0 was reproduced in the tests performed. This statement does not prove absence of P0 elsewhere.

## Finance coverage actually executed

The complete repository domain runner includes purchase/reserve/charge and cancellation, signed Balance/credit/debt/interest, idempotence and worker contention, Claim/refund, payment reconciliation/adjustments, immutable Statement V2 and late postings, BOD reporting, Supplier accounts/payables/cost coverage, monthly attribution/commission and internal expense installments/reversals. Tests are implementation evidence for their seeded cases, not a new proof of every possible business flow.

Actual localhost expense/refund UAT passed 30 assertions: roles denied, Bank/Balance over-approval rejection, competing payout channels, eight exact concurrent retries, depleted pool, BOD creation and Finance revision, partial installment payment, concurrent excess rejection, replay, reversal, cleared amount input and mobile overflow/runtime checks.

Monthly localhost UAT passed 39 HTTP + 24 browser assertions: current Sales ownership and historical attribution, monthly reports, Claim remaining open at close, immutable close/retry, Admin/BOD/Finance report and Statement review screens at 1440/390.

Privacy localhost UAT tests Supplier and cost sentinels in Orders list/detail, enums, Client settings, financials/refund reads; Sales/Client GET/POST denial on costs/reconciliation/Supplier accounts/payables/internal expenses and operational purchase/manifest exports. Five roles authenticate through HTTP login and open desktop/mobile pages. It does not inspect every screen, every bulk action or every exported workbook.

Base Cost: D02 defines independent Base Rate and sale calculation but does not explicitly grant Sales access to Base Cost. Existing Base Cost, guidance and markup filtering is retained, fail closed. Owner clarification remains required before exposing any of these.

## Residual launch gates and limits

- **Zero leakage is not certified.** Arbitrary public/free-text notes, historical supplier names, uploaded labels/documents, downloadable binary contents and all error/log paths have not been exhaustively classified or inspected. A Supplier-key projection cannot classify supplier names placed in ordinary text. Treat comprehensive external-data/content review as a launch gate; no claim that an actual leak through these untested paths was reproduced.
- Browser coverage includes populated Orders overview for Sales/Client, Admin overview, Supplier overview for BOD/Finance, plus expense and monthly report workflows. Full bulk spreadsheet editing/import/export and all modals across five roles remain unaccepted. Horizontal scroll inside wide Orders tables remains; page-level overflow checks pass. Mobile Admin navigation is crowded and several labels truncate; no navigation redesign in this fix.
- Real pricing/policy acceptance, operational DB migration rehearsal and recovery on a copy of operator data are not completed here. Existing feature release gates still apply; no reset or migration of operator DB was attempted.
- Domain and HTTP fixtures are synthetic and do not validate source documents, bank evidence or real Supplier reconciliation balances.

## Reproduction

Use Node 20 matching the installed SQLite native module. `node scripts/verify-all.cjs`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `node scripts/build-isolated.cjs --webpack`.

`DMD_PRIVACY_HTTP=1 DMD_PLAYWRIGHT_MODULE=<absolute playwright module> node scripts/verify-supplier-privacy.cjs` uses a newly owned DB and localhost server; requires Chrome and permission to bind localhost. Domain mode needs neither server nor Chrome. Screenshots/logs are under `evidence/privacy-20261027/`. Other HTTP runners create their own DBs (`e2e-expenses-refunds.cjs`, `verify-sales-monthly-http.cjs`).

Final validation: **38 domain suites PASS**, standalone **typecheck PASS**, **lint PASS**, isolated production **webpack build PASS**, privacy **111 combined handler/HTTP/browser assertions PASS**, expense/refund **30 HTTP/browser assertions PASS**, monthly **39 HTTP + 24 browser assertions PASS**. Privacy fixture checks unauthorized draft non-mutation and includes Orders carrying internal Supplier/Net sentinels. Build/type/lint and final privacy UAT include both P1 repairs and the search change. Existing monthly/expense screenshots were regenerated by their runners on synthetic data. Logs and ten five-role overview screenshots are saved alongside this audit's evidence.
