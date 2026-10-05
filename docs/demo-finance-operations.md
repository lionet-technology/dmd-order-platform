# Finance and operations demo (TEST/DEMO ONLY)

Run `npm run seed:demo` with the localhost server stopped. It requires an explicit `--reset-demo` internally and refuses `NODE_ENV=production`. This command replaces all transactional data in `DMD_DB_PATH` (default `data/dmd-finance-ops.db`); never point it at live customer data. It saves a SQLite backup beside the database before resetting, wraps all changes in one transaction, and checks foreign keys. Keep the backup until review is complete. With the server stopped, restoring the backup file restores the previous local state.

Users, existing passwords, service routes, immutable pricing versions/configuration, templates and warehouse routing rules are preserved. Only the three named ePacket demo client profiles/settings are rebuilt. A configured route that prevents demo purchase causes rollback instead of silently changing its policy. Transaction IDs are restarted; reseeding produces the same scenarios for the same users, with dates relative to the current day.

## Review accounts

Existing demo credentials are `Demo12345!`: `epacket.sales`, `epacket.client.a`, `epacket.client.b`, `epacket.client.c`. `demo.warehouse` is created with the same test-only credential when absent. Existing credentials are never reset. On a fresh empty database, the base ePacket seeder creates `epacket.admin`; otherwise use the existing Admin account.

- Client A / Lotus Apparel: prepaid, no credit, approximately 9.4828% discount.
- Client B / Saigon Craft: $1,500 credit, approximately 5.1724% discount, paid and partially paid statements, FIFO payment plus audited Admin allocation override.
- Client C / Mekong Accessories: $500 credit, approximately 0.8621% discount, overdue statement, $5 Debt Item and manual purchase lock.

Orders use `EPK-<client-id>-Standard-0..5` and `EPK-<client-id>-Eco-0..5`. There are 44 orders: purchased Standard/Eco, pending reserve and failed purchase for A, editable drafts and invalid rule examples. USPS-like tracking numbers link to the local demo SVG label, with in-transit, delivered and alert examples. No supplier Net fields are returned to Sales/Client.

Control Tower contains Hold #1 (overdue), Claim #2 (near due), Claim #3 (resolved: $1 refund + $2 compensation), Claim #4 (overdue first response), Recovery #1 ($2 expected/$1 recovered: $2 net loss), `DEMO-UNKNOWN-BOX` (overdue unidentified), matched received inventory, pending Adjustment #1 and charged Adjustment #2. Orders/Balance Ledger show statements and Debt Items. Admin sees supplier recovery and matured monthly cohort; Warehouse sees only operational details.

## SLA behavior

Purchase Failed 4h, Warehouse Hold 24h, Weight Adjustment 24h, Client Claim first response 48h, Supplier Recovery 72h, Unidentified Inbound 24h. Generic Exception cases default to 24h. Case/Recovery `due_date` overrides take precedence. An entered calendar date expires at end of that day in Asia/Ho_Chi_Minh; timestamps and SQLite creation times are interpreted consistently in UTC, with UI deadlines displayed in Vietnam time. Claims stop their first-response clock only after a public staff reply or finalization; private comments do not satisfy it. Near due means within four hours. Reading overdue queues never closes, resolves or pays anything.

Run `npm run verify:sla-demo` for isolated duration, boundary, first-response, override, seed determinism, preservation, production guard, rollback and role checks. FX/multi-currency, deep supplier reconciliation, Finance role, external Client API and real East/West routing remain deferred.
