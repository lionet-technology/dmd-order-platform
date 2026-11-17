## Implementation continuation — 17/11/2026
[Feature 37](37-vnd-claims-supplier.md) implements an isolated VNĐ Claim/refund and Supplier actual/payable/payment slice. Already approved rules are unchanged; implementation gaps and actual OPEN dependencies are distinguished there. V1 remains PARTIAL pending wider delivery and pilot acceptance.

# DMD Order Platform — Service Architecture V1 Specification
Current requirements 16/11/2026, implementation PARTIAL.
[Full canonical handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md) contains the detailed approved requirements, formula, Service Matrix and acceptance list. [Approved decisions](SERVICE-V1-APPROVED-DECISIONS.md) summarizes the active rules. [Earlier specification](archive/DMD_Order_Platform_Service_Architecture_V1_Specification-BEFORE-HANDOFF-2026-11-16.md) is historical, superseded where contrary.

## Requirement map
| Handoff section | Feature owner / verification |
|---|---|
| §1 Service Matrix, Supplier, Lot/Carton | 02-orders-drafts, 24-service-v1-configuration, 19-supplier-accounts |
| §2 Configuration, sequential Pricing/Publish, globals | 25-service-v1-pricing, 27-service-v1-quotes, 29-service-v1-fx |
| §3 UPS full formula, (min,max], divisor5000, priority | 26-ups-v1-core |
| §4 ePacket/Yun FX, oversize/non-cont | 03-service-route-pricing, 29-service-v1-fx; exact fee VND/FX relation remains OPEN |
| §5 Purchase/consent/FIFO/Reserve and separate edits | 04-purchase-engine, 05-tracking-label, 28-order-edit-v1 |
| §6 per-Service cancellation and Admin Duplicate | 06-cancellation, 30-supplier-cancellation-followup |
| §7 Fulfillment/Warehouse/Emergency | 07-warehouse-manifest, 18-emergency-route-hold |
| §8 Posting/Correction/Add-on/Claim/Supplier | 08-finance-balance, 09-supplier-reconciliation, 14-refund-management, 19-supplier-accounts |
| §9 Reporting / role visibility | 01-auth-rbac, 16-bod-finance-report, 22-internal-expenses |
| §10 OPEN and deferred / §11 execution and acceptance | 31-service-v1-build-gap, ROADMAP |

## Implementation boundary
Operational Purchase/Reserve/Charge/Statements still use legacy USD cents. The staged VND quote endpoint explicitly reports purchase_eligible=false and operational_cutover=false. This cannot be enabled by relabeling amounts. Preserve old accepted snapshots; rehearse fresh VND data and all projections on a verified disposable target.
Current code deltas and gaps are in [Feature23](23-service-architecture-v1.md). Test passing for a module is not evidence all handoff requirements or UI/UAT are complete.

## Order–Finance invariants
A stable confirmed Purchase request is retained across price/funds waits. Keep old reserve while consent is pending, block issuance, recheck current eligibility and swap atomically after confirmation. Charge once at complete required Tracking+Label and release reserve in that transaction.
Financial posting records real obligations without a Purchase funds gate; corrections are append-only deltas with entity/history/period references. Debt is explicit, never automatic. Cancellation policy and Claim approved/executed pool are distinct; no phantom refund for an uncharged Order or duplicate credit under retry.

## Acceptance and source safety
Use handoff §11 complete matrix: concurrent writers, idempotency, rollback, refunds, scoped Sales/Client export/history, Quote→Purchase and currency reconciliation. Store commit/runtime/logs under artifacts; use synthetic DBs and TEST prices, never guessed workbook values. No production, carrier API or Jenkins activity is authorized.
