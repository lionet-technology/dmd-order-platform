# Owner continuation — Route lifecycle & Emergency handoff evidence (23/10/2026)

## Owner-approved direction
Emergency failure no longer creates a duplicate Order or invokes the ordinary cancellation/refund workflow. The intended future resolution operates on the **same** DMD Order ID and Client Order ID using a controlled Tracking/Label replacement, optional Route (Service/Sub-Service/Supplier) change and optional Estimated Net Cost. Original client selling price, Charge, Balance and issued Statement stay unchanged; old Tracking/Label, Supplier and true financial cost history must remain auditable.

## Implemented in this increment
- Added Route lifecycle states ACTIVE / INACTIVE / ARCHIVED / DELETED via a separate audited soft-delete index. Deleted routes retain original route IDs/history and are never physically removed. Active is synchronized to existing route purchase guard. Admin UI exposes status tabs, reason-required transitions and archive/delete actions.
- Archived→Deleted requires no unfinished Order and no tracked non-cancelled Order lacking Actual Net Cost. Identity edits are blocked when the route's original Service/Sub-Service/Supplier already has Orders or Manifest records; existing Service Route update API retains compatibility while auditing activation changes.
- Emergency Hold remains reversible and still leaves Order and money untouched. Eligibility now excludes **any** Order with a carton in an already exported Manifest or durable historical EXPORT audit. Exporting a Manifest records append-only EXPORT evidence with actor ID; reopening the carton does not erase the audit evidence.
- Emergency Admin panel now downloads an .xlsx inspection report with original DMD/Client IDs, sale, Tracking, Label and Hold provenance. The JSON snapshot is still available by API. The Excel file is NOT yet an upload/reroute template.

## Tests and limitations
- Existing 34 domain suites and dedicated Emergency Hold regression PASS; expanded emergency suite exercises Manifest export audit exclusion and lifecycle state gates; Excel export is read as a valid workbook.
- No emergency Route + Tracking/Label switch is enabled in this increment. Existing DB triggers intentionally block changes while held. Deliberately avoided bypassing those guards until an audited single-Order operation can guarantee supplier-cost history, no re-charge, atomic relabel and proper Manifest-exception handling.
- Supplier Management, Add-on Service and BOD navigation remain separate approved follow-up features. This increment is NOT full acceptance of the requested scope.
- Historical Manifest exports whose exported_at was erased **before** this audit event existed require manual operational review; do not infer physical possession solely from current ETD or manifest state.
- Tests only on disposable synthetic databases; no production data reset, carrier API or bank action.
