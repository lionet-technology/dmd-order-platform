## Final-source automatic Purchase increment — 17/11/2026
[Feature 34](34-service-v1-final-source-purchase.md) extends new-account VNĐ Purchase to ePacket Standard/Eco/EU and Yun via final Excel (2), existing Review/Publish and exact Reserve/FIFO/Charge. It supersedes earlier blanket statements that only Chuyên tuyến is admitted. UPS has a source resolver only; operational UPS, auto EU routing, Shipping Edit, Duplicate, Add-on and financial reporting cutover remain pending. [Source index](SERVICE-V1-SOURCE-INDEX.md) closes source identity and fixed-VND ePacket fee/FX relation only.

## Rate USD–VND — 16/11/2026
[Current versioned Rate and ePacket USD-source conversion](29-service-v1-fx.md): Admin save/confirm, new VND quote snapshots, immutable history. Operational VND Purchase/ledger cutover remains incomplete.

# Service V1 pricing workspace — CURRENT backend increment 14/11/2026

Staged VND documents and API /api/service-v1/pricing; **connected to selected-row V1 quote previews only; not operational Draft/Purchase or the USD ledger**. Published in this workspace means reviewed V1 configuration, not operational cutover.

Net draft explicitly references an Excel filename and keyed Net VND rows. A filename is provenance metadata, not proof of verified Excel contents; actual file parser/import and Owner acceptance remain OPEN. No bundled actual rates. Test inputs are named TEST-FIXTURE-NOT-ACTUAL-RATES.xlsx.

Owner/root ADMIN creates Net draft, reviews it, then publishes. Selling Proposal references published Net and current service configuration, with NetCostMarkup and BaseCostMarkup as non-negative decimal ratios. Base=Net×(1+mN), Retail=Base×(1+mB). Outputs are **unrounded preview**; Owner confirmed no money rounding on 14/11; operational posting remains OPEN. No automatic discount/charge is introduced here.

Both markup inputs are reviewed/published together in one immutable proposal as an implementation increment; independent policy publication/effective scheduling is still OPEN. Existing selling V1 survives Net V2 or Proposal V2 changes until explicit review/publish. Publish uses expected current document ID, current config and Net guards. Proposal from old Net cannot newly publish. Purchased snapshots are untouched.

All documents/events immutable; immediate transactions, request fingerprint replay, optimistic published-version guards, actor/time/source retained. Owner API only, no Sales/Client/regular Admin transport Net access. This uses the existing restricted pricing permission until detailed roles are decided.

Configuration history now blocks route identity rename; create a new route instead. Route lifecycle/Hold gate still applies. This affects /api/service-routes; docs Feature 12 and 24 cover it.

Source: service-v1-pricing.ts, service-v1-schema.ts, API service-v1/pricing.
Test: verify-service-v1-pricing.cjs covers sequential oracle, Net/selling independence, stale source/publish, retries, rollback, SQL immutability, permissions and no operational activation/money movement. Two independent SQLite writer processes race to publish: exactly one succeeds and the stale rival rejects. Configuration and legacy route tests run as regression.

## Owner clarification 14/11
Money is not rounded at Base/Retail/Sales or totals. Workspace metadata now reports rounding=NONE. Fractional-value regression covers values beyond two decimal places; the operational USD ledger/cents helpers are unchanged pending the separate VNĐ cutover.
