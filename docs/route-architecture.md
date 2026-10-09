# Route Architecture

Service Identity is the normalized Service + Sub-Service pair. Client permissions and discounts remain on that identity, independent of Supplier. The UI selects one configured service by its display name, `Service - Sub-Service`.

Each concrete Route ID identifies a Supplier/configuration version. Orders persist that ID. Pricing activations, templates, warehouse cartons and supplier cost records refer to the concrete route, directly or through their parent Order. New routes may reuse the same Supplier with new configuration; legacy tuple lookups reject multiple matches.

## Lifecycle

Create a replacement route as an inactive draft, configure its variables/templates/prices, stop or archive the previous route, then activate the replacement. The backend checks duplicates and SQLite enforces a partial unique index on normalized Service + Sub-Service for active routes. Existing orders keep their original Route ID, Supplier and purchased price snapshot. Unsubmitted raw drafts resolve the active replacement for their Service Identity at submission, with current validation/pricing/permission checks.

Route identity fields are immutable. Configuration variables/pricing engine cannot change once a route has orders. Pricing versions remain immutable; operational holds and warehouse segmentation can still change deliberately.

Physical deletion requires confirmation and no business references. Route lifecycle audit entries are retained and do not by themselves prevent deleting an unused route. Routes with orders must be archived, regardless of reconciliation completion. Archive confirmation shows missing-cost order and open-claim counts. Archived routes remain resolvable for fulfillment templates, warehouse operations and historical supplier costs.

## Changing an order's route

Admin and Sales can propose a configured active route within Client scope for a Draft or pending purchase, before any tracking/label or completed purchase. Client permission, shipment rules and a configured quote are required. The proposal stores the reviewed quote, prior order state, reason, actor and monetary delta.

Admin, assigned Sales or the Client can confirm the reviewed proposal. The transaction checks that the order and quote have not changed, checks Balance/Credit, updates the concrete Route and frozen quote under a narrow audited exception, adjusts the reserve, records confirmation actor/time and clears stale manual purchase progress. Insufficient funds roll back the transaction; the proposal remains pending. Confirm retries do not charge twice. After tracking or purchase, direct route changes are blocked in both the backend and database.

## Migration and safety

The application creates a SQLite snapshot named `<database>.before-route-architecture-<timestamp>.db` before any schema upgrades on a legacy database. A failed snapshot prevents startup/migration. Migration runs transactionally, preserves IDs, removes the legacy tuple uniqueness constraint and restores foreign-key enforcement on success or failure.

Active identity conflicts stop migration and write `<database>.route-conflicts.json`. Historical orders are backfilled only for a unique match; a valid snapshot Route ID takes precedence. Ambiguous/unknown orders, Supplier mismatches and mixed-route warehouse cartons are reported in `route_architecture_issues` and `<database>.route-backfill-report.json`. They are not assigned arbitrarily. Older warehouse schemas can be restored independently; their carton route backfill also requires a unique match and never synthesizes a selling route from packed orders.

Do not point a review process at production. Use `DMD_DB_PATH` with a separate SQLite snapshot. No database or environment file belongs in Git.

## Pricing coverage

The existing configured pricing engine is `EPACKET_US` (US rules, tiers and surcharges). A replacement Supplier for the same Service Identity inherits that engine, but requires its own pricing activation. Other services require an approved pricing engine/table before automatic requote and route changes are enabled; the application refuses unsupported quotes.

## Validation

Run `npm run verify:route-architecture` for replacement supplier, frozen order history, quote confirmation, atomic reserve/credit checks, archive/delete constraints, historical cost matching and migration ambiguity/rollback coverage. Existing order, draft/import/manual purchase, warehouse/manifest, RBAC, credit, cancellation and finance regression scripts remain available. Also run lint and build.
