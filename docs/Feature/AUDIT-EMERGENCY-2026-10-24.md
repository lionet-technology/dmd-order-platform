# Emergency Hold & Switch audit — 24/10/2026

Baseline: b719e90. Status: hardening and first supplier-loss reporting increment; not full release acceptance. No production database, carrier integration or deployment was used. Codex/ was left unchanged.

## Findings fixed

| Priority | Concrete failure | Correction and evidence |
| --- | --- | --- |
| P1 | Order retained old supplier COMPLETE coverage/finalized GP immediately after rerouting, until another reconciliation ran. | Reconcile inside the Switch transaction. Immediate PARTIAL/null-finalized assertions before any caller reconciliation. |
| P1 | Reopen exported Manifest → unpack carton removed current membership and erased handoff eligibility evidence. | Check durable REMOVE audit preceded by EXPORT on the same Manifest carton, in both Hold and Switch. Test exported partial-carton Order, unpacking and a subsequent new Hold. |
| P1 | Fresh worker/process boot failed under Hold because compatibility migration issued redundant Tracking INSERT/UPDATE and fired guards. | Skip existing normalized Tracking and unchanged Carton/Lot mapping; never disable Hold guards. Four real worker connections can bootstrap and Switch/replay, with one audit/replacement set and unchanged Ledger. |
| P1 | Invoice arriving before replacement Tracking was left unlinked by Switch; unrelated supplier invoice could satisfy replacement coverage. | Separate evidence linking from legacy repricing/Charge recomputation. Switch links pre-arrived invoices; expected Supplier and Lot must match before coverage is satisfied. |
| P2 | Duplicate original Tracking ID could pass the replay comparison on an Order with multiple Tracking rows. | Require a distinct complete original-ID set. Duplicate retry rejected; complete retry succeeds. |
| P2 | Hold accepted a WAITING_HANDOVER-only audit but Switch rejected any status audit, leaving an unnecessary manual exception. | One shared movement predicate, used by both; actual movement/malformed JSON still fail closed. Existing Excel round-trip now includes WAITING_HANDOVER audit. |
| P2 | Existing Lot estimate override silently masked the explicit new Order estimate. | Update existing single-Lot override in the same transaction. Existing multi-Lot/component allocations require explicit Reconciliation edits; no invented allocation. |
| P2 | Loss remained invisible in the GP report during REVIEW because finalized GP correctly stayed null. | Separate actual_gp and Finance loss/Emergency filters. Actual loss does not approve reconciliation or charge the Client. |

## Safety and complexity assessment

Retain the existing one-Order IMMEDIATE transaction and one-transaction write context. No cancellation, second Order, suspense balance or compensating payment model was added. Shared movement/manifest predicates and reusable cost evidence linking reduce inconsistent rules without weakening handoff guards.

Hold retries reuse the active batch; stale Undo cannot close a newer Hold. Switch preserves original Order/Client IDs, selling price and workflow snapshot, replaces Tracking rows with historical links and leaves original supplier costs intact. An independent Order HOLD stays HOLD. Route lifecycle remains audited soft state, with existing Active/unheld destination and carton-limit validation.

Excel keeps per-Order atomicity rather than whole-workbook rollback. Blank destination rows skip; operators must put destination IDs on every selected Tracking row. Partial failures return explicit results; retry uses original IDs. No automatic expiry/Undo was added: stale holds require an explicit Admin decision.

New actual_gp is separate from estimated/finalized GP and is stripped from operational projections. Historical rows are populated only during normal reconciliation; this change did not backfill production data.

## Verification

- Full regression: 34 domain suites, synthetic/disposable databases.
- Extended Emergency suite: 109 assertions, including API anonymous/role denial, exact retries, stale Undo, concurrent worker requests and competing Switch versus Undo, audit-failure rollback, restart under Hold, exported partial carton/unpacking, pre-arrived/wrong Supplier costs, known loss privacy/API filters, estimate override, invalid estimate/Label and XLSX export/import/retry.
- Production build: dedicated synthetic /tmp database. ESLint and TypeScript run separately.
- Existing Statement suites verify immutable financial snapshots and concurrency; Emergency tests compare the complete Ledger rows before/after Hold/Switch/Undo/import/concurrent retries. Extended Emergency verification issues a Statement before Hold and compares the complete stored snapshot rows byte-for-byte after Switch, XLSX import, stale Undo, concurrent retries and a Switch-versus-Undo race.
- Browser desktop: synthetic Admin login, route configuration, Hold → Undo → Hold, missing-Carton disabled gate.
- Browser mobile 390×844: complete replacement of two Tracking/Label rows, optional estimate, successful 1/1 Order. Order afterward retained Client ID, PURCHASED status and $25 price. Read-only DB check: exactly one $25 ORDER_CHARGE, old two Tracking REPLACED, new two ACTIVE, integrity ok.
- Rebuilt-browser Finance: old Supplier $10 + new Supplier $31 = $41 cost on $25 revenue; REVIEW, actual GP −$16 and finalized GP null. Both loss/Emergency filters checked; Statement navigation shows the approved visible name. Mobile page width equals viewport width (390px); tables scroll within their containers.
- Evidence: /private/tmp/dmd-audit-mobile-loss.jpg and /private/tmp/dmd-audit-desktop-loss.jpg. Logs: /tmp/dmd-audit-final-{all,build,lint,typecheck}.log.

Browser checks are scoped UAT, not the entire five-role/device matrix. The last movement-predicate/estimate-override corrections are covered by domain regression; the browser workflow preceded those two backend-only corrections.

## Delivered continuation and pending

Delivered first Supplier/Reconciliation increment: actual GP exposure during REVIEW; loss-only and Emergency-only Finance API/UI filters; operational privacy. Visible Statement V2 labels changed to Statement; internal API/module names remain stable.

Pending: Supplier Management and internal Balance/payables workflow completion; loss-oriented Excel export/import and invoice/cost linkage; complete Add-on Service optional-Order workflow, filtered Supplier selection and manual net/sale with no double Charge; broader Admin/BOD KPI UI from verified sources; manual unpriced-route pricing enhancements. Existing implementations in these areas were not re-certified as complete here.

Remaining acceptance: full cross-role desktop/mobile workflow matrix, browser Excel upload/partial failure/retry, unrelated simultaneous financial posting interleavings, and all component/multi-Lot cost-allocation boundary scenarios. Historic handoffs lacking prior audit evidence remain manual evidence review; no rule can reconstruct unrecorded physical handoff.

Do not label the entire requested scope or production rollout complete based on this increment.
