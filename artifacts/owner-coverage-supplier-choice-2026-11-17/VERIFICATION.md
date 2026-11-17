# Owner coverage and Supplier manual refund choice — 17/11/2026
Canonical workspace `/Users/quan/Developer/report`; starting local/live remote `5f569e0816de9dc110905c08df7b5b3be22cafff`. Only owner AGENTS.md/Codex changes existed. Decision documentation committed before code: `8a3ad8e`.

## Owner decisions applied
- ePacket Standard/Eco workbook Net includes **mid-mile + last-mile**. Coverage OPEN is closed. Component detail/accounting is deferred to a later phase, not required for V1. No extra assumed mid-mile cost is added. Workbook unchanged, SHA256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.
- Report labels `WORKBOOK_INCLUSIVE_MID_LAST_MILE` and `component_breakdown=DEFERRED` describe the workbook estimate scope. The UI explicitly names workbook Net coverage. Missing Actual remains MISSING_ACTUAL; approved documentary total remains APPROVED_TOTAL. This change does not make estimates actual or auto-finalize GP, change commission formula, rewrite quotes/Statements, or post money.
- Supplier policies and carrier proof must be set up per service/route. Manual follow-up with Admin choosing percentage/amount is approved; no guessed default/rule or automatic carrier void. Concrete route values and real evidence remain configuration/data tasks, not renewed questions about this approved approach.

## Implemented manual choice
Active Admin may attach an immutable VNĐ choice to the existing follow-up event: AMOUNT with nonnegative amount, or PERCENT with explicit nonnegative Supplier-cost basis and 0..100 percentage. Exact decimal arithmetic; no inferred basis from Client revenue. Evidence and follow-up note are required; expected_event_id/request_key retain CAS/retry semantics. Choice fields participate in replay conflict checks. Event/choice/audit are atomic; failed audit leaves neither event nor choice. History shows the amount, basis/percentage, evidence, actor/time. Finance/BOD can read choices/update status but cannot author the Admin choice. Legacy USD cannot use this VNĐ input.

The panel is accessible in `/vnd` to existing operational Supplier roles. A choice records follow-up only: no Supplier receivable/payable/Bank receipt, no cost reversal, no Client charge/refund and no change to status semantics of RESOLVED. Financial execution still needs its explicit reconciled workflow; inactive Tracking cancellation follow-up is not silently converted into a new active-Tracking Claim.

## Verification
- Targeted Supplier cancellation suite: **47 assertions PASS**, including exact 12.5% × 100.123456 = 12.515432, direct amount, Admin-only, no basis/proof/invalid percentage/legacy USD rejection, stale/retry conflict, immutable choices, injected audit rollback and no Client/Supplier money.
- Targeted VNĐ Supplier suite: **37 assertions PASS**, covering Standard and Eco inclusive coverage while missing Actual stays missing and actual_gp remains unfinalized; existing actual/payable invariants retained.
- Actual Chrome production build: **52 checks / five roles PASS**, owned disposable DB/localhost; Admin percentage/evidence via UI, correct exact history, no Client posting, Finance cannot author choice; existing Supplier receivables, notifications, Claims, permissions, Statement/report and mobile checks retained. No page errors. Admin follow-up screenshot visually inspected.
- Build/typecheck/lint PASS, lint zero warnings. Build/tests use disposable databases, not operator DB. Final full regression: **64 suites PASS** (test.log and check-status.txt).
- Terminal whitespace in build/typecheck/lint logs normalized for a clean diff; output meanings unchanged. Tested source checksums in source-sha256.txt. Full-change diff check passes before commit.

## Remaining V1 scope
Supplementary Supplier and Client surcharge/tax imports, Supplier period close/late adjustments, full GP/commission reconciliation and real-document pilot/target backup rehearsal remain incomplete. Component breakdown is DEFERRED, not OPEN. Supplier per-service policy values/proof still need setup; the manual follow-up method itself is approved. No new question blocks those independent slices.

No Jenkins/production/carrier call, real money transfer, operator DB reset, AGENTS.md/Codex or workbook mutation. Earlier verification reports remain historical; Feature 39 and current source/decision docs supersede their old OPEN coverage statements.
