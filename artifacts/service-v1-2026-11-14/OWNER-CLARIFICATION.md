# Owner clarification — 14/11/2026

Source: Owner replies in the current chat after evidence commit e2b1f73.
CONFIRMED:
1. Monetary VNĐ values retain fractions; no rounding at Base/Retail/Sales or Order total. This does not change weight rounding.
2. One UPS shipment is one Lot; Shipment Surcharge once per Lot. Customer Order is one destination and may contain multiple Lots.
3. Fulfillment V1 is Order processing and Supplier handoff: Order→Purchase→Tracking/Label→Manifest/handoff. A separate fee-based warehouse service catalogue is not a requirement/blocker for this scope.

Changes in this commit:
- Canonical Approved Decisions/spec/Feature 23/Pricing/UPS and dependent Purchase/Warehouse docs updated; resolved questions removed from current OPEN requirements.
- Existing V1 pricing keeps fractions; workspace monetary rounding metadata now NONE.
- Pure upsOrderNet sums separately rated Lots, with each Lot applying Shipment Surcharge once; duplicate/empty Lot IDs reject. No operational Purchase/ledger mutation.
- Fractional pricing, two-Lot surcharge, multi-carton single-Lot and duplicate-Lot regressions added.

Verification on Node 20.20.2 ARM64 with disposable SQLite:
- verify-service-v1-pricing.cjs: PASS 29 checks, including independent publish writers.
- verify-ups-v1-core.cjs: PASS 43 checks.
- verify-ups-v1-accounts.cjs: PASS 18 checks.
- Typecheck and changed-file ESLint PASS; git diff --check PASS.
Previous 49-suite/full-build proof remains scoped to 365e40e; it is not claimed as a new full run for this increment.

Remaining: actual Excel rates/zone tables, final UPS weight-rounding mapping and destination scope, actual workbook import, operational VNĐ quote/Purchase/ledger and Fulfillment integration, Client Add-on. Old HANDOFF.md statements that monetary rounding, shipment→Lot scope or a separate Fulfillment catalogue require clarification are superseded by this document.
No operational data reset/migration or price activation performed.
