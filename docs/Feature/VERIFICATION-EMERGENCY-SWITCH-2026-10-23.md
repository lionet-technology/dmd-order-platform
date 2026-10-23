# Emergency Route Switch on original Order — QA 23/10/2026

## Owner-approved final workflow

The earlier cancel-and-repurchase proposal is **retired**. Emergency Hold remains reversible. After Hold, Admin may reroute eligible Orders using the existing Tracking/Label replacement data model. The original DMD Order ID and Client Order ID, selling price, Charge, Customer Balance and immutable Statement remain intact. This is an **internal registration of new Tracking/Label**, not a carrier purchase API.

## Delivered

- Admin-only, route-scoped Emergency Hold API with Hold, Undo, selected single-Order Route Switch, downloadable/importable .xlsx and bulk UI. Original Order becomes active again with its pre-Hold workflow status after a successful switch; previously independent Order HOLD remains HOLD.
- Select new **Active/unheld Route** (Service / Sub-Service / Supplier) and supply the new Tracking and valid Label URL for every active Tracking on that Order. Optional Estimated Net Cost; blank preserves old estimate. The entire Order update (route, tracking replacements, audit, resolved flag) is one IMMEDIATE SQLite transaction. One invalid Tracking rolls back that Order. Distinct Orders in the import may succeed or fail independently, with explicit results.
- Original Tracking/Label rows remain with REPLACED status. New Tracking rows reference the old tracking through `replaced_by_tracking_id`; signed original supplier-cost records remain linked. No Ledger entries, Reserve changes, cancellation, refund or fake Payment from Emergency Switch. Issued Statements are not rewritten.
- New Supplier actual-cost expectation is tracked per replacement Tracking. Reconciliation cannot mark full actual-cost coverage until replacement Supplier costs are matched (or a deliberate NOT_BILLED / INCLUDED_IN_PARENT disposition is entered). Historical old-Supplier Cost and new-Supplier Cost add to total actual Net Cost and may result in loss.
- Idempotent retries with identical new Route/Tracking/Label/optional estimate return replayed; different retries are rejected. The one-transaction elevated write context is removed before commit; rollback eliminates it on failure.
- Any exported Manifest carton blocks the *entire Order*, including a two-carton order with only one carton exported. An Order already in an **unexported** Manifest carton must be removed by warehouse first. Orders with any non-WAITING_HANDOVER Tracking, shipment movement audit or fulfillment started are manual exceptions. ETD is not used as proof of handoff.
- Excel includes one row per original active Tracking, exact old Tracking ID, DMD/Client IDs, Hold ID, original selling price and editable New Route ID / Tracking / Label / Estimated Net Cost columns. Blank new Route ID skips the row. Supply the Route ID on **every** carton row of a selected Order. Max 5 MB, 2,000 rows, 250 Orders per upload; formula values rejected.
- Route lifecycle continues to use Active/Inactive/Archived/Deleted soft delete with audited status changes and no historical ID deletion.

## Verification evidence

`scripts/verify-emergency-hold.cjs` 76 assertions PASS: Admin RBAC, Hold/Undo, atomic failure, legacy holds, manifest exported partial-carton exclusion, supplier loss/split cost coverage, identical retry, invalid retry, Excel export→import→retry, role protection, restoring other held Orders, no new Ledger entry. `npm test` all 34 domain suites PASS; TypeScript and ESLint PASS; see execution log in local /tmp/dmd-emergency-final-domain.log. Production build and complete browser UAT must be recorded separately rather than assumed.

## Remaining scope / nitpicks

1. **Supplier financial exposure:** Old+new matched Actual Net Cost is tracked together. When total actual cost exceeds estimate, reconciliation goes to REVIEW, and final GP is not approved automatically. Supplier Management still needs a loss-oriented filter for revenue less than total actual cost, separate from finalized margin.
2. The UI handles per-Order or selected ready rows and Excel. It is not an automatic carrier purchasing or printing orchestration. A warehouse operator must verify and physically replace labels before shipping.
3. Exported/historical Manifest must not be blindly reopened and relabelled. Late historic Manifest EXPORT evidence absent before the audit mechanism still needs manual operational checking.
4. Full Supplier Reconciliation/Balance module, Add-on Service, broader manual Net Cost, BOD dashboard, and full cross-role browser UAT are **not** completed by this Emergency increment.
5. Uploaded Excel processes each Order atomically but not the entire batch as one transaction. The results page must be inspected for rejected Orders. An identical retry is safe, not another Charge.
6. `pricing_snapshot_json` deliberately preserves the original customer quote. Order's current Route shows where the carrier replacement was made; the `EMERGENCY_ROUTE_SWITCH` Order event preserves original route/estimate and Tracking mapping. Historic Statement snapshots remain frozen.
