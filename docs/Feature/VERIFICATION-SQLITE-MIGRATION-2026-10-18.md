# Verification — SQLite concurrent migration (2026-10-18)

## Issue and fix

A production `next build` against an existing configured SQLite database failed during `/api/costs` page-data collection with `SqliteError: duplicate column name: actual_cost_coverage`. The same build passed against an isolated empty database. Concurrent Next.js build workers were able to race between `PRAGMA table_info(orders)` and `ALTER TABLE orders ADD COLUMN` in `reconciliationSchema()`.

`src/lib/reconciliation.ts` now wraps the schema check/ALTER and related reconciliation table/trigger setup in one `better-sqlite3` immediate transaction. The `cost_snapshot_json` column migration is included within the same transaction. SQLite's write lock serializes migration across connections while keeping repeated application idempotent.

## Verification

- Configured existing DB: `npm run build` **PASS** (37 pages), then repeated **PASS**.
- `npm run typecheck -- --incremental false`: **PASS**.
- `npm test`: **PASS**, 17 domain suites / 995 assertions.
- `npm run lint`: **PASS**.
- Earlier run against isolated empty DB: build **PASS**.
- Production local server (`next start`) with a separate new database and `scripts/e2e-order-api.cjs`: **PASS**, 32 HTTP assertions.

No existing database reset, seed, or deployment was performed. These checks alone do not replace a rehearsal on a backup of the real production DB or a fresh browser UAT. The other seven HTTP suites and browser UI tests from the previous verification report were not rerun in this focused fix.
