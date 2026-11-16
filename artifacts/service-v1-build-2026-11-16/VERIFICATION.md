# Service Architecture V1 build — verification, 16/11/2026
Repository: /Users/quan/Desktop/report.
Remote verified: git@github.com:lionet-technology/dmd-order-platform.git.
Starting branch main, HEAD 7491a726d953cdf6f6784ef76e604ced729db961. Fetch origin succeeded and HEAD matched origin/main before edits.
Pre-existing modified AGENTS.md and untracked Codex/ were preserved and excluded from commits.

## Source
Read the complete attached /Users/quan/Downloads/DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md before code.
Canonical exact copy: docs/Feature/DMD_Service_Architecture_V1_Implementation_Handoff_2026-11-16.md.
SHA256: 8f3f3b0ec997927b686ec822de2741f8582ea57483fa37ffe8b3b588d317ddf7.
Main requirements reconciled; superseded Approved Decisions, Specification and Feature23 moved to archive and current files distinguish APPROVED / IMPLEMENTED / OPEN. See docs/Feature/31-service-v1-build-gap.md.

## Local commits
- 81509f0f68862abe2889c362673b8dc90f7bd7a6 — exact handoff + initial source/conflict/gap reconciliation before code.
- ee8ef23f1ac890bf8f78e4eac54bf65deb9b9ed6 — per-route/stage cancellation and actual-policy Admin support UI, no universal percentage.
- 7521ab39e4c6bc63ff397901e83777ce351e1897 — serialized direct reserve, idempotent exact retry, atomic replacement and rollback.
- 4c16063731638242e88cb4543a5e1e57098d4b20 — UPS divisor5000, strict (min,max] bands, deterministic SDS→VTT→JD ties after full formula.
Final source/scripts tested match 4c160637; subsequent edits are documentation/evidence only. No additional behavior change after the final verification run.

## PASS
Runtime: /Users/quan/.nvm/versions/node/v20.20.2/bin, arm64 native SQLite compatible.
- npm test: ALL DOMAIN SUITES PASS (53 suites), tests.log, tests.exit=0.
- Cancellation domain: 139 assertions. Configured TEST percentages for UPS/Yun/ePacket at the same ISSUED stage; missing route/stage, denied rule, shipment history, scoped Sales/Client, Admin support, fees/prior refunds, reserve release, retry, audit rollback.
- Supplier queue domain: 32 assertions; no Supplier money/cost side effects.
- Atomic reserve: 18 checks, five independent SQLite writers. Distinct Orders cannot reserve160 from100; same-Order concurrent retry audits once; replacement only consumes new total; failed funds/audit preserves original fields; ownership and terminal-state guards. atomic-reserve.log and final full-suite log.
- UPS calculator: 89 checks, full independent formula oracle, no monetary rounding, divisor, intervals, tie permutations and weight boundaries. Account publication:18 checks with globals/pending isolation.
- e2e-supplier-cancellation.cjs: 33 real HTTP assertions on owned temporary DB and localhost server using compiled Next app; six roles, concurrent cancel/follow-up retry, configured72.5% policy refund exactly once, missing-policy Admin override rejection and rollback. http.log, http.exit=0.
- npm run lint, lint.log, lint.exit=0.
- npm run typecheck, typecheck.log, typecheck.exit=0.
- npm run build (build-isolated.cjs disposable DB), build.log, build.exit=0.
- git diff --check.

Log files normalize terminal carriage returns and trailing whitespace only; test output content/results are preserved.

## Execution findings
Initial shell PATH omitted Node/npm. The first bounded full-suite command exceeded its command timeout; restarted through a tracked background process and obtained the complete final53-suite result. No partial run was treated as a full pass.
Typecheck initially saw generated duplicate .next/types/* 2.ts and * 3.ts, a known generated-directory issue. The isolated Next build regenerated clean types; final typecheck after that build passed. No source was modified to suppress type errors.
Standalone reserve fixture initially lacked a required Sales owner; fixed the TEST fixture and verified both standalone and final full-suite success.
The available workbook /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx was located read-only, not imported or certified byte-equivalent to the differently named canonical workbook. No raw Supplier rate table was copied into docs or activated.

## Push blocker
Automatic approval review rejected git push origin main for the initial documentation commit because it considered the remote/payload and shared default branch insufficiently confirmed. No push was executed; no alternate push route was attempted. All above commits remain local. Owner confirmation of the concrete final commit range and destination is needed before retrying the rejected action.

## Remaining approved work (not a completed V1)
Operational VND money storage/quote resolver/Purchase→Reserve/Charge/Ledger/Statement/report cutover; persisted Awaiting Funds + FIFO triggers and consent/scoped override; separate Edit Order/manual Selling offer/Financial Correction; Admin atomic Cancel & Duplicate; Client Add-on and cost/revenue corrections, cross-module reporting and full UI/role UAT.
Staged VND quotes still report purchase_eligible=false. Existing legacy USD cents were not relabeled VND.
Real Supplier policy/void, source Excel/zone provenance, ePacket fee VND/FX relationship and inclusive cost components remain dependent OPEN inputs. Missing implementation of an approved rule is not a new business question.
No Jenkins, production, deployment, carrier calls or operational DB reset. These checks certify the delivered increments only.
