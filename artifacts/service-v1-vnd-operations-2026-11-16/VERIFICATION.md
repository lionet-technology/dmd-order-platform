# VNĐ Manual Purchase increment — 2026-11-16
Status: bounded operational slice delivered; full V1 PARTIAL.
Starting local and live remote HEAD: e74a0eac13d21f461c2d16d514e61bb226cc2b9a, main.
Origin verified: git@github.com:lionet-technology/dmd-order-platform.git.
[Feature and exact limitations](../../docs/Feature/33-vnd-manual-purchase.md).

## Delivered
New, explicitly activated empty Client accounts: Chuyên tuyến Purchase → manual offer → Client consent/scoped reasoned override → retained/replaced exact Reserve/Awaiting Funds/FIFO → existing Carton Tracking+Label completion → exact VNĐ charge/ledger → delta Financial Correction, surcharge/tax → configured route-policy cancellation/refund → Supplier pending queue.
No legacy account conversion, price/source inference, production reset or USD relabel.

## Money oracle (synthetic)
Initial 100000.123456 Payment reserves first Request; another waits.
Offer changes to120000.987654; original100000.123456 held through pending consent/funds. Top-up20000.864198 replaces reserve exactly.
One of two Cartons labelled: no debit. Both labelled: one120000.987654 charge, Balance0, Reserve0.
Correction to140000.987654 + surcharge10000.000001 + tax1.000009 creates Balance−30001.00001 without Debt.
90% route policy on current collected150001.987664 → refund135001.7888976. Refund resumes the next eligible Request.
This is a TEST policy, not an assertion of a real Supplier’s rate.

## Recorded verification
- Focused VNĐ regression: PASS63 assertions, including real authenticated HTTP-handler calls and independent SQLite connections.
- Final full regression: PASS55 suites on the final source, including63 focused VNĐ assertions. [Log](test.log).
- Final typecheck and lint: PASS. [Typecheck](typecheck.log), [lint](lint.log).
- Final isolated build: PASS; /vnd and /api/service-v1/operations compiled. [Build](build.log).
- Existing generated duplicate files in .next/types named '* 2.ts' were byte-compared with originals and moved outside the repo to temporary .bak files; no source declarations removed.
- Node v20.20.2 arm64 matches installed SQLite dependency.

## Explicit gaps
Automatic-service VNĐ price mapping/Purchase, general financial cutover/migration, Statements/Debt/claims/reports/Supplier integration, Shipping Edit, Cancel & Duplicate, Client Add-on and browser UAT remain missing. This is not V1 completion or production acceptance.
Existing AGENTS.md and Codex/ remain untouched/excluded from commits. No Jenkins, production, deployment or carrier API.
Final git diff --check PASS. Live remote rechecked unchanged at e74a0ea before commit. Commit/push evidence follows after safe fast-forward publication.
