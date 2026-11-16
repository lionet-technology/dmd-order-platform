## VND continuation — 17/11/2026
UPS is now connected to new-account VND Purchase through published account versions and separate selling publications; pending account versions cannot activate via confirmed globals. ePacket non-US Standard/Eco creation/edit now selects exactly one configured eligible ePacket EU route or fails explicitly. No Yun substitution.

[Current implementation, acceptance and remaining boundaries](35-service-v1-completion.md). This delta supersedes earlier delivery-status statements below only within the named new-account VND scope; broader V1 completion is not claimed.

# Feature 34 — Final (2) source and automatic VNĐ Purchase increment

Status: PARTIAL V1. [Authoritative workbook and audited cells](SERVICE-V1-SOURCE-INDEX.md). Source reconciliation committed first at 7916b14.
This increment extends the explicitly activated, empty-account VNĐ book in [Feature 33](33-vnd-manual-purchase.md); no migration/reset of an existing account or production DB.

## Implemented scope

- Canonical original XLSX plus reproducible decimal-string JSON and raw cells. Runtime checks both workbook SHA and normalized JSON SHA; changed source fails closed.
- Server shipment resolver: country/market, one-carton ePacket/Yun, dimensional divisor 5000, actual vs dimensional weight, next tier and source maximum. Separate ePacket EU and Yun market tables; no fallback between services.
- ePacket Standard/Eco raw USD × currently confirmed FX, sequential published markups, Client discount, fixed VND oversize/non-cont surcharge. Published proposals now also retain exact decimal Base/Retail alongside compatibility numeric preview fields. Operational VND reads exact fields.
- ePacket EU/Yun published VND prices; automatic-service missing prices are errors, never Manual Awaiting Quote or zero prices.
- Root Admin imports final Net through POST /api/service-v1/source action import. Existing config, Net Review/Publish, proposal, proposal Review/Publish remain required. Import alone never purchases or activates a rate. The service configuration UI exposes country config, final source import, tables, sequential markup, Review/Publish.
- POST /api/service-v1/source action quote resolves the Order server-side; explicit public projection includes Selling/total/surcharges and version IDs only. Active-role and client-object scope precede quote.
- VNĐ Order creation admits ePacket/Yun. Request resolves a current published price, creates a revision requiring Client consent or scoped Admin/Sales override. Normal exact Reserve/Awaiting Funds/FIFO/Charge/Ledger and existing Tracking/Label handlers are reused.
- Pending automatic requests refresh price at consent, funds trigger and before issuance. Selling changes require new consent; old reserve remains until valid atomic replacement. Net-only/metadata changes do not require consent. Manual offers remain effective and are not overwritten by refresh.
- Snapshots record source SHA/cells/rate, shipment/Lot, config/Net/selling/FX versions, markups-derived Base/Retail/Selling and fees. Append-only quote history is server-only. Once any Tracking/Label exists, quote is frozen; complete Tracking+Label charges once. No raw Net/Base/account rows appear in VNĐ account history responses.
- Pricing failures on pending refresh retain reserve and expose an Admin-action error; genuine SQLite technical errors roll back. Financial posting cannot be silently lost because a pending price is unavailable.

## UPS resolver, not operational Purchase

Exact-decimal pure UPS resolver uses final country zones and raw account/sub-service/tier cells, approved rounding and full formula per Lot. It excludes explicit unavailable o cells, errors on missing intervals, does not extrapolate above 300kg, and compares full Net with SDS→VTT→JD tie priority. Blank source Net Discount/Shipment Surcharge variables mean zero; SDS weight surcharge discount is 50%.
CN/China requires explicit SOUTH/OTHER to distinguish zone 10/3; literal source China South/SO is preserved without ISO reassignment.
This resolver is tested but **not connected to published UPS account versions, operational Purchase, account exports or split-Lot editing**. VNĐ UPS creation remains blocked. It must not bypass the existing UPS Review/Publish and pending-account rules.

## Limits and remaining work

- ePacket outside US must currently select its approved EU route; automatic routing from a US selection to EU is not delivered. Route config markets require explicit country codes. No fuzzy geography aliasing.
- Operational import is the specific final workbook, not a general arbitrary XLSX layout importer. Ordinary published price documents from other sources remain gated out of this operational slice.
- Published Net/account change modes and separate Estimated Net refresh need further acceptance beyond this final-source path. Latest NET drafts do not replace published selling.
- Full dedicated browser role UAT remains open. New source import/config UI requires root Admin, matching existing V1 configuration authority; broader Admin/BOD configuration RBAC remains a V1 gap.
- Shipping Edit with retained reserve, Cancel & Duplicate, Client Add-on, VNĐ Statements/Debt/reporting/claims/supplier-account cutover remain incomplete. Existing Order Financial Correction is already delivered in Feature 33; it does not reopen fulfillment.
- Data files must be included in any eventual deployment package; production/deployment acceptance was not performed.

## Code and verification

source: service-v1-source.ts; Order quote/import: service-v1-order-quote.ts; publication exact fields: service-v1-pricing.ts; operational adapter: vnd-operational.ts and schema; source API and service pricing UI.
Tests: verify-final-source.cjs (real workbook, synthetic shipments), verify-vnd-auto.cjs (disposable DB), existing verify-vnd-operations.cjs and full verify-all.cjs.
[Evidence](../../artifacts/service-v1-final-source-2026-11-16/VERIFICATION.md) records actual gate outcomes and commits.
