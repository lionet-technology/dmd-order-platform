# Feature 23 — Service Architecture V1

**Status:** PARTIAL/MISSING implementation; CONFIRMED requirements không đồng nghĩa delivered.
**Audit baseline:** 2302d06, main, 14/11/2026.
[Approved Decisions](SERVICE-V1-APPROVED-DECISIONS.md) · [Specification](DMD_Order_Platform_Service_Architecture_V1_Specification.md).
CONFIRMED = Owner source; CURRENT = code-audited; PROPOSED/OPEN giữ riêng. Không nhãn approved tổng quát.

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
OPEN rules: Min/Max boundaries, rate overlap/tie-break; final rounding mapping; ePacket surcharge thresholds/list/component inclusions. Công việc tiếp theo: tích hợp xử lý Order/bàn giao Supplier. Do independent scaffolding first.

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
