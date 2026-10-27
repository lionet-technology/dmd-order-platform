# Sales/Client egress and bulk continuation — 27/10/2026

Baseline: local and fetched `origin/main` both `c059b1046faf716efc65654da0437f82a760a43a`. Work performed in an independent checkout, with the existing dependency installation shared read-only. Every runner creates and removes its own temporary database; build uses `build-isolated.cjs`. No operator database, environment, or untracked `Codex/` was copied into the fixture or edited. No deployment or production acceptance.

## Reproduced findings and repairs

| Priority | Reproduction | Final behavior |
| --- | --- | --- |
| P1 | A PUBLIC Claim Case with Supplier/cost sentinels in `summary`, `next_action`, COMMENT `data_json`, and another JSON string nested inside that JSON was returned by `/api/cases` to assigned Sales and Client. The new regression failed first on `SALES /api/cases excludes confidential values`. | The common Sales/Client JSON response projection also sanitizes text values and string arrays, including error responses and serialized nested JSON. Supplier names come from current/historical enum values (including inactive), Orders, route configuration and Client settings. Explicit financial labels and additional cost aliases are excluded. Admin retains original Case text; source rows are never rewritten. |
| P1 | A two-Carton UPS Order using a configured active route with empty optional Sub-Service was READY, downloaded/uploaded correctly, then failed when Admin supplied the Order price: `Route chưa được cấu hình active.` Bulk save stored the empty Sub-Service as SQL NULL, whereas manual pricing compared `lower(NULL)` against the route's empty string. | Normalize absent Sub-Service during manual route lookup and compare normalized blank values when enforcing the price snapshot's route lock. A genuine change to `Saver` remains rejected. Tests verify one $35 charge for the whole two-Carton Order, exact replay and lock preservation. No migration or money-rule change. |
| P2 | Previous Order-note filtering discarded the entire paragraph if it contained a Supplier or cost term, losing legitimate instructions in the same paragraph. | Replace confidential name/value spans; preserve surrounding instructions, timestamps, delivery text and customer charges. Names are escaped as literals and matched at token boundaries, avoiding substrings inside ordinary words. |

Sales/Client links containing a recognized private name, or using inline/non-HTTP/non-relative schemes, are withheld as null. Ordinary HTTP(S) and root-relative document links remain. This closes disclosure in the URL itself; it does not inspect a remote document's bytes.

Admin Supplier setup and downloads remain available. Owner Base Rate data and CSV remain governed by the existing Owner check. Finance/BOD retain private financial data only at their approved endpoints. Cost aliases are still excluded from operational JSON. No new role permission was granted.

## Content coverage and evidence

`scripts/verify-egress-content.cjs` runs actual handlers by default; `DMD_EGRESS_HTTP=1` starts the production build against the same owned temporary fixture and performs actual HTTP requests instead. Assertions inspect response bodies and confidential **values**, not just field names.

- Sales and Client: Cases (PUBLIC summary, next action, COMMENT, nested JSON), Orders list/detail and internal-note rules, Control Tower, enums, Client settings, users, financials, refunds and Ledger.
- Unassigned Sales: Order read rejected; foreign Client Case omitted. The existing privacy suite also checks denied draft reads do not reprice foreign Orders and Client settings enforce assignment.
- Denied download/export matrix: Sales, Client, Warehouse, Finance and BOD against purchase template listing/download/preview, purchase export, Generic purchase export, Tracking workbook, Base Rate CSV and service-route setup. Warehouse's legitimate Manifest permission is explicitly retained. Existing privacy tests cover Sales/Client denials for Supplier accounts and internal expenses; operational Admin remains denied costs/reconciliation/payables.
- Nested arrays and JSON strings; finance aliases (`true_cost`, `estimated_cost`, `gp_net`, `net_price`, `unit_cost`, Base Rate/markup), internal `source_code`, errors, attachment URL, inline label URL, and a safe retained download link. The synthetic wrapped error test is a projection boundary test; it is not presented as a separate real endpoint.
- A genuine Admin Generic XLSX is generated, decompressed with JSZip and parsed with ExcelJS. Supplier is present for Admin; the Net/Base sentinel is absent. Every public XLSX template is decompressed and scanned (HTTP mode downloads actual bytes first). Public templates contain headers/instructions rather than operator data. An instruction mentioning “Net Cost” is not itself treated as a data leak.
- Existing template/download and release-gate suites cover unchanged workbook bytes, role denial, private cache headers and restricted financial placeholders. JSON filtering is deliberately not applied to ZIP/XLSX compressed bytes.

Logs and screenshots: [evidence/egress-20261027](evidence/egress-20261027/). `blank-route-before.log` records the failing route regression before its repair. Results below are final-run evidence, not inherited results from the baseline audit.

## Browser UAT

`scripts/e2e-egress-bulk.cjs` uses Chrome against a disposable localhost production instance. At both 1440 and 390 pixels it:

1. Pastes two Orders through the Client UI, saves both Drafts, injects a controlled invalid weight after saving, buys one successfully and displays one failure; verifies failed selection is cleared; corrects/saves/retries explicitly and verifies one reserve per Order.
2. Opens Admin bulk purchasing for two genuine two-Carton UPS Orders. Filters to UPS, verifies four rows grouped into two Orders, rowspan fields and alternating group backgrounds.
3. Downloads the actual Tracking XLSX, parses and fills it, uploads through the browser file input, then exercises TSV paste and the visible save action.
4. Injects failure on the last Tracking insert, verifies full transaction rollback and retained UI input, removes the trigger and retries through the same button. Verifies four saved Trackings and exactly one $35 charge for each two-Carton Order.
5. Opens populated Admin service setup; checks setup navigation is absent for Sales, Client, Warehouse, Finance and BOD; checks viewport/modal fit, browser runtime errors and DB integrity/foreign keys. Screenshots are inspected separately. Wide tables retain their intended internal horizontal scrolling.

The browser fixture does not submit any real carrier purchase, access a real Supplier account or use operator credentials. It is not acceptance of real pricing, labels or payment evidence.

## Release readiness

**P0:** none reproduced in this scope. This is not proof of global absence.

**P1 repaired:** Case/free-text egress at the tested response boundary; empty-Sub-Service manual bulk pricing and exact retry. Final verification results are recorded below.

**P1 release gates still open:** arbitrary remote Label/attachment content is not classified or rewritten by this application. An innocent URL may lead to a document containing a Supplier name, cost, metadata, image or embedded attachment; URLs can also change after entry. Catalog-name and labelled-value matching cannot prove confidentiality of unknown historic aliases, unlabelled prose/numbers, images, obfuscated/encoded payloads or browser-readable external files. These require a reviewed document/content publication boundary and real-data acceptance before claiming zero egress. No broad automatic deletion of legitimate notes or interception of arbitrary remote files was introduced. Operational DB migration/restore rehearsal and real pricing/carrier/policy acceptance remain open from earlier audits.

**P2:** dense mobile navigation and sideways scrolling within wide spreadsheets remain usability constraints. No additional overlapping-control P1 was established by the tested interactions. Supplier names that also serve as ordinary public words/brands can be conservatively masked in prose; structured Service, Tracking and Order identifiers are preserved. Review actual publication data before acceptance.

## Final validation

- **39 domain suites PASS** (includes privacy content **194 assertions**, existing Supplier privacy **25**, and expanded bulk recovery **23**).
- **195 actual HTTP content assertions PASS**, including response-body and downloaded-workbook checks.
- **72 new bulk HTTP/browser assertions PASS**, desktop/mobile, workbook upload and injected rollback/retry.
- **117 existing privacy handler/HTTP/browser assertions PASS** on the final build, covering authenticated five-role desktop/mobile pages and private endpoints.
- **Lint PASS; standalone TypeScript PASS; isolated production webpack build PASS; `git diff --check` PASS.**
- Primary operator database SHA-256 remained `b5a9dfa9e4a6b9cd7caed432226ab751cb4cf235110bac33f6739deb46e74357`; sampled demo DB hashes also matched the initial inventory. Original checkout stayed at baseline with only `?? Codex/` before integration.

Financial regression includes reserve/charge, bulk rollback, exact retry, credit/debt/interest, cancellation, approved Refund pool, reconciliation/adjustments, immutable Statements, Supplier accounts and internal expense installments/reversals. The financial formulas were not changed. The additional blank-Sub-Service regression proves a valid route reaches those existing money rules.

## Reproduction

Use Node 20 compatible with the installed SQLite native module:

```sh
node scripts/verify-all.cjs
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node scripts/build-isolated.cjs --webpack
DMD_EGRESS_HTTP=1 node scripts/verify-egress-content.cjs
DMD_PLAYWRIGHT_MODULE=<absolute playwright package> node scripts/e2e-egress-bulk.cjs
```

The HTTP/browser runners require localhost binding; Chrome UAT requires installed Chrome. Scripts never inherit an operator DB path: each sets its own temporary path before loading application modules.
