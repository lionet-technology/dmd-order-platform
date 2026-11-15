# Edit Order V1 / Rate increment — verification, 16/11/2026
Repository /Users/quan/Desktop/report. Origin git@github.com:lionet-technology/dmd-order-platform.git; branch main; starting HEAD 312227e56030bce1437d2f5ec8750257bc75ac21. This report describes the scoped implementation commit containing it, not full V1 completion. Existing AGENTS.md edits and untracked Codex/ are excluded.

## Delivered
- Legacy tracking-only / label-only edit locks in upsertOrder, amendment callback, shipment structure and purchased-price SQL exception. No new charge/refund/cancellation command.
- Rate USD–VND immutable SAVE/CONFIRM versions, active Admin (including non-root) UI/API, optimistic current-version checks and exact actor/payload replay.
- ePacket USD-source Net documents convert through confirmed Rate before sequential markup. New selected-row VND quotes use current confirmed Rate; private snapshots retain effective amounts and Rate ID/value. Old documents/quotes/request replay remain immutable. Existing VND-source API request fingerprint remains compatible.
- Approved Decisions and Feature docs record eligible Cancel & Duplicate source refund 100%, separate new-price financial gates, versioned Rate and explicit remaining gaps.

## Final checks
Node20 ARM64 /Users/quan/.nvm/versions/node/v20.20.2/bin/node matches installed SQLite. Tests use synthetic temporary databases; runner removes inherited DMD_DB_PATH and DMD_VERIFY_DB. Build uses scripts/build-isolated.cjs with its own temporary DB.
- tests.log: all 51 domain suites PASS, exit 0; includes new verify-service-v1-fx, existing RBAC/cancellation/ledger/balance suites and purchase consent handler (74 assertions with legacy issuance locks).
- fx.log / pricing.log / quotes.log: focused new and related suites PASS.
- typecheck.log: standalone tsc --noEmit PASS, exit 0.
- lint.log: full repository ESLint PASS, exit 0.
- build.log: isolated Next build PASS, exit 0; includes /api/service-v1/fx.
- git diff --check PASS.
An intermediate typecheck found duplicate generated .next/types/* 2.ts declarations. The four duplicate generated files were preserved outside the repo in a temporary backup; final checks above passed. No source types were suppressed.

## Target / data safety
Read-only sqlite inspection of non-backup local DBs dmd-finance-ops.db, dmd.sqlite, codex-review-demo.db, review-demo.db and dmd-uat-demo.db found no V1 price/account tables. No application initialization on operator DB, reset, migration, supplier purchase, production access or Jenkins. No actual rates were inferred from test fixtures, filename metadata, legacy constants or old FX audit values.

## Still incomplete / source blocker
Unified atomic Edit UI/session, Price Confirmation Required, Client confirmation / assigned Sales override, stable Purchase Request identity, source-linked processing Cancel & Duplicate, actual Order→rate tier/zone mapping and operational VND Reserve/Charge/Balance/Statement integration. Existing USD amendment still reprices immediately; it is not the approved consent workflow. Ordinary cancellation still uses its existing policy percentage; the approved 100% combined action has not been enabled. Full new-flow API/UI/cancel/duplicate/ledger race/retry/rollback/browser acceptance remains pending. Existing regression passes do not certify unimplemented flows.

Owner confirmed the currency, Rate versioning and source 100% refund rules; those decisions are no longer open. Owner reports Work processed Net Excel. The actual verified handoff path/chat/commit, rate rows and tier/zone mapping have not been found in inspected repo/DB; requested their location. A source-data blocker must not be represented as a completed VND Purchase or solved by copying old snapshots/zero price/bypassing financial gates. A scoped commit/push is not full deployment.
