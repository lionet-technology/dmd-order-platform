# ePacket US pricing and Client service purchase

Routes: ePacket / Standard / DMD and ePacket / Eco / DMD. USD only. Country aliases normalize to US. One carton; chargeable kg is max(actual, dimensions cm cubed / 5000), with no weight rounding before the first configured tier >= weight. Maximum 10 kg. Invalid service eligibility can be saved as Draft and fixed.

## Lifecycle and boundaries

Client enters/pastes rows or uploads CSV/XLSX, previews each row, saves Drafts, selects eligible Drafts and purchases. Invalid drafts retain entered data. Purchase is one SQLite immediate transaction: re-read current data/config, check ownership/service permission/route toggle/country/cartons/weight/Hold/Balance, freeze the quote, create one ORDER charge in USD, and enter PENDING_PURCHASE. Repeated purchase is idempotent. A mixed invalid batch rolls back entirely. Admin can confirm an Ops purchase with the existing credit behavior (Balance check bypassed for Admin). Ops adds external label/tracking. Client never receives template/supplier/internal pricing.

Purchased data and pricing cannot be edited through ordinary order/carton editors. Tracking and cancellation retain their existing workflows. There is no external supplier integration.

Price and markup/surcharge config rows are immutable. Activation is append-only with explicit UTC effective_at and actor metadata. Future activation does not apply early. Drafts use the latest effective activation. Purchased orders contain pricing_version_id, pricing_config_version_id and pricing_snapshot_json, including precise weight/tier, Net/Base/Retail, discount, service sale, surcharges, commission basis and currency. Historical orders remain manual until their route is configured; existing already-purchased orders must not be repriced.

Base = Net × (1 + Base markup / 100), default 6%; Retail = Net × (1 + Retail markup / 100), default 16%; Sale = Retail × (1 − discount / 100). Internal calculations retain JS double precision, never round intermediate prices. Monetary display/final charge uses central nearest-cent rounding. Commission = Sale × 0.001 + max(Sale − Base, 0) × 0.12. Surcharges are excluded from service revenue and both commission terms.

Sales receives service price/discount/charge plus relative Floor/Base/Retail guidance only. Floor = ceil(Net × 1.02 / Base × 100), Base = 100, Retail guidance = ceil(Retail / Base × 100). Net/Base/Retail USD, config markup and snapshot internals are omitted server-side.

## Configure and seed

Route Pricing: download current Net CSV with old values; edit weight/net columns; upload CSV/XLSX creates validated version; activate with markup/surcharge settings and explicit effective time. Remote ZIP input is an exact supplier ZIP list, empty by default. No continental ZIP ranges are invented. Self-purchase toggle is independent of segmentation; segmentation remains optional and OFF on new routes.

Run with Node 20.20.2:
- npm run verify:epacket
- npm run seed:epacket -- --reset

Reset first saves a database backup under .smoke/epacket-before-reset-*.db, clears transactional test data and preserves users, enums, route configs, warehouse routing definitions and templates. It creates 3 Client accounts under epacket.client.a/b/c and epacket.sales, password Demo12345! for newly created test users. Discounts target 105/110/115% of Net on both routes. Dataset: 36 valid orders (24 purchased with USPS-like tracking, 12 drafts) and 8 invalid drafts. Labels are explicitly marked DEMO ONLY.

## XLSX repair regression

Real Manifest template defines AC as #REF!. ExcelJS removes that unusable defined name on load/write while retaining a list validation formula1=AC. The resulting dangling named reference can cause Excel repair. Renderer removes validation rules whose standalone named reference cannot resolve in the loaded workbook; valid inline lists and cell references remain. Original template bytes are unchanged. Purchase regression reopens real generated Purchase/Manifest workbooks in ExcelJS and independently checks ZIP CRC, all XML parsing, relationship targets/IDs, content type targets, style/shared string references and named validations with Python stdlib. Actual Excel popup verification remains an application acceptance check.

## Deferred backlog — not implemented

- Multi-currency/FX settlement in Balance; all versioned charges are USD.
- Supplier reconciliation: oversize may already be included in supplier Net Cost, non-continental currently absent, and tax/extra surcharge feeds arrive later. Do not add snapshot oversize again to a supplier-inclusive net. Versioned order reconciliation currently preserves its frozen charge pending an explicit reconciliation design; legacy routes keep their prior behavior.
- Compliance/Admin violation block.
- Real East/West ZIP evaluator; existing segmentation scaffold retained.
- External Client self-purchase API integrations. A future authenticated integration must call the same atomic purchase domain operation, enforce client ownership and idempotency, return safe pricing DTOs, and fulfill labels asynchronously. Current endpoints are internal session-authenticated UI endpoints.
