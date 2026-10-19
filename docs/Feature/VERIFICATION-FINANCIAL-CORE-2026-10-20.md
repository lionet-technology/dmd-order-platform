# Financial core verification, migration and UAT — 20/10/2026

**Status: isolated FinancialCore remains inactive; full Owner build remains incomplete.**

Continuation: Claims/Refund now has a separate application adapter against the existing wallet ledger. See [20/10 continuation evidence](VERIFICATION-REFUNDS-2026-10-20.md); the historical results below describe the earlier core-only turn.

## Repository and safety

- Initial local main and fetched GitHub main: `917ed9c8f8281ef655f29c4740387e5f8dced3f0`; working tree clean before changes.
- Reviewed Feature docs, Operational Flow, decisions, current SQLite schema and financial modules. Legacy code ties Payment/Debt to Statement and credits Claims directly to Balance, conflicting with the new Owner decision.
- No operational/demo DB reset, backup, migration or data modification performed. Synthetic provenance of the existing DB has **not** been established, so reset authorization was not exercised.
- All new tests allocate a fresh `mkdtemp` directory, ignore operator DB environment variables, use foreign keys and remove only their own temporary directory. Existing `sources/` and `Codex/` untouched.
- Replacement schema initialization is explicit and inactive in application code. Rollback before activation is source rollback; no financial records were moved or rewritten.

## Replacement architecture

`fc_events` is an append-only signed event ledger; `fc_payments` stores immutable originals, adjustments link to their original Payment, reconciliation changes status through append-only history. Debt is aggregated on Client ID with prospective term history and exactly one daily accrual per Client/day. Claims append obligation revisions. Actual payouts remain separate events; no mapping to individual Claims. Atomic outbox insertion shares the same immediate transaction and failure rolls back money and receipt. Immutable snapshots capture completed periods without money mutation. Reports retain positive and negative Client exposures separately.

This is an isolated replacement domain, **not** a second active production ledger. Every operational adapter must be replaced or routed through the core before cutover. Until then, application behavior remains legacy.

## Automated evidence

- `node scripts/verify-financial-core.cjs`: **79 assertions PASS** on Node v20.20.2 arm64. Includes conversion conservation/limits, no fake Payment, Debt-first Payment, downward/upward adjustments, immutable originals, reconciliation money independence, atomic bulk rollback, permission and ownership checks, outbox rollback, Claim revisions, bank-vs-Balance payout, over-refund warning, partial recovery, inclusive Vietnam deadline, prospective intraday rate, schema rerun, immutable snapshots and report parity.
- Four independent SQLite connections issue forty identical Payment requests concurrently: all succeed and one Payment event is recorded.
- `npm test`: **21 domain suites PASS**, including the initial 76-assertion replacement suite. After adding Statement request-key conflict and Client reserve/no-second-balance-check cases, the replacement suite passed again with **79 assertions**.
- `npm run typecheck`, `npm run lint`, `npm run build`: **PASS**. Production build selected only `/tmp/dmd-owner-financial-core-build-20261020.db`, never the operational DB.
- `git diff --check`: PASS; new core/schema/test files also checked explicitly against `/dev/null`. Typecheck/lint/build passed again after the final core changes. No new commit SHA or push; full application/UAT gates remain incomplete.
- Environment: default shell lacked Node/npm; Node 22 binary is x86_64 while installed SQLite addon is arm64/Node ABI 115. Used the existing compatible `/Users/quan/.nvm/versions/node/v20.20.2/bin` runtime; no dependency reinstall or lockfile change.

## Migration requirements before activation

1. Identify the exact target DB/environment and establish synthetic-only provenance without exposing secrets. If provenance is incomplete, retain data and use a new empty isolated DB for rehearsal.
2. Take a consistent SQLite backup (including WAL through SQLite backup API), verify readability and restoration, retain its checksum and location. Only then reset a verified synthetic DB if useful. No reset script is delivered by this change.
3. Implement enrollment/configuration, all financial adapters and cutover into a single balance source. Reconcile opening balances, Debt interest/principal, Refund Balance, reserves and typed source references. Do not infer financial history from legacy Statement paid/unpaid allocations.
4. Rehearse schema init/restart/rollback and inject failures across ledger, audit, receipts and notification delivery. Compare report totals to event drilldown per Client and period.
5. Retire FIFO and legacy write paths only after parity and end-to-end tests pass. Never run legacy and replacement writes for the same business event.

## Browser UAT and release gates

**NOT RUN for this replacement:** there are no connected replacement screens yet. Do not reuse October 18/19 browser evidence as acceptance of these changes.

Required UAT: Admin manual Debt conversion/extension/rate/recovery; Sales immediate Payment; Finance bulk confirm/discrepancy/adjustment, payout sheets and statement finalization; Client balances/notifications/partial purchase/reselect; desktop/mobile quick one-carton flow; two concurrent actors, key conflict, retry and rollback. Existing Order Hold and service/template guards must remain enforced on READY without a second balance check.

Real-carrier credentials/labels/cancellation, approved real pricing/policies, production DB provenance/backup/restore, operational notification transport and Owner acceptance remain release gates. No production deployment, main commit or push is authorized by the current passing primitive tests alone; the requested full-build gates have not been satisfied.
