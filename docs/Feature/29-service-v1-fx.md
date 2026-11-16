## Final-source automatic Purchase increment — 17/11/2026
[Feature 34](34-service-v1-final-source-purchase.md) extends new-account VNĐ Purchase to ePacket Standard/Eco/EU and Yun via final Excel (2), existing Review/Publish and exact Reserve/FIFO/Charge. It supersedes earlier blanket statements that only Chuyên tuyến is admitted. UPS has a source resolver only; operational UPS, auto EU routing, Shipping Edit, Duplicate, Add-on and financial reporting cutover remain pending. [Source index](SERVICE-V1-SOURCE-INDEX.md) closes source identity and fixed-VND ePacket fee/FX relation only.

# Service V1 — versioned Rate USD–VND
Reviewed 16/11/2026. CURRENT increment; not an operational VND financial cutover.

## Confirmed behavior
All operational prices target VND. ePacket Net source can be USD: Net VND = Net USD × confirmed Rate; Base = Net VND × (1 + Net markup); Retail = Base × (1 + Base markup); Sales = Retail × (1 − Client discount). Retain fractional VND without monetary rounding. Admin explicitly saves and confirms Rate; no default numeric value.

## Delivered
`service-v1-fx.ts` and `/api/service-v1/fx` provide SAVE then CONFIRM. Any active ADMIN, including non-root, may read/save/confirm. Other roles and anonymous callers are denied. UI is in the Admin service configuration workspace. Rate history is immutable with actor/time, unique actor/payload request replay, explicit confirmation and expected-current version guard. A pending save does not affect quotes. Missing confirmed Rate rejects USD-source Net.

`CREATE_NET` on `/api/service-v1/pricing` accepts source_currency=USD and rows with key/net_usd for EPACKET only. Mixed USD/VND row fields reject. Existing VND-source API and request fingerprints remain supported. The existing root pricing permission remains in force. Source workbook name is metadata, not verified import evidence.

New USD-source Net/Proposal documents store source USD, converted VND and Rate ID/value. New selected-row quotes use the latest confirmed Rate with published markup ratios and current Client discount; Rate confirmation is the explicit authorization to apply the conversion to new quotes. Original published documents and old quote snapshots remain immutable. Old request replay returns the original snapshot even after Rate/discount changes. Effective converted Net/Base/Retail and Rate ID/value are stored privately in each quote snapshot. Public quote output exposes Sales and version IDs, not internal Net/Base/Retail or Rate values.

## Boundaries
No Reserve, Charge, Balance, Statement or supplier purchase is posted by Rate or quote actions. `purchase_eligible=false` and `operational_cutover=false` remain true descriptions of selected-row preview. Mapping a shipping Order to verified workbook tier/zone and operational VND ledger integration are still required. Ordinary cancellation is unchanged; the approved 100% Cancel & Duplicate action remains pending integration.

Read-only inspection of non-backup local databases dmd-finance-ops.db, dmd.sqlite, codex-review-demo.db, review-demo.db and dmd-uat-demo.db found no V1 price/account tables. No actual imported V1 rate payload was recovered there. No operator DB was loaded via application initialization or migrated/reset. Owner says Work processed Excel; requested the handoff path/chat/commit to reconcile verified rates and keys before operational adapter work. This is a source-data blocker, not a request to reapprove the confirmed currency or refund rules.

## Verification
`scripts/verify-service-v1-fx.cjs`: API/domain Admin scope, non-root Admin, invalid Rate, absent/unconfirmed Rate, concurrent-stale version, idempotent exact/conflicting retry, USD conversion, sequential markup/discount, fractional VND, new-rate quotes, immutable historical replay, SQL immutability and no ledger/reserve side effects. Added to verify-all. Full results: [verification](../../artifacts/order-edit-v1-2026-11-16/VERIFICATION.md). All inputs are synthetic, not actual rate cards. Browser click-through not yet performed.
