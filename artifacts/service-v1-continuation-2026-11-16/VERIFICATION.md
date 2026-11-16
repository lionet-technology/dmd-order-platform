# Service V1 continuation — 16/11/2026
Status: PARTIAL. This increment is exact VNĐ arithmetic only.

## Approved push completed
- Checked branch main, upstream origin/main, remote git@github.com:lionet-technology/dmd-order-platform.git, range contents and diff whitespace.
- Live remote before push: 7491a726d953cdf6f6784ef76e604ced729db961.
- Fast-forward push of exactly five approved commits succeeded.
- Live remote after push: 2cef3e086a4f40cf16226642e5acbd6c1d3edcda.
- Existing modified AGENTS.md and untracked Codex/ preserved and excluded.

## Delivered in this candidate
Exact canonical decimal VNĐ helper, signed deltas, multiplication/sum/comparison and cancellation policy arithmetic with prior-refund cap. No money rounding, Number-safe-integer restriction or USD relabeling. No active wallet/ledger/Purchase behavior changed. See Feature 32.

## Checks
Node v20.20.2 arm64 (matches installed SQLite native dependency):
- npm test PASS — 54 suites, including new VNĐ arithmetic and independent-writer reserve regression.
- npm run typecheck PASS.
- npm run lint PASS.
- npm run build PASS — disposable SQLite build database.
- git diff --check required before commit.

Initial environment failures were resolved: default PATH omitted Node; v22 installed is x86_64 and cannot load arm64 SQLite. Pre-existing identical generated files named '* 2.ts' in .next/types caused duplicate type declarations. Verified byte equality with originals and moved duplicates to temporary backup; no source type declarations changed. Initial lint/typecheck rerun also included backup .ts files; backups were renamed and moved outside the source tree. Final recorded logs are successful runs.

No HTTP/browser checks were added for this helper-only change; no endpoint/UI changed. Existing suites include their normal API regressions. No production acceptance is claimed.

## Required work still missing
- Exact decimal pricing inputs/quote calculation and server Order weight/zone resolver.
- Consistent operational VNĐ storage across wallet, ledger, reserve, payments, Debt, Statements and reports on a clean disposable target.
- Persistent consent/override, Awaiting Funds and automatic FIFO; retained reserve during pending consent.
- Shipping edit vs manual Selling Price vs Financial Correction vs Tracking/Label separation.
- Cancel & Duplicate Purchasing with idempotency and rollback.
- Client Add-on/cost history, signed revenue corrections and scoped role/UI/report integration.
- Workbook/zone provenance, real Supplier policies and dependent open fee values; role/browser UAT.

No Jenkins, deployment, carrier API or production data was touched.
