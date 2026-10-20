# Balance Ledger UX and manual-price concurrency — 20/10/2026

Baseline: `4e8d1ca6b833c1bb66dc105a0b8e1295f6f2ac15`, fetched and verified against origin/main. This note covers this continuation, not blanket certification of all historical tests or production.

## Delivered

- Put permitted entry actions and selected Client snapshot before detail/reporting workflows. Six metrics: signed net Balance, available purchasing headroom, Credit Limit, Reserved, outstanding Debt including interest, signed Refund Balance.
- Removed the duplicate global Ledger table/request. One Client-scoped table includes type/status/search filters, signed movements, references, allocation amounts, reversed-Payment status, 25-row pages and empty-state recovery. Filtering/pagination operates on the existing account response; server-side account-history pagination remains a future scalability improvement.
- Collapsed portfolio after selection and secondary Payment/Refund/activity/Statement sections. Debt and permitted controls remain immediately accessible. Explain Statement as immutable reporting, Payment as receipt/settlement and Refund as obligation versus actual payout. Finance's existing separate task workspace and all backend permissions remain authoritative.
- Clear stale financial reads on Client change/unmount, clear loading on deselection, disable account changes during a write, refresh account after entry/import and linked financial commands. Refund snapshot failure/migration is unavailable, not an invented zero.
- Fixed signed opening Balance in financial action responses: `before_summary.purchasing_balance_cents` now uses `before.net_balance_cents`. No mutation math changed. Added isolated regression for negative opening/closing, Debt transfer and exact replay.

## Isolation and reproducibility

Work was prepared in a clean local clone, excluding the untracked `Codex/` tree. All domain suites select disposable paths; `verify-all.cjs` clears inherited operator DB environment variables.

UI fixture was created by `seed-internal-uat.cjs`, which refuses existing files and requires a new `.smoke/internal-uat-test-*.db`: `.smoke/internal-uat-test-ledger-20261020-run1.db`. Seeded 544 Orders, new test users and integrity output. Browser server was bound only to `127.0.0.1:34219` using that explicit DB. Finance list HTTP checks used that same synthetic fixture.

`e2e-manual-price-race.cjs` ignores operator DB paths, creates a unique OS temporary directory/DB, checks its localhost port is free, starts/terminates its own production-build server on `127.0.0.1:34229`, and retains synthetic evidence. No real carrier request or label generation: Tracking strings are `SYNTH-RACE-*` and label references point to an existing demo SVG. The test records synthetic ledger entries only.

Statement HTTP used a separate fresh DB from `seed-refund-uat.cjs`, `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-refund-browser-YRf24R/synthetic.db`, with its own localhost server at port 34239. No unknown/production database was opened or reset.

Use Node 20.20.2 arm64 for this checkout's native SQLite module. The installed Node 22 executable is x86_64 and fails to load that arm64 module; that failed initial attempt is not a test PASS. Production build used `npm run build -- --webpack` (same production Next app, explicit supported bundler).

## Actual checks

| Check | Result / scope |
|---|---|
| `npm test` | PASS 30 suites, including new signed projection suite; [raw output](evidence/ledger-20261020/domain-tests.txt) |
| `npm run lint`, `npm run typecheck`, production build | PASS; lint zero warnings/errors, TypeScript clean, production webpack build successful; [build output](evidence/ledger-20261020/production-build.txt) |
| Manual price HTTP race | PASS 17 assertions: two multi-Carton Drafts; unpriced submit without reserve; distinct 75 USD Orders racing for 100 USD; one winner/one rollback; one Order charge; eight concurrent retries; Client write denial; missing/zero/negative/subcent/NaN price rejection; FK/integrity |
| Finance list HTTP | PASS 22 assertions: pagination, contextual Lot/Order fields, filters, empty states and RBAC |
| Statement V2 HTTP | PASS 39 assertions: Debt/Payment, immutable issued snapshot, concurrent finalize, late adjustments, BOD period parity and permissions |
| Signed projection regression | PASS 17 assertions: negative before/after and GET parity, Debt transfer, no-op replay, denied Client mutation |
| Actual Chrome | PASS 44 assertions across six roles: snapshot, search recovery, type/status filters, Debt/Statement navigation, Admin/Sales review → confirm 1 USD fee → exact debit and refreshed Ledger; mobile overflow and stacked table checks; [raw output](evidence/ledger-20261020/chrome-uat.txt) |

Domain suite scope includes route/carton validation and grouping, purchase/charge/rollback, bulk partial-group recovery, retry/idempotency, split/default Lots and Manifest, operational cases/refunds, Debt interest/settlement, Payment reconciliation/adjustment, BOD/Statement snapshots, RBAC and financial privacy. These are automated branch regressions, not proof every possible production branch has been exercised.

## Browser evidence

`uat-ledger-cdp.py` launches an isolated Chrome profile with up to three launch attempts. It uses real DOM clicks, selections and input events. Login uses same-origin HTTP and browser cookies. It captures desktop at 1440×1050 and Ledger mobile at 390×844. Admin and Sales also execute a synthetic additional fee through review/confirmation and verify the exact 1 USD debit plus refreshed Ledger. It does not claim carrier label/bank payment execution or full click-through of every role workflow.

- [Client desktop](evidence/ledger-20261020/client-desktop.png), [mobile snapshot](evidence/ledger-20261020/client-mobile.png), [mobile transactions](evidence/ledger-20261020/client-ledger-mobile.png)
- [Admin desktop](evidence/ledger-20261020/admin-desktop.png), [mobile snapshot](evidence/ledger-20261020/admin-mobile.png), [mobile transactions](evidence/ledger-20261020/admin-ledger-mobile.png)
- [Sales desktop](evidence/ledger-20261020/sales-desktop.png), [mobile snapshot](evidence/ledger-20261020/sales-mobile.png), [mobile transactions](evidence/ledger-20261020/sales-ledger-mobile.png)
- [Finance reconciliation](evidence/ledger-20261020/finance-payments.png), [Warehouse](evidence/ledger-20261020/warehouse-desktop.png), [BOD](evidence/ledger-20261020/bod-desktop.png)

Raw evidence: [lint](evidence/ledger-20261020/lint.txt), [typecheck](evidence/ledger-20261020/typecheck.txt), [race](evidence/ledger-20261020/manual-price-race.txt), [Finance HTTP](evidence/ledger-20261020/finance-http.txt), [Statement HTTP](evidence/ledger-20261020/statements-http.txt), [seed provenance/integrity](evidence/ledger-20261020/synthetic-seed.txt).

## Explicit NOT TESTED / remaining Owner UAT

- Complete browser transaction matrix across every role/module: manual Single/Multiple Carton form completion → save → purchase → Admin pricing/label entry → split Lots → Manifest scan/status → Payment reconciliation/correction → Refund execution/recovery → issued Statement. This run verifies domain/API branches plus the specific Ledger browser interactions, not that full browser chain.
- Native file picker Excel upload through Chrome and every malformed/mismatched spreadsheet combination in the browser (parser/API regression is separate).
- Every desktop/mobile viewport for Finance/BOD/Warehouse and keyboard/screen-reader acceptance. Mobile page overflow checks cover Ledger Admin/Sales/Client only.
- Real supplier rate/cancellation policy approval, supplier-specific export acceptance, real carrier credentials/labels, bank payments, production migration/deploy/restart and Owner acceptance. No rates or commercial rules invented; no production actions performed.

These remain release gates. No claim of “all branches tested”, “Owner UAT complete” or production-ready status.
