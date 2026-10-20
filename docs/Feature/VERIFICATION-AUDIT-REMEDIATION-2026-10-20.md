# Audit remediation — 20/10/2026

Status: partial delivery, verified candidate; not Owner acceptance or production approval. Baseline local/main `0adbcbd3139ee48c51aa086b3eb5882c632cf61b`, verified directly from GitHub before changes. Source of priorities: completed Owner audit, not a new audit from scratch.

## Implemented

- Operational `accountFinancials.available_to_buy_cents` floors purchase room at zero. Signed ledger/net Balance is preserved. Signed insufficient headroom, Hold, inactive account and overdue Debt still block independently. Existing tests verify reserve conservation and Debt repayment without releasing room twice; added an explicit negative-headroom zero-room regression.
- Statement movements become labelled stacked rows at ≤640px: posting/reporting dates, source, signed Balance/Debt/Refund changes, Payment principal/interest and detail remain visible. Desktop keeps the comparison table. Empty periods explicitly say no movements.
- Repaired obsolete HTTP fixture expectations: 3-carton Orders use UPS instead of ePacket, which has one-carton service constraints; synthetic credit is explicitly configured; incomplete Orders are tested through Issues rather than default Ready. Manifest fixture route uses the same UPS service. Finance now asserts Claim obligation increases Refund Balance exactly once with no wallet credit, and retired manual Statement allocation is rejected. This changes tests to approved Owner rules, not product rules to satisfy historical assertions.

Statement V2 was already operational at baseline. This patch preserves immutable financial snapshots, Claims-derived dispute, late postings, signed three-account openings/closings, zero finalize charges, Payment interest→principal→Balance and BOD parity. It does not claim to implement them anew or activate `fc_*`.

## Verification actually executed

Node 20.20.2, production Next 16.3.6 build. Final npm test/lint/typecheck/build exit codes 0; diff check clean.

| Check | New result |
|---|---|
| npm test | 26/26 suites PASS; Statement V2 78 assertions, Owner credit 47 checks |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run build | PASS |
| e2e-statements-v2 | 39 assertions PASS: five-role login/scope, deny Finalize, 10 concurrent retries, no duplicate charge, late posting and BOD parity |
| e2e-order-api | 33 assertions PASS |
| verify-order-acceptance | 42 checks PASS |
| verify-order-imports | 20 checks PASS |
| verify-order-validation | 8 checks PASS |
| e2e-finance-domain | 20 assertions PASS |
| e2e-operations | 23 assertions PASS |
| e2e-manifest-scan | 16 assertions PASS |
| e2e-finance-list | 22 assertions PASS |

Nine HTTP harnesses / 223 assertions/checks on disposable fixtures in this run. No coverage percentage measured. Logs: [evidence folder](evidence/audit-remediation-2026-10-20/). Initial sandbox localhost connection EPERM required an approved local connection. Initial legacy HTTP runs failed at obsolete Ready/ePacket/Claim assumptions; these were corrected and each failing harness rerun successfully. No initial failure is counted as a PASS.

## Data and clean-schema rehearsal

No existing/unknown DB reset. Fresh `seed-refund-uat.cjs` fixture at `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-refund-browser-5sLXJY/synthetic.db`, containing only five `uat.*` users and the script's synthetic Claim/Order, was backed up with SQLite backup API before HTTP writes. Reopened backup integrity `ok`, FK violations `[]`. An after-run backup was reopened read-only: integrity `ok`, FK `[]`, `credit_debts.source_statement_id.notnull=0`, no `fc_*` tables, one Debt account, four ledger rows and zero Statement allocations. This demonstrates the clean operational schema and backup reopening, not a migration of unknown legacy history or full application restore UAT.

Orders fixture: new `/private/tmp/dmd-remediation-orders-v2-20261020.db` on :3137. HTTP fixture runs sequentially after successful `e2e-order-api`. Finance pagination fixture: new `.smoke/internal-uat-test-remediation-20261020.db`, created by `seed-internal-uat.cjs`, on :3136. No fixture claims production provenance.

## Browser observations

Real in-app browser, mobile-width viewport (378px screenshot), production server :3134. Admin: signed wallet −$38, available room $0 and insufficient-credit reason; Statement historical closing −$37 / Debt $0 / Refund $7 remains distinct from current −$38 after late fee; movement labels and full detail readable as stacked rows. Finance: Client selection defaults to 21/10, future Finalize disabled, issued 20/10 snapshot opens, bank refund $2 separate. Screenshots `admin-room.png`, `statement-mobile.png`, `finance-statement.png` in evidence folder.

Chrome desktop tool was unavailable. Other roles have new HTTP checks, not new full browser acceptance. Mobile viewport is not a physical-device sign-off.

## Outstanding, in priority order

1. Full five-role desktop/mobile browser acceptance: one-carton create→purchase, multi-carton end-to-end, bulk partial failures/reselection/reload, Payment adjustment, signed Refund/recovery and errors workflow. This run adds focused Admin/Finance mobile evidence only.
2. Intraday rate/principal/top-up acceptance and large-history accrual performance; no unapproved change to day-based interest policy.
3. Deployment target DB identification, provenance and backup/restore/cutover when the actual target is selected. Clean synthetic fixture removes legacy schema blockers for tests; unknown data is untouched and legacy guards remain.
4. High-volume/resilience tests, real carrier/label/void, approved rates, cost/FX/bank/Supplier evidence and Owner acceptance. No production deployment in this patch.
