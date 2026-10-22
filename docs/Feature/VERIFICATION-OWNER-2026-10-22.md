# Verification — Owner continuation 22/10/2026

Baseline origin/main: 824e3f6a27aca991acb1801ee8d1adf084767880. Source, docs and this evidence are committed together. No deploy.

| Verification | Recorded result | Evidence |
| --- | --- | --- |
| npm test | PASS, 31 domain suites | [complete output](evidence/owner-20261022/domain-tests.log) |
| npm run lint | PASS, no reported warnings/errors | [output](evidence/owner-20261022/lint.log) |
| npm run typecheck | PASS | [output](evidence/owner-20261022/typecheck.log) |
| npm run build | PASS, Next optimized build | [output](evidence/owner-20261022/build.log) |
| Owner manual HTTP | PASS, 31 assertions; 8 concurrent Tracking retries, 8 price retries, 20 filtered GETs | [output](evidence/owner-20261022/manual-http.log) |
| Statement/Payment/Refund/BOD HTTP | PASS, 39 assertions, five roles and concurrent finalization | [output](evidence/owner-20261022/statement-http.log) |
| Ledger benchmark | 10,000 entries, 20 reads, 25/page, median 46.41 ms, p95 87.28 ms, 8710 bytes, zero DB writes | [raw result](evidence/owner-20261022/ledger-benchmark.json) |
| Browser | Admin five tabs at 1280/390 px, no page overflow or visible empty tables in observed states; populated finalized Statement mobile; Debt review + confirm | [checks](evidence/owner-20261022/browser-checks.json) |

## New/revised regression coverage
- Financial GET: same auth session; compares every application table before/after repeated GET, including a Debt with completed-day unposted interest. Server filters/pagination and signed action receipts verified.
- Pure debt age: >1 frozen buckets, partial Payment moves anchor, partial coverage retains old bucket, transfer invariance, signed wallet offset, open-period exclusion, due-date term, legacy/overflow/negative-adjustment/late-edit REVIEW. Projection equals explicit completed-day interest accrual and never posts it twice.
- Client Carton API: Excel grouping/import, route limits/default Lot, single/multi UPS, independently configured two-Carton dedicated line, unpriced Tracking/Label, late price, exact cents, one Charge/retry, Statement finalization gate, over-budget current order/future buying block. Explicit partial-label audit fingerprint and invalidation; duplicate Trackings on one Carton cannot fake physical coverage.
- Pre-Tracking Admin amendment: price/Reserve replacement and carton amendment, no legacy premature Charge, invalid amendment rollback, context cleanup, direct SQL price edits outside context denied, Client denied, sensitive edit after Tracking denied.
- Existing suites cover ePacket, segmentation, reserve/charge, cancellation, financial taxonomy, one Debt, interest priority, Payment corrections, signed Refund, immutable Statement/BOD parity, RBAC, supplier reconciliation/payables and recovery.

## Browser observations
The synthetic mobile Debt transfer showed Balance -38 → -13 USD, principal 0 → 25 USD, AR unchanged at 38 USD and the same oldest Statement date 22/10/2026. The issued Statement remained unchanged after that transfer. These numbers are disposable fixture data.

[Desktop Debt](evidence/owner-20261022/debt-desktop.jpg) · [Mobile Debt](evidence/owner-20261022/debt-mobile.jpg) · [Mobile confirmation preview](evidence/owner-20261022/debt-preview-mobile.jpg) · [Populated Statement mobile](evidence/owner-20261022/statement-mobile.jpg).
Final Debt snapshot layout was rechecked at 1280/390 px after the UI tidy; the mobile grid has two columns and no page overflow. Both HTTP suites cover the final financial backend source.

## Environment and acceptance boundaries
- Node 20 arm64 matched the installed SQLite native module. Initial Node 22 x86 execution failed before tests; no dependency rebuild/install was needed.
- Duplicate generated Next type files initially broke typecheck. A clean build regenerated them and typecheck was rerun successfully. No source/typecheck exclusions were added.
- Test/HTTP fixtures and build DB were explicitly temporary; no carrier/bank live call or deployment was performed. Codex/ was excluded from staging and left untouched.
- **Runner incident:** the first standalone age runner imported the DB bootstrap before selecting a fixture. No seed/reset or monetary command was invoked by that runner, but default-local-DB startup schema effects have not been proved absent. The runner is fixed; no unknown DB inspection/rollback was attempted. This prevents claiming the default DB was never opened.
- This is not exhaustive branch/device testing or production acceptance. Browser workflow testing was Admin desktop/mobile; role coverage also comes from domain and HTTP suites, not a claim of complete interactive testing for every role/device. Legacy reconciliation, provenance/backup review and deployment-target rehearsal remain open.

See [current implementation, assumptions and remaining gates](OWNER-EXECUTION-2026-10-22.md) and [Debt Management](17-debt-management.md).
