# Emergency Route Switch — legacy first-stage notes

**Superseded for Phase 2:** Owner chose to keep the original Order and use audited Route + Tracking/Label replacement instead of cancelling/re-purchasing. The later tested implementation and its limits are described in [VERIFICATION-EMERGENCY-SWITCH-2026-10-23.md](VERIFICATION-EMERGENCY-SWITCH-2026-10-23.md). The historical notes below document the original Hold-only stage.
Status: Partial implementation, 2026-10-23. Not production acceptance.

## Owner decision
Two distinct phases: (1) reversible Emergency Hold, no money movement; (2) explicitly cancel for linked replacement without refund or double Charge/Reserve. The latter must conserve liability during partial upload, retries and recovery. It must never use ordinary cancellation/refund.

## Implemented scope
Admin-only GET/POST /api/service-routes/:id/emergency; action hold requires reason; action undo requires exact hold_id. Phase 2 is rejected. UI is in Service Configuration → Hoàn / Huỷ. Admin can download JSON snapshots or an Excel inspection report (DMD ID, Client Order ID, status, original sale, tracking/label and hold provenance). This Excel is read-only for review and NOT yet an enabled bulk reroute/relabel upload template.

Hold snapshots eligible orders and their original workflow status, sets HOLD, and blocks route purchases/outbound through warehouse_hold. Existing warehouse Hold is preserved and restored on Undo. Existing order Hold remains Hold after Undo. Route activation is not changed; Admin may deactivate after Undo using existing route configuration.

All changes, item snapshots and per-order audit are in one SQLite immediate transaction. Repeated Hold while active returns the same batch. Repeated Undo of an already undone batch does nothing, including when a later batch exists. Only one active Hold per route is permitted.

Eligibility excludes cancelled/delivered/closed orders, fulfillment_started_at, **any carton belonging to an exported Manifest** (including historical EXPORT audit events), any non-WAITING_HANDOVER tracking (including replaced tracking), delivered timestamps and historical shipment movement. Manifest export is the Express operational handoff/ETD boundary. Pre-existing exports subsequently reopened before this durable audit event was installed may require manual evidence review. Malformed history fails closed. ETD is never evidence of handoff. Physical carrier evidence not entered in the application cannot be inferred: operational handoff recording remains essential.

DB guards reject changes to held workflow status/route/price/tracking/label, held tracking inserts/updates/deletes and order deletion. Active route configuration cannot be edited or warehouse Hold cleared until Undo. New orders for the route are blocked. These guards also prevent ordinary cancellation from crediting an emergency-held order. Account Payment/Statement/Refund operations remain separate; Emergency Hold itself neither reads nor modifies their financial postings.

Undo restores workflow status only; money/pricing/route are untouched by Hold. Stored original snapshots retain selling price, source Order, route, tracking and label for audit. Export is Admin-only and explicitly carries replacement_enabled=false. No Client Order ID reuse exception is installed.

## Deferred phase 2 — explicit safety limit
Cancellation for replacement, replacement XLSX import, source↔replacement links, estimate entry and atomic liability carry-forward are NOT implemented. Existing cancellation creates REFUND CREDIT and releases Reserve; ordinary purchase can create a new debit. Reusing these paths would violate the Owner's conservation rule, especially between cancellation and partial/retried imports. No emergency cancel or replacement button is enabled, and no synthetic refund/payment is generated.

Before phase 2: design a durable obligation/suspense record linked to exact immutable Ledger/Reserve references; migrate charge ownership or reverse/reapply atomically without changing available buying room; define frozen Statement late adjustments, Payment interactions, partial batch recovery and old/new route history. Verify concurrency, auth, crashes, repeated imports, estimate vs actual costs and Statement/Balance parity before enabling it.

## Source and verification
src/lib/emergency-hold.ts, emergency-schema.ts (installed by db.ts), API service-routes/[id]/emergency, emergency-hold-panel.tsx.
scripts/verify-emergency-hold.cjs uses a fresh temporary synthetic SQLite DB; covers role denial, reason, Hold/Undo, original Hold, historical handoff exclusions, duplicate retry, price/cancel/tracking/route guards, original-price export, audit-failure rollback, schema reload and unchanged Ledger.
## Recorded QA — 2026-10-23
- Full npm test: 34 domain suites PASS; then expanded Emergency Hold domain/API suite: 39 assertions PASS.
- TypeScript, full ESLint and production build PASS (build used a synthetic /tmp database).
- API checks include anonymous 401, Client 403, Admin status and explicit phase-2 409. Fresh child-process DB reload and injected audit failures prove durable Hold and atomic rollback.
- No browser click-through/UAT was run for the new panel. No production DB, deployment or phase-2 financial acceptance.
- Local checks used Node 20.20.2 arm64 matching the installed SQLite binding. Duplicate generated .next/types files were moved to /tmp before TypeScript; source configuration was not weakened.

Broader Route lifecycle, Supplier/add-on and Statement-name scope remains approved, but is not claimed complete by this first-stage change. Existing Supplier/BOD features are described in their own feature docs.
