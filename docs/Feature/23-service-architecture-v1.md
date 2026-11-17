## VNĐ Claim / Supplier continuation — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md) records Claim approval/pool/execution/recovery, Supplier actual-to-payable/payment and categorized reporting. This partial delivery supersedes blanket absence statements below within its named scope only; full V1/pilot acceptance is not claimed.

## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

# Feature23 — Service Architecture V1
Reviewed 16/11/2026. Status: PARTIAL.
[Full handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) · [Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md) · [Specification](DMD_Order_Platform_Service_Architecture_V1_Specification.md) · [HEAD gap audit](31-service-v1-build-gap.md).
[Previous baseline audit](archive/23-service-architecture-v1-BEFORE-HANDOFF-2026-11-16.md) is archived; its open/implemented labels are not current.

## APPROVED vs IMPLEMENTED
| Area | Implemented / staged evidence | Remaining approved work |
|---|---|---|
| Configuration/Pricing/FX | Immutable config, Net/Proposal Review/Publish, selected-row VND quotes, confirmed FX; existing staged endpoints | Order/server weight/zone mapping, two-mode operational pricing and complete global apply integration, UI and real source validation |
| UPS | Formula, per-carton/Lot rounding, current divisor5000 and strict (min,max], full-Net tie priority SDS→VTT→JD; account/global version isolation | Verified workbook importer/country zones, account priority UI, Purchase/Lot snapshots and operational quote |
| Purchase/Reserve | Existing reserve/charge; current atomic direct reserve/retry/resize with old-reserve rollback | VND money storage/ledger cutover; persisted Awaiting Funds/FIFO/consent/scoped override and triggers |
| Edit/offer/issuance | Existing any-Tracking/Label shipping lock | Separate manual offer/correction command and UI, consent-held revision, no automatic offer overwrite |
| Cancellation | Current configured route/stage policy, optional Admin support100, unconditional shipment deny, reserve-only and refund cap, Supplier pending queue | Source-specific real Supplier policy acceptance, Admin-only atomic Duplicate + pending new Purchase |
| Finance | Existing ledger/adjustment/Debt/Statement/Claim workflows; Supplier accounting separate | Client Add-on/Order correction deltas, VND reporting/statement reconciliation, full role UAT |
| Data | No operational currency switch or reset | Disposable VND rehearsal, verify opening/ledger/reserve/statement/report totals before activation |

## Delivery and verification
- 81509f0: full handoff source, conflict reconciliation and gap audit at 7491a726.
- ee8ef23: cancellation policy per Service/Sub-Service/Supplier route; missing policy fails closed. 139 domain assertions, 32 Supplier queue assertions and 33 real HTTP assertions including concurrent retry/custom72.5% policy.
- 7521ab3: immediate atomic reserve, same-amount replay, replacement excluding only its own reserve, rollback on funds/audit failure; 18 checks with five independent SQLite writers.
- 4c16063: UPS divisor/interval/tie behavior; 89 calculator and18 account-publication checks.
- Combined candidate: 53 domain suites, lint, typecheck, isolated build and HTTP suite PASS. [Verification report](../../artifacts/service-v1-build-2026-11-16/VERIFICATION.md). No full UI/UAT/production acceptance.

## Next execution and OPEN dependencies
Order–Finance comes first: verified VND data/money model + server quote resolver, persistent consent/wait/FIFO, separate edit/offer/issuance, atomic replacement and corrections. Update features/tests with each behavior change.
Current source/fee-FX decisions are in SERVICE-V1-SOURCE-INDEX.md; Owner confirmed Standard/Eco inclusive mid-mile + last-mile Net in Feature 39. Detail is deferred. Supplier cancellation values and carrier proof still require configuration. Service-change behavior follows Feature 35. Missing implementation of an approved rule is not an OPEN business decision.
