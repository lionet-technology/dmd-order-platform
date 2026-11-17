# VNĐ Supplier receivables / Claim notifications — 17/11/2026
Canonical workspace: `/Users/quan/Developer/report`. **V1 PARTIAL; no pilot/production acceptance.**

## Starting evidence
- Local and live origin/main both `20631973dcfccaf0de337b55c3bd86997230592b`; only pre-existing owner AGENTS.md and untracked Codex/ present.
- Read prior `artifacts/vnd-claims-supplier-2026-11-17/VERIFICATION.md`, Feature contract/Approved Decisions/V1 Handoff, Supplier Account/correction rules and source index before code. Documentation boundary commit `d7506cc` precedes implementation.
- Opened workbook read-only via ExcelJS: ePacket 75 rows/15 columns, Yun Express 41/12, UPS 1008/40. ePacket D72–D75 source strings: 26000 VNĐ/USD; 135000, 285000, 405000 VNĐ/order. Inclusive component coverage is not supplied by those values. Final SHA256 remains `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

## Delivered
- Separate exact VNĐ Supplier receivable journal. Finance/BOD create claims from Supplier-scoped VNĐ Lots with ACTIVE Tracking, immutable Tracking source snapshot and one Claim per Lot. Approval capped at requested creates receivable only. Partial Bank receipts reduce receivable only; explicit Offset reduces receivable and positive payable (or increases Supplier credit). No Client/Order/revenue/GP change.
- Append-only decision correction with expected decision ID; cannot reduce below net settlements. Full settlement reversal restores receivable, and restores payable only for Offset. Zero/reopen with proof; original evidence/reference stays consumed. Actor/key/payload retries do not repost; shared reference checks across this VNĐ claim/payment/adjustment journal and serialized outstanding caps. Legacy USD claims/openings are not migrated.
- Durable scoped Client/assigned Sales in-app notifications for Claim decisions and actual refund/recovery events. Recipient-specific immutable acknowledgements, current assignment/active actor checks; historical reassignment does not grant new Sales old notices. No free-text reason, cost/Supplier/decision evidence or bank proof in payload. Latest 100 only, manual refresh, no external messages.
- Feature 38 and dependent Supplier/Claim/refund/index docs updated alongside code. No change to carrier void, cancellation refund formula, reserve/FIFO/consent, Debt or GP-Base/commission formula/version.

## Final checks
- `npm test`: **64 suites PASS** (`test.log`). New Supplier receivable suite **52 assertions**, including independent three-connection race (only one 30 settlement accepted against 40.123456), capped partials, reference reuse after reversal, stale decisions, immutable history, BOD correction, zero/reopen, RBAC, injected receipt rollback and unchanged Client/Order.
- Expanded Claim/Refund suite **59 assertions**, including durable notification uniqueness after retry/race, independent read state, reassignment/inactive actor denial, bank/context privacy, immutable acknowledgements and existing payout/pool/Statement checks.
- `npm run build`, `npm run typecheck`, `npm run lint`: PASS. Build uses its own disposable DB. Final lint has zero warnings/errors; only an unused test variable was removed after the full runner, then Supplier suite/lint rerun.
- Actual Chrome production-build UAT **47 assertions / five roles** (ADMIN, SALES, CLIENT, FINANCE, BOD), owned disposable DB/localhost. Supplier create/approve/overlimit/partial Offset/Bank/full Offset reversal, exact separate account totals and unchanged Client pool/Balance; notification acknowledgement survives reload, Client cannot acknowledge Sales notice; existing Claim payouts, Supplier actual/payment, bank privacy, Add-on exception, immutable Statement, BOD-only report and shipping edit pass. No page errors.
- Initial UAT selector failure is preserved as `initial-selector-*`. Snapshot showed the expected form; the harness now selects by accessible combobox role/name. Not an ignored business failure. Final run uses rebuilt final application.
- Inspected Supplier mobile screenshot visually; no page overflow. Five-role desktop/mobile artifacts and `browser-uat.json` retained.
- `git diff --check` PASS. Source SHA256 manifest links checked application/test files to this report; resulting commit/remote hashes are reported in chat after ordinary push.

## Remaining implementation (not new business-policy questions)
1. Supplier supplementary cost template/import mapping and duplicate confirm/skip; Client surcharge/import-tax Excel matching by Tracking with independent revenue postings. Existing manual actions remain, no automatic Supplier-cost-to-Client pass-through was added.
2. Supplier period close snapshots and audited late adjustments referencing original periods. No Supplier lock or reopening delivered here; existing Client Statements remain immutable.
3. Full GP/commission reconciliation/category acceptance; manual Client pool group review, no fabricated per-Order allocation/rate/payout. Approved Supplier totals remain separate from fully actual GP.
4. Initial Claim submission/Admin inbox, Control Tower case linkage, pagination/unread badge. Notifications here cover decisions and actual refund/recovery, not a complete Case workflow.
5. Full pilot across all V1 service/role workflows with real documents, deployment-target backup/restore rehearsal and owner acceptance. Synthetic Chrome success is not full pilot.

## Genuine OPEN inputs and minimal proposals
- **ePacket Standard/Eco:** need Supplier/route/version confirmation whether workbook Net includes mid-mile, last-mile or both, component amounts/mapping and overlap evidence. Proposal: explicit evidence-backed coverage declaration; keep `COMPONENT_COVERAGE_OPEN` and no finalized-GP certification meanwhile. Do not sum assumed components.
- **Supplier cancellation/void:** for each unconfigured route need approved stage/percentage/eligibility matrix and actual carrier acknowledgement/credit evidence. Proposal: manual follow-up pending, explicit evidence-based action only. Internal cancellation does not void carrier or reverse payable/cost automatically.

No Jenkins, production, real carrier call, external money transfer, operator DB reset, workbook mutation or AGENTS.md/Codex changes. All new official outputs are under Developer/report. No force push.
