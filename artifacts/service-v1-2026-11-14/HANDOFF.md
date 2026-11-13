# Service Architecture V1 — implementation handoff, 14/11/2026

Historical snapshot: Owner later resolved monetary rounding, UPS Shipment/Lot mapping and Fulfillment scope. See [current clarification](OWNER-CLARIFICATION.md); those three questions below are superseded.

## Delivered code increments
| Commit | Scope |
|---|---|
| 06a75b7 | Recovery, Approved Decisions, canonical spec, Feature Index/README and historical archive |
| ff9b3b0 | Immutable staged VNĐ service configuration and Owner API |
| d0482d0 | Sequential markup, Net/Proposal Review & Publish, stale/retry guards; config history protects route identity |
| 1535d78 | Merge origin/main Supplier Cost changes bcb24cb/32423f0; retain all verification suites |
| 7a3b14a | UPS explicit-rate calculation, configurable rounding, saved/confirmed globals and independent-writer pricing regression |
| 365e40e | UPS account immutable draft/review/publish, published-account + confirmed-global preview |

These are **backend preparation increments**. No V1 operational activation, purchased-price rewrite or ledger currency cutover. No UI delivery/production acceptance claim.

## Remaining engineering work
1. Finish actual Excel workbook parser/import, source acceptance/diff, destination→zone resolver and approved Sub-Service rounding mapping. Staged API currently accepts validated structured rows plus provenance metadata; an Excel filename alone does not prove verified data.
2. Connect reviewed V1 prices to draft quote, opaque Client consent and Purchase under a verified VNĐ financial target. Preserve Hold/Client/credit/debt, immutable snapshots, retry/rollback and cross-module finance behavior. Current operational pricing/ledger remain USD.
3. Implement separate Fulfillment catalogue and agreed Sheet/Zalo/PDF/Manifest workflow once the final service-specific source is supplied. Existing warehouse/Manifest is not that complete module.
4. Implement Client Add-on and ledger integration: revenue locked, pending/revisable Cost/Supplier/Note, Sales scope only Add-on, audit/idempotency and closed-period reporting. Supplier BUY/SELL does not substitute for it.
5. Run data/currency rehearsal on verified disposable sandbox or copy, then role/API/export/browser acceptance. Production cutover is not authorized by a test-data reset instruction.

## Required source/data before dependent integration
- Owner Excel: ePacket Net VNĐ; UPS VTT/SDS/JD rates, service/zone mapping, Min/Max semantics, FIXED/PER_KG units, discount and surcharge inputs. No image/PDF number guessing or activation of fixture values.
- Money rounding at Base/Retail/Sales or final total: step/direction.
- UPS Shipment Surcharge per Lot vs per Order, complete final Sub-Service rounding mapping and global variable destination scope.
- Fulfillment catalogue/unit/workflow source; final ePacket oversize/non-cont components and supported destinations.
- Add-on create/debit limit/permission/closed-period policy details where not already in confirmed source.

Missing data blocks only dependent operations. Remaining implementation above is not presented as completed or as all blocked by Excel.

## Safety and verification scope
Only disposable test DBs and build-isolated SQLite were used. No operational DB reset/migration, no production access, no actual rates activated. Existing AGENTS.md and Codex/ work were excluded from commits. Build regenerated next-env.d.ts to tracked generated form.
Runtime: Node 20.20.2 ARM64, ABI 115, matching installed native SQLite. No Jenkins.
Final source under verification: 365e40e0364571bceb2fa57a2557a96fcf9a94aa.
See final verification report and raw logs in this folder for results; intermediate logs are preliminary and do not prove a frozen source state.
