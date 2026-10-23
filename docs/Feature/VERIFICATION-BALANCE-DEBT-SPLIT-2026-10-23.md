# Balance-only Statement aging — 23/10/2026

Owner instruction in this execution supersedes combined Balance+Debt aging. Starting point: origin/main fc8cf09 (fetched and verified). No production deployment, real carrier request or real transfer. Codex/ remains untouched.

## Financial behavior
- Statement Credit Term evaluates only max(0, -net_balance_cents). Credit Limit, reserve, account holds and Debt's own deadline remain independent purchase gates.
- Partial transfer removes only that portion from Statement aging; full transfer clears Balance aging. Old issued Statement dates do not override Debt's own deadline or extension.
- Transfer preserves signed ledger Balance and netBalance accounting, creates no fake Payment, and is recorded as signed Balance→Debt journal movements in the next Statement. Issued snapshots remain immutable.
- Payment remains posted interest → Debt principal → Balance. Debt repayment does not release purchasing power twice.
- Opening age certification requires exact uncovered Balance amount, valid historical date, Admin and immutable actor/audit. Evidence text is optional. Existing database contents are never reset.
- UI uses the server's Vietnam as-of day for age/week labels, avoiding browser UTC date drift.

## Dashboard and UI changes
- Aggregate ledger/principal/payment candidates exclude nonnegative Balance accounts before per-account age projection. This replaces a full per-client financial scan; the aggregate still reads relevant financial tables and is not a production-scale performance guarantee.
- Incomplete Label coverage is filtered before the 100-row limit, so newer fully labelled Orders do not crowd out older exceptions.
- Admin queue refreshes after financial and Tracking changes. Tracking save preserves its success message after reloading.
- Opening form evidence is optional; the exact uncovered amount is supplied read-only, so Client switches cannot retain another Client's uncontrolled amount. Date maximum uses the server's Vietnam day. Instructions span the full form grid; action buttons align and retain mobile touch height.
- Dashboard panels have consistent padding, two desktop columns/one mobile column, wrapping actions and aligned headers. Finance task tabs retain horizontal scrolling on mobile.
- Snapshot labels distinguish Balance aging from Debt status. Statement explains independent Debt deadlines.
- Preserved Owner 22/10 rule: late manual price for an already submitted Order records the real obligation even above current headroom; subsequent purchasing is blocked normally. Updated obsolete HTTP fixtures/assertions, not the production manual-price rule.

## Automated verification
- npm test: 33 domain suites PASS, including new 16-assertion Balance/Debt split regression and 17-assertion optional-evidence opening regression.
- New split regression: old overdue Statement, partial/full transfers, own Debt overdue, extension, partial Payment, no fake ledger entry, signed Statement closing and transfer movements.
- Existing Debt reconciliation/payment adjustment suites retain interest-first and money conservation checks.
- Owned HTTP runner: Orders 36, Operations 23, Finance 20, Manifest 16, Cancellation 86, Owner Credit 18, Owner Manual 31, Statement V2 39, Balance Overview 140, Finance List 22 assertions PASS.
- Separate manual-price concurrency suite: 17 assertions PASS, including eight simultaneous same-price retries and no duplicate charges.
- HTTP fixtures use fresh separate DBs; Statement suite has an independent fixture rather than inheriting manual-price test obligations.
- Final lint, typecheck, build and git diff whitespace checks PASS; execution logs are stored with evidence.

## Local preview and scope
Preview: http://127.0.0.1:3000
Synthetic database: .smoke/internal-uat-test-owner-http-preview-1792734034055.db
547 Orders, 17 Clients, 300 Supplier Costs, 40 multi-lot Orders; all roles are synthetic.
Password for preview accounts: Demo12345!
Admin epacket.admin; Sales epacket.sales; Finance uat.finance; Client review.debt or review.manual; BOD uat.bod; Warehouse demo.warehouse.
review.debt demonstrates Debt with a separate future deadline and clear Balance aging.
Final live HTTP check: all seven documented synthetic accounts log in successfully; 20 Admin queue requests on this fixture passed (p50 4.76 ms, p95 8.02 ms). This is a local fixture measurement, not production capacity certification.
review.manual has actionable unpriced/partial-Label Orders. Browser UAT completed one Order at USD 50 with two Labels, so its queue exceptions resolve without changing the other pending Orders.

## Findings and practical limits
- No per-Statement Payment allocation is reintroduced. Balance aging is a read-only coverage projection; transfers appear in the reporting period when recorded, without rewriting old issued documents.
- Dashboard lists remain bounded at 100 source rows. Every returned action is accessible in a scrollable list rather than silently slicing away actions after the first 10/12. Full operational workload at production scale is not certified here.
- Synthetic HTTP/domain evidence does not certify real carrier, bank, historical migration or production readiness.
- Browser UAT at 1280px desktop and 390px mobile: Admin Dashboard exception → Order → two synthetic Tracking/Labels → USD 50 charge; Client snapshot/debt view with no Admin mutation controls; Finance preview/finalize Statement with Balance $0 and Debt $100, explicit transfer and next-period boundary. Issued fixture Statement is visible for Owner review. HTTP covers the other roles and write permissions; this is not a claim of every business workflow through every role's browser.

## Browser evidence
See evidence/balance-debt-split-20261023/ for screenshots and final domain/HTTP/race/lint/typecheck/build logs. Screenshot names identify the role/surface/device. The locally running preview uses only the synthetic DB named above.
