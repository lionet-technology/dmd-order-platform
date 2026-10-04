# Warehouse cartons

Cartons bind to a full `service_route_configs` route (Service / Sub-Service / Supplier), with optional `segment_key`. Multiple OPEN/PAUSED cartons can coexist. Scan without a selected carton creates a new carton; explicit create accepts `route_config_id` and optional `segment_key`. Legacy populated cartons bind from existing items; empty legacy cartons bind once on their first matching-service ADD. Mixed legacy cartons must be corrected before closing.

`POST /api/manifest-cartons`: `identifier`, optional `manifest_carton_id`, `mode: ADD|REMOVE` (default ADD). REMOVE requires a selected OPEN carton and resolves only its packed items, including cancelled or replaced trackings. Identifier by order removes all matched physical cartons in that carton; scan tracking for an individual physical carton. ADD is transactional: all items pass or nothing changes. Unknown carton IDs fail.

`POST /api/manifest-cartons/:id`: `action: pause|resume|reopen|close|remove` (remove also requires `item_id`). CLOSED cartons require reopen before edits; PAUSED cartons require resume. Close rechecks all guards and creates the next carton in the same route/segment. Reopen clears export/close timestamps; audit remains. Detail includes append-only history with actor and item snapshots.

Warehouse Guard returns ALLOW/BLOCK with reason_code. Full route, cancellation, per-source order holds, route hold and configured segment evaluators run on ADD, close and carton export. Physical removal bypasses these guards. Manifest templates are only required by file generation, allowing warehouse packing on routes without a template.

`POST /api/orders/:id/warehouse-hold`: `{hold: boolean, reason: string}`. Client/Sales access follows existing client ownership; Admin can access all orders. Release clears only the actor role's source; holds from other sources remain active. Warehouse cannot issue/release holds. Events appear in internal order audit; financial and order workflow status are unchanged.

`POST /api/service-routes/:id/warehouse-hold`: `{hold: boolean}`, Admin only. Route identity cannot be edited once a carton references it; create a new route instead.

`warehouse_routing_rules` stores route, evaluator_key, config_json and active flag. Register an evaluator using `registerWarehouseSegmentEvaluator`; evaluators receive full order data plus parsed config and return a segment key or null. Unknown active evaluator or segment without rules fails closed with RULE_UNAVAILABLE. SEGMENT_MISMATCH blocks differing results. No real ZIP rule is shipped. ADMIN_VIOLATION is reserved in the reason-code type for a later compliance extension; no compliance UI is shipped.

Run `npm run verify:manifest` for route/hold/segment/status/scan/audit and migration/restart verification, using Node 20.
