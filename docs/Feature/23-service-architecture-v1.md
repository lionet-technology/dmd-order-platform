# Feature 23 — Service Architecture V1

**Status:** PARTIAL/MISSING implementation; CONFIRMED requirements không đồng nghĩa delivered.
**Audit baseline:** 2302d06, main, 14/11/2026.
[Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md) · [Specification](DMD_Order_Platform_Service_Architecture_V1_Specification.md).
CONFIRMED = Owner source; CURRENT = code-audited; PROPOSED/OPEN giữ riêng. Không nhãn approved tổng quát.

## CONFIRMED — Owner continuation 14/11/2026 (supersedes older OPEN labels)
Source: direct Owner request in the current continuation of chat 6ad35267-1ad8-83ec-a691-9d80c58281df.
- UPS Express/Saver: round each carton actual/dimensional up to 0.5kg, take the carton maximum, sum cartons; Lot ≤20kg rounds up to 0.5kg. Expedited rounds carton/Lot up to 1kg. Every Lot >20kg rounds up to 1kg. Dimensional divisor remains an explicit input; no new divisor decision is inferred.
- UPS Rate Card: FIXED ≤20kg; PER_KG ≥21kg, bands 21–44, 45–70, 71–99, 100+. Unit must match billable weight; do not multiply the whole NetCost by weight. Exact Excel tiers/zone mapping and missing/overlap handling require source validation; optimizer ties still reject.
- Broker = 3% of discounted UPS transportation Net (Td); Customs = 10,000 VND/kg. Both remain Global variables under explicit save/confirm/versioning, not per-account constants or silent seeds. Destination scope beyond the existing US formula remains OPEN.
- ePacket oversize uses longest side >55cm and >75cm (strict comparisons); non-cont: AK HI PR GU VI AS MP AA AE AP. Actual VND surcharge amounts/approved USD conversion and inclusive supplier components remain OPEN. No amount is inferred.
- UPS Shipment Surcharge once per Lot.
- Owner follow-up: complete work independent of actual rate cards first; Excel/rate-dependent work deferred for later input.

## CURRENT vs TARGET V1 và gaps
| Module | CURRENT code/source | V1 gap |
|---|---|---|
| Configuration | service-routes/route.ts, route-lifecycle.ts, carton-policy.ts; full identity, lifecycle, segmentation/cancellation, Client settings | Unified staged V1 service capability/config, explicit VNĐ rollout readiness |
| Pricing | route-pricing.ts: independent Base, USD-only, immutable versions/activation | Sequential Net→Base→Retail, two markup review, Proposal V2 while V1 published |
| UPS | manual-route-price.ts; unpriced request→Admin USD total | Account VTT/SDS/JD, zone/rates, full Net optimizer, sub-service rounding/global confirm |
| ePacket | epacket-pricing.ts Standard/Eco DMD US USD, 1 carton ≤10kg | VNĐ, Excel Net inputs, final oversize/non-cont and component scope |
| Fulfillment | credit.ts, order-operations.ts, order-shipments.ts, warehouse/manifest/templates | Integrate V1 account/price snapshot; nối giá V1/Lot vào xử lý và bàn giao Supplier; chi tiết Sheet/Zalo/PDF theo Supplier còn OPEN |
| Add-on | supplier-account.ts BUY/SELL only | Client revenue locked, cost revisions, scoped Sales exception |
| Adjustment | finance.ts:addLedgerEntry moneyCommand, no purchase gate | Explicit tests exceeding limit without Revenue/GP change, Add-on relation |
| Currency | cents/money helpers, ledger USD without per-entry currency | Verified demo reset/migration rehearsal; never mix VND into USD operational ledger |

## CONFIRMED target
ePacket VNĐ; demo reset/migrate allowed only after target verification. Sequential markups and Net/Account changes Review & Publish; pending cannot change published. Globals apply after confirmation without account pending leakage. Add-on Revenue locked, Cost/Supplier/Note editable with scoped Sales cost permission. Adjustment may exceed limit, cannot change Revenue/GP or bypass Purchase.
Nguồn trực tiếp và công thức nằm trong Approved Decisions/Specification. Tỷ giá audit cũ không phải yêu cầu phải migrate demo.

## Acceptance matrix
| Module | Required regression |
|---|---|
| Configuration | identity/history, lifecycle/Hold, Client scope, invalid payload rollback, stale/concurrent edits, restart |
| Pricing | sequential formula, save/review no price change, net independent from selling, published immutable, stale publish/retry, permission/privacy |
| UPS | rank reversal after surcharges, FIXED/PER_KG, missing zone/rate rejection, carton before Lot rounding, global confirm only, account pending isolation |
| Fulfillment | reserve→label charge once, retry/rollback, Hold/Client/credit/debt gates, Client consent, purchased snapshot unchanged |
| Add-on | immutable revenue, pending cost, cost/supplier/note revisions, stale writer, linked debit once, no balance change on cost revision, period reporting |
| Financial/RBAC | Adjustment exceeds limit but Purchase blocked, no Revenue/GP mutation, anonymous/other Client denied, Sales exception scoped to Add-on only, export/history privacy |
| Data | disposable/copy target proof, FK/integrity, totals before-after, retry/reset isolation, no production access |

## Execution and dependencies
Configuration → Pricing/Publish → UPS → Fulfillment → Add-on/ledger. Tests + docs in each behavior commit; no Jenkins.
Excel needed before actual rate import/price acceptance: Net ePacket VNĐ and UPS account/service/zone Min/Max/unit/discount/surcharge inputs. No image/PDF number guessing, no fake actual rate.
OPEN rules: chi tiết dòng Excel Min/Max, rate overlap/tie-break; ePacket surcharge amounts/FX/component inclusions. Rounding, rate-unit bands, oversize thresholds/non-cont list đã CONFIRMED ở trên. Công việc tiếp theo: tích hợp xử lý Order/bàn giao Supplier. Do independent scaffolding first.

## Continuation increment 14/11/2026
CURRENT: approved UPS rounding helper; rate validation enforces FIXED ≤20kg, PER_KG ≥21kg and no cross-band PER_KG intervals; equal Min/Max supported only with both bounds inclusive. Optimizer ties still fail. No guessed zone/price. ePacket V1 classification implements strict longest-side >55/>75cm and confirmed non-cont list, returning surcharge_vnd=null/price_ready=false until VND amounts supplied. Legacy USD adapter untouched.

[Selected-row quotes](27-service-v1-quotes.md) connect current configuration + published selling row + Client Discount into immutable VND quote/history with Client/assigned Sales/Admin scope and redacted responses. Draft automatic mapping, Purchase/Reserve/Charge/ledger/Statement VND cutover and full-flow history are still missing. This is a partial backend increment, no UI/UAT or production activation.

Owner deferred actual rate-card dependent work. Next: receive Excel and VND surcharge values, validate mappings/coverage, then integrate operational quote consent and money flow with isolated currency rehearsal. No Jenkins.

## CURRENT increment 14/11/2026
[Configuration backend](24-service-v1-configuration.md): immutable staged VND config, Owner API, stale/retry/rollback checks; operational activation and UI still missing.

Account UPS staged save/review/publish đã được bổ sung vào Feature 26; preview dùng published account + confirmed globals, chặn bỏ sót account và không promote pending account khi confirm global. Chưa có workbook parser/destination zone resolver/operational integration.

[Pricing staged backend](25-service-v1-pricing.md) và [UPS core/globals](26-ups-v1-core.md) đã có source/tests; chưa operational integration, currency cutover, rate acceptance, Fulfillment với giá V1 hay Client Add-on. Giữ các gap tương ứng ở bảng trên.

## Verification
[Final evidence at source 365e40e](../../artifacts/service-v1-2026-11-14/VERIFICATION.md): 49 domain suites, full lint, typecheck and isolated build PASS. Backend preparation only; no operational VNĐ/cutover or production acceptance.
Source review is not browser/UAT/production acceptance. Baseline domain run and subsequent implementation evidence: artifacts/service-v1-2026-11-14/. Each report must name source commit, runtime and exact limits; do not infer all suites pass from partial output.
Historical audit preserved at [archive](archive/FEATURE-23-AUDIT-2026-11-13.md).

## Owner clarification — 14/11/2026
CONFIRMED: tiền VNĐ giữ số lẻ, không monetary rounding; UPS Shipment Surcharge một lần mỗi Lot; Fulfillment là xử lý Order/bàn giao. Ba nội dung này không còn là blocker yêu cầu. CURRENT: pure upsOrderNet aggregate, no-rounding metadata và regression được cập nhật; chưa operational VNĐ Purchase/ledger. Catalogue phí kho riêng không thuộc phạm vi Fulfillment V1 đã chốt.
