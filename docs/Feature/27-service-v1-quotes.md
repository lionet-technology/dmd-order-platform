## Rate USD–VND — 16/11/2026
[Current versioned Rate and ePacket USD-source conversion](29-service-v1-fx.md): Admin save/confirm, new VND quote snapshots, immutable history. Operational VND Purchase/ledger cutover remains incomplete.

# Service V1 published-row quotes — partial backend
14/11/2026. Source: service-v1-quote.ts, service-v1-schema.ts, /api/service-v1/quotes. Regression: verify-service-v1-quotes.cjs.

CURRENT: POST accepts explicit route_id, client_id, rate_key and request_key. It selects only the latest published selling proposal tied to the current immutable configuration, and the Client's enabled service/sub-service setting. Sales = published Retail × (1 − discount_percent/100), retaining fractional VND. Pending Proposal or newer Net does not replace the published selling document. Exact sub-service setting overrides service-wide setting.

This is a selected-row preview, not an automatic Draft quote. The endpoint does not infer a weight/zone key, compute shipping surcharges, promise market coverage or reserve funds. Response explicitly returns operational_cutover=false and purchase_eligible=false. Operational Draft → Quote → Purchase with VND ledger remains incomplete.

Active Admin, the Client itself and its assigned Sales may create/read quotes. Other Clients, unassigned Sales and other roles cannot read them. All responses use an allowlist containing sale amount and version references; no Net/Base/Retail, internal source rows or Client setting bodies. GET returns the newest 100 scoped quotes.

Each accepted quote stores immutable configuration/price/source-Net IDs, price row, full discount setting snapshot, actor/time and fingerprint. SQL triggers reject update/delete. Identical actor/request/payload replay returns the original snapshot after later price/discount changes; conflicting reuse rejects. New quote creation checks active route, lifecycle/Hold, current config, enabled Client setting, numeric discount and amount. History is retained after configuration edits.

No Balance/Credit/Debt/Reserve/Charge/Statement writes. Existing USD Purchase and snapshots are unchanged. This is not completion of VND financial cutover, whole-flow history or UI/UAT. Workbook parsing, server order→rate mapping, surcharge totals, market validation, customer consent to operational quote and VND ledger integration remain required when rate inputs return.
