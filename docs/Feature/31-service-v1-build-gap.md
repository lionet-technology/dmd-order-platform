# Service V1 — source reconciliation and build gap
Reviewed 16/11/2026 at HEAD 7491a726d953cdf6f6784ef76e604ced729db961, main. Fetch origin succeeded; HEAD equals origin/main. Existing AGENTS.md modification and untracked Codex/ are unrelated and preserved.
Status: PARTIAL. No operational VND cutover or production acceptance.

## Primary source
[Full Owner handoff](DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md), read in full from the attached Downloads file; SHA256 8f3f3b0ec997927b686ec822de2741f8582ea57483fa37ffe8b3b588d317ddf7.
The attachment is requirements data explicitly selected by the Owner. It does not certify implementation. Latest direct Owner request + handoff supersede conflicting earlier documentation. Historical sections remain dated evidence, not concurrent rules.

## APPROVED versus implemented at audited HEAD
| Area | APPROVED target | Implementation evidence / gap |
|---|---|---|
| Pricing | Sequential Net→Base→Retail, two modes, published snapshot, globals auto apply | service-v1-pricing.ts/config.ts/fx.ts/quote.ts and ups-v1-* provide staged backend and selected-row quotes. createServiceV1Quote explicitly returns purchase_eligible=false. No server Order weight/zone resolver or operational VND ledger integration. |
| Purchase | VND, Awaiting Funds, FIFO, consent/override; original reserve retained pending consent, replacement atomic | route-pricing.ts still active USD path. Insufficient funds throws; purchaseService returns early on existing snapshot. No persisted new pending/consent command state. credit.ts is cents-based; cannot relabel it VND or silently round fractional VND. |
| Edit | Separate shipping edit, manual Selling Price offer, Tracking/Label | order-amendment.ts locks any issuance but immediately clears/replaces reserve and repurchases. Approved retained-reserve consent and independent correction/manual offer remain missing. |
| Cancellation | Configured per Service/Sub-Service/Supplier route, Admin support 100%, deny after shipping | order-cancellation.ts ignores existing readCancellationRules and hardcodes issued=90/unissued=100 globally. Must fix before extending replacement. Supplier queue implemented in supplier-cancellation.ts. |
| Cancel & Duplicate | Admin only; source cancel under policy, new linked Purchasing request; pending quote/funds does not undo valid cancellation | Not implemented. Older special unconditional 100% combined-action rule is superseded by current handoff policy plus optional Admin support. BOD cancellation inheritance unresolved against current explicit ADMIN-only role boundary; do not silently widen. |
| Financial correction / Add-on | Delta ledger/history, current revenue, over-limit allowed, no automatic Debt; cost edit does not move wallet | Client Add-on and Order correction not implemented. Supplier BUY/SELL is a distinct feature. Existing adjustment moneyCommand must remain independent from revenue. |
| Refund | Cancellation current collected Order revenue; shipping claim separately approved/executed bank/balance | order-refunds.ts sums charge/fees and prior refunds; future corrections must join signed revenue basis. refunds.ts contains separate Claim pool/execution workflow; do not reuse cancellation percentage. |
| Supplier | Follow-up independent from void/cost/refund; approved actual payable, duplicate review | Queue exists. Supplier accounting/reconciliation features exist; require VND/correction integration checks. Do not infer carrier void or payable reversal. |
| RBAC/reporting | Server-side Sales/Client scope, narrow Add-on cost exception, BOD reports | Existing role/scope tests; every new endpoint/export/history needs coverage. Reporting operational USD remains a cutover dependency. |
| UPS / ePacket | UPS divisor 5000, (min,max], formula and priority SDS→VTT→JD; FX confirmed; exact handoff thresholds | Staged helpers exist, older docs still say tie rejects/divisor OPEN. Source rates and country/zone mapping must be validated before activation. |
| Data / real rates | Verify workbook provenance, synthetic VND reset/rehearsal only | Read-only workbook found at /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx (60966 bytes). It is not the exact named (1)(1) file; equivalence/import is not yet verified. No guessed Excel numbers. |

## Conflicts resolved as requirements (not code claims)
- No global 90/100 cancellation matrix. Unknown route/stage policy fails closed; known ePacket Standard/Eco US baseline is reference for explicit configuration, not an implicit runtime fallback. ePacket EU/Yun/UPS issued refund remains dependent on confirmed Supplier policy.
- Edit Order cannot contain manual selling offer. Any Tracking OR Label locks shipping edits; separate Selling correction remains permitted after charge.
- Add-on revenue lock is superseded by explicit delta correction; financial posting may exceed Credit Limit without automatic Debt.
- UPS divisor, rate interval and tie priority are now approved, not OPEN. Exact source rows/zone provenance remain CHECK.
- Global FX applies new Net/Base/Retail even in Base Cost Markup mode; snapshots stay immutable.
- Combined replacement uses current cancellation policy, with explicit Admin 100% support where requested; no unconditional special refund.

## Execution order and gates
1. Commit this source/index reconciliation before behavior changes.
2. Restore per-route cancellation policy with regression for two services at the same stage, missing policy, support, shipment denial, reserve-only, retry, rollback and Supplier queue.
3. Build persisted Purchase/consent states and VND quote resolver and monetary storage together on disposable target; integrate FIFO and correction. No USD/VND mixed operational ledger.
4. Separate edit/offer/issuance, atomic replacement, Add-on/corrections and reporting, with source-linked append-only history.
5. Validate workbook + zone provenance; UI/role UAT and full suites/typecheck/lint/build on candidate commits.

## Implemented increments after audited baseline
- Ordinary cancellation now uses explicit unique route/stage policy; Admin support, shipment denial, reserve-only/retry/rollback and Supplier independence retained. See Feature 06/30 and tests.
- reservePurchase owns an immediate transaction, idempotent same-amount replay and atomic replacement excluding its own old reserve; original reserve survives failed funds/audit. Legacy USD semantics retained; this is not consent/FIFO/VND delivery.
- UPS calculator now enforces divisor 5000, (min,max] rates and deterministic SDS→VTT→JD ties after full formula. Rate boundary/rounding and account publication regressions updated. Priority UI/import/mapping remain pending.
- No production, carrier API or Jenkins used. No new economic defaults or real rate rows activated.

## OPEN / deferred
Supplier cancellation policy values/void, ePacket fee VND versus FX relation and inclusive components, unverified source rows/zone mapping, manual offer when changing Service. Preserve handoff §10; only block dependent features. Never invent initial FX/Fuel/rates.
No Jenkins, deployment, production access or production reset.
