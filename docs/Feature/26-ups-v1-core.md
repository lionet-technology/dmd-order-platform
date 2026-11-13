# UPS V1 calculation and confirmed globals — CURRENT backend increment 14/11/2026

Pure VND preview calculator + persisted global SAVE/CONFIRM. No operational UPS adapter, rate import, account publication UI or Purchase integration yet.

ups-v1-calculator.ts supports VTT/SDS/JD, explicit account zone, Min/Max inclusivity and FIXED/PER_KG rates. No actual prices or zone mappings are included. Overlapping bands/missing rates reject; no fallback zero. Optimizer computes full transportation/discount/shipment/weight/Fuel/VAT/Broker/Customs before ranking. Equal costs reject until a tie-break is approved. All supplied eligible accounts must calculate; caller must not silently omit an eligible account with missing data.

Per-kg only multiplies transportation. Net formula follows the Owner source in the V1 specification. Inputs explicitly state discounts and global variables; no defaults for missing values. Results are unrounded previews and do not post money.

Lot billable calculator rounds actual/dimensional per carton, takes max each, sums carton billable then rounds Lot. Divisor, carton step, threshold and Lot steps are mandatory policy inputs. Test values 5000/0.5/20/1 are **synthetic test policy**, not activated DMD requirements. Final Sub-Service mapping, shipment surcharge scope, Broker destination scope and money rounding remain OPEN.

UPS globals API /api/service-v1/ups-globals is root Owner only, matching restricted pricing access until V1 RBAC is decided. SAVE stores immutable draft; CONFIRM requires confirmed=true and expected previous confirmed version. Fresh staged calculations use only the newest confirmed version. Pending globals do not apply. Request fingerprints support replay; stale confirmations reject; actor/time are retained. Confirmation cannot publish Net/account/selling documents or reprice purchased snapshots. This is staged auto-apply, not operational UPS auto-apply.

No price/zone data from images/PDF or public UPS US surcharges was imported. Actual tables require Owner Excel before rate acceptance; account Review/Publish and import remain missing.

Test: verify-ups-v1-core.cjs — independent formula oracle, FIXED/PER_KG and boundary tests, overlap/gap rejection, rank reversal after surcharge, per-carton rounding, global save/confirm/retry/stale/permissions and zero ledger effects.
