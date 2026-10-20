# Statement V2 — Synthetic read benchmark, 20/10/2026

**Status:** baseline internal performance sample; not production volume/resilience acceptance.

The runner `scripts/benchmark-statement-v2.cjs` *always* creates and deletes a newly generated temporary SQLite DB. It ignores an existing `DMD_DB_PATH`, initializes synthetic users and ledger charges, checks every Client's Statement V2 preview amount and row count, reads Statement history, verifies DB integrity and reports timing/memory. It never seeds/resets an existing database.

## Baseline executed
Command: `node scripts/benchmark-statement-v2.cjs` (Node 20; synthetic only).

- 100 Clients × 100 debit Ledger entries = **10,000** artificial entries.
- Sequential Statement preview + history/list across all 100 Clients: benchmark wall **4,136 ms** (includes DB creation/insertion).
- Per-Client preview + history: p50 **8.21 ms**, p95 **29.54 ms**, max **57.61 ms**.
- Process RSS **215 MB**; `PRAGMA integrity_check` returned **ok**.
- Each read was checked for 100 rows and a signed close of **−$100**.

## Not proven
- Not HTTP response latency, browser rendering, multiple concurrent sessions, authentication request overhead, imports at larger scale, 5,000+ row spreadsheet edits, full five-role UAT, real multi-carton flows or a real deployment DB.
- Not a service-level target or load capacity guarantee. Runs may vary by machine, indexes and historical data distribution.
- No writes to operational data. `Codex/` untouched.

## Next
Run controlled HTTP concurrency benchmarks on a disposable seeded DB, record p95 and errors under an explicit load cap, then browser UAT and application-level restore rehearsal. For a workload above this baseline: `BENCH_CLIENTS=250 BENCH_ENTRIES=200 node scripts/benchmark-statement-v2.cjs` (bounded to 500 each).
