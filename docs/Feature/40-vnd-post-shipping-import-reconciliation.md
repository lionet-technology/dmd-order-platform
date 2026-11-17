## VNĐ V1 continuation — 17/11/2026
[Feature 41](41-vnd-supplier-period-gp-control-tower.md) records immutable Supplier period close/current-period late corrections, freight-only GP-Base and approved reference commission formula, whole-Claim same-cohort group reconciliation, before-Refund GP-Net, and scoped VNĐ Control Tower exceptions. Synthetic verification is separate from real-document pilot/deployment acceptance. Claim/watchlist/Complete Claim linking remains NEXT phase. This supersedes contrary earlier delivery-status notes only for this bounded VNĐ scope.

# Post-shipping imports and Supplier reconciliation queue
**Status: implemented bounded VNĐ slice; 66 regression suites, build/typecheck/lint and five-role Chrome 62 checks PASS. Reviewed 17/11/2026.** This is the current scope for the Owner continuation; full V1/pilot remains partial.

## Approved decisions and boundaries
- ePacket Standard/Eco USD table is RAW NET RATE. Global confirmed USD/VND FX produces Estimated Net Cost VND. The service profile already includes mid-mile + last-mile; no second mid-mile amount or user all-in/partial choice. EU/Yun VND tables are Net Cost; UPS VND raw rate requires the configured full formula. Existing source/quote tests remain the formula evidence. Breakdown is deferred.
- A higher Supplier Net or weight is an error/variance requiring review, not proof the Supplier is wrong. Imported rows never become True/Actual cost, payable or finalized GP merely because parsing/matching succeeded.
- Cancellation uses each service policy and current collected total Order revenue; Claim Refund remains separate. No automatic carrier void, Supplier receivable or Client refund from this import.
- Claim/Refund redesign is a separate short next phase. Do not expand approval layers.

## Supplier import and queue
Admin/Finance/BOD use existing scoped Supplier VNĐ endpoint. Multipart Excel headers: `Tracking | Actual Net VNĐ | Cân Supplier kg | Tham chiếu | Lý do`; first column may instead be `Order ID`. Identifier cells must be text (preserve leading zeroes), amounts/weight nonnegative decimal VNĐ strings after parsing. 10 MB maximum, 1–200 nonblank rows. Blank weight is allowed; reason/reference required. No FX inferred from Supplier documents. JSON supports a single explicit Lot ID instead of Tracking/Order code.

`action=import`, `kind=TOTAL|SUPPLEMENT` appends immutable source rows. All rows await explicit review, including clean ones. Queue retains unmatched and ambiguous rows. Errors: ORDER_NOT_MATCHED, AMBIGUOUS_MATCH, WEIGHT_ABOVE_DMD, MISSING_DMD_WEIGHT, NET_ABOVE_ESTIMATE, MISSING_ESTIMATE, DUPLICATE_IN_FILE, DUPLICATE_HISTORY, MISSING_APPROVED_BASE. Weight compares purchased quote Lot billable weight when present, otherwise complete carton chargeable weights; never substitutes scale weight for missing billable weight. Historical/in-file duplicate checks retain source context; new-key import creates pending evidence, never another charge.

`action=review_import`, `decision=accept|skip`, 1–200 selected rows, reason and current row token required. Finance/BOD accept; documentary Admin may skip but cannot post payable. Unmatched/ambiguous rows require explicit eligible charged/cancelled VNĐ Lot of the same Supplier. Current approved cost ID must be supplied, including manual mappings (0 if none). The UI exposes manual Lot and current Actual cost ID, with the existing cost list as reference.

Bulk is one immediate transaction: stale/missing/already-reviewed row, wrong Supplier, duplicate selected ID, invalid target, missing supplemental base or stale current Actual rolls back the entire batch. At most one accepted row per Lot per batch; duplicate same-Lot evidence must be reviewed sequentially, consciously choosing total versus supplement. No silent best-match or duplicate summation.
- TOTAL replaces approved total using a payable delta (new total minus old).
- SUPPLEMENT adds an explicit commercial Supplier cost to the approved total; delta equals only the supplementary amount. Repeated real charges require a new row and explicit review, with historical duplicate warnings.
- Accept records original source, actor, time, reason and review snapshot, creates approved cost + payable atomically. Skip is immutable and posts nothing. Imported pending rows never participate in approvedVndLot/report Actual.
- Client money, Selling, issued Statements and Supplier Claim receivables are untouched.
- Same actor/key/payload retry does not create another row/decision. Changed payload/key reuse rejects. All pending rows remain visible; recent decision history is capped at 200 globally in the basic view. Large-volume pagination/performance refinement is not delivered.
- Existing single-document Lot/Tracking cost entry retains its established pending approve/keep-old workflow; the Excel queue is the new bulk workflow. Old USD costs/review APIs are not reinterpreted as VND.

## Client post-shipping surcharge/tax import
Admin and assigned Sales only, server-authorized Client scope. Excel headers `Order ID | Loại | Số tiền VNĐ | Tham chiếu | Lý do`; kind `surcharge` or `tax`, positive amounts, text Order IDs, 1–200 rows / 10 MB. Preview endpoint parses without posting. Confirmation calls existing operations endpoint with `action=import_charges`, selected Client, items, reason and request_key.

Each Order must match uniquely within Client and be VNĐ CHARGED, not cancelled. Each reference identifies one source row uniquely within the Client; use document+line references when one invoice covers multiple Orders. Same reference and identical normalized Order/kind/amount/reason is skipped even with a new request key; changed content rejects. Repeated reference within one batch rejects. All rows, source audit and Ledger postings commit or roll back together.

Uses existing ORDER_SURCHARGE / ORDER_TAX exact decimal journals. It may exceed Credit Limit without creating Debt or changing reserves; later Purchase still obeys funds rules. No Supplier payable from a Client import. Cancellation/refund context already includes both categories in current collected revenue. Commercial performance reporting now includes ORDER_SURCHARGE; tax remains separately in cash/Statement/collected total, excluded from commercial revenue/GP. Existing commission reference inputs deliberately keep ORDER_CHARGE/ORDER_CORRECTION scope; no new commission eligibility/formula is inferred. Reconciliation of supplementary revenue with final commission remains incomplete. Issued Statement history is immutable; late posting follows the existing new-period flow.

## Claim/watchlist direction — APPROVED, NOT BUILT IN THIS SLICE
Client and Supplier Claim cases remain separate. One Supplier case may contain N Orders or one Order; manually select from error/watchlist, never auto-create one Claim per error. Manually flag a Client-claimed Order for Supplier follow-up, optionally link the two cases. Both sides should have a simple watchlist/case queue showing linked Claim ID(s) or no Claim yet. Current VNĐ Claim approval is a financial decision journal, not yet a Complete Claim transition in Control Tower. Detailed UX, case lifecycle, links and queue-to-case bulk creation belong to the next Claim/Refund phase. Current receivable foundation is retained; no claim is created by import/review.

## Code, tests and remaining work
Code: vnd-supplier-import.ts, vnd-supplier.ts, vnd-operational-schema.ts, vnd-operational.ts, vnd-reporting.ts; existing commission inputs retained; Supplier/charges-import API and VNĐ tools.
Regression: verify-vnd-supplier-import.cjs, verify-vnd-charge-import.cjs, existing full suite; browser: e2e-vnd-v1.cjs.
Evidence: ../../artifacts/vnd-import-reconciliation-2026-11-17/VERIFICATION.md.

Not delivered: Supplier tax/pass-through accounting import (do not disguise tax as commercial supplemental cost), Supplier period close/reopen/late-adjustment policy, full finalized GP/commission reconciliation, redesigned Claims/watchlists, complete Control Tower and pilot with real evidence. Supplier commercial supplement and Client surcharge/tax imports are delivered; these are distinct money flows.
