# UPS V1 calculation and confirmed globals — CURRENT backend increment 14/11/2026

Pure VND preview calculator + persisted global SAVE/CONFIRM. No operational UPS adapter, actual workbook importer, account publication UI or Purchase integration yet.

ups-v1-calculator.ts supports VTT/SDS/JD, explicit account zone, Min/Max inclusivity and FIXED/PER_KG rates. No actual prices or zone mappings are included. Overlapping bands/missing rates reject; no fallback zero. Optimizer computes full transportation/discount/shipment/weight/Fuel/VAT/Broker/Customs before ranking. Equal costs reject until a tie-break is approved. All supplied eligible accounts must calculate; caller must not silently omit an eligible account with missing data.

Per-kg only multiplies transportation. Net formula follows the Owner source in the V1 specification. Inputs explicitly state discounts and global variables; no defaults for missing values. Results are unrounded previews and do not post money.

Lot billable calculator rounds actual/dimensional per carton, takes max each, sums carton billable then rounds Lot. Divisor, carton step, threshold and Lot steps are mandatory policy inputs. Test values 5000/0.5/20/1 are **synthetic test policy**, not activated DMD requirements. Owner continuation approved Express/Saver carton/Lot ≤20kg steps 0.5kg, Expedited 1kg, all Lots >20kg 1kg; upsSubServiceRounding returns these steps with an explicit verified divisor. Broker destination scope remains OPEN; confirmed Global inputs are Broker 3% of Td and Customs 10,000 VND/kg (no silent seed). Owner confirmed no money rounding and one Shipment Surcharge per Lot on 14/11.

UPS globals API /api/service-v1/ups-globals is root Owner only, matching restricted pricing access until V1 RBAC is decided. SAVE stores immutable draft; CONFIRM requires confirmed=true and expected previous confirmed version. Fresh staged calculations use only the newest confirmed version. Pending globals do not apply. Request fingerprints support replay; stale confirmations reject; actor/time are retained. Confirmation cannot publish Net/account/selling documents or reprice purchased snapshots. This is staged auto-apply, not operational UPS auto-apply.

No price/zone data from images/PDF or public UPS US surcharges was imported. Actual tables require Owner Excel before rate acceptance; workbook parsing/import remains missing. Account staged Review/Publish backend is documented below.

## Approved rate boundaries — continuation 14/11
validateUpsRates now rejects FIXED ranges above 20kg and PER_KG ranges below 21kg, noninteger PER_KG bounds or intervals crossing 44/45, 70/71, 99/100 boundaries. It retains explicit Min/Max inclusivity instead of guessing Excel tiers; single-weight rows require both inclusive. Lookup rejects noninteger billable Lot weight above 20kg and unit mismatch. Stored historical documents are immutable; incompatible previously staged TEST documents need a new reviewed/published version, no in-place rewrite.

epacket-v1-policy.ts separately classifies longest side >55/>75cm and US non-cont AK HI PR GU VI AS MP AA AE AP; surcharge remains null, price_ready=false. No USD conversion or amount supplied by the code. Test boundary coverage is in verify-ups-v1-core.cjs.

## Staged account Review/Publish increment
/api/service-v1/ups-accounts and ups-v1-accounts.ts add immutable account drafts tied to current UPS route/config, Excel-source metadata, explicit rate bands/zones and discounts. Root Owner saves → reviews → publishes using expected previous account version. Request replay, stale source/publication, route lifecycle/Hold and SQL immutability apply. Filename metadata is not proof of a verified workbook; actual Excel acceptance remains required.

Preview calculates every published account supplied with an explicit verified zone. Omission of a published account rejects, as does a missing rate. It combines published accounts only with confirmed globals and returns both version IDs. Global confirmation cannot promote pending account edits; account publication cannot publish selling-price proposals. No destination→zone inference, operational quote/Purchase activation or ledger posting occurs.

Test verify-ups-v1-accounts.cjs covers draft/review/publish, retries, stale publish, global/account isolation, all-account coverage, source validation, SQL immutability, Hold and scoped access.

Test: verify-ups-v1-core.cjs — independent formula oracle, FIXED/PER_KG and boundary tests, overlap/gap rejection, rank reversal after surcharge, per-carton rounding, global save/confirm/retry/stale/permissions and zero ledger effects.

## Lot / Order rule — CONFIRMED and CURRENT 14/11
Each Lot is one UPS purchase shipment. upsAccountNet is a single-Lot calculation; upsOrderNet sums separately rated Lots, applying Shipment Surcharge once for each Lot, without multiplying by carton count or charging it once for the whole DMD Order. It rejects duplicate/blank Lot IDs to prevent accidental double counting. Fractional VNĐ is retained; weight rounding remains separate. This pure aggregation is not yet operational Purchase integration.
