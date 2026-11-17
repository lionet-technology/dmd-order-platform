# Local workspace verification and VND continuation — 17/11/2026

Canonical repo: `/Users/quan/Developer/report`. Starting HEAD and freshly fetched origin/main: `16fecf75b07de5f9fc192e0af13c30f427b7f5a8`. Copy and runtime findings: [AUDIT.md](AUDIT.md).

## Delivered
- Confirmed copy complete against readable old copy and all 147 old reachable commits; physical tracked files, Git objects and final workbook are usable. No missing/corrupt tracked data. Adopted Developer/report; README and unstaged owner AGENTS documentation root updated. Historical evidence retained. No old-source synchronization.
- Documentation-first scope commit: fb0e913.
- BOD-only VND report now adds Order-level and historical-Sales/group manual commission inputs, exact fractional revenue/GP, per-Order positive GP before aggregation, explicit cancellation exclusion, missing Base/attribution review and unavailable Claim-derived totals. Purchase-month performance remains separate from posting-month cash. Report reads share a consistent deferred transaction and do not write financial state.
- UI shows the inputs and limitations; existing permissions remain BOD-only. No commission rate, payout, Claim allocation or legacy USD reinterpretation.
- Source: src/lib/vnd-commission.ts, src/lib/vnd-reporting.ts, src/app/vnd-tools.tsx. Feature 36 and dependent index/report docs updated.

## Verification on final application code
- npm test: PASS, 60 suites (test.log).
- New commission suite: PASS, 21 assertions; fractional oracle, positive/negative Orders, sum of per-Order floors, cancellation, missing Base, uncharged exclusion, missing attribution, historical Sales, month boundary and read-only ledger/Statement/request parity (commission.log and test.log).
- npm run build: PASS (build.log), disposable build database.
- npm run typecheck: PASS (typecheck.log).
- npm run lint: PASS (lint.log); rerun after final browser harness edits.
- Actual Chrome: PASS, 19 assertions, five authenticated roles, owned disposable DB and localhost production build (browser.log/browser-uat.json). Existing Add-on/privacy/Statement/edit workflows and BOD commission table; Admin/Finance/Sales/Client report requests denied. Desktop/mobile no page overflow, no page errors. Desktop and focused mobile BOD screenshots visually inspected. An initial full-page mobile capture tiled during resize; replaced it with a focused viewport capture and reran browser successfully.
- git diff --check: PASS.

The first foreground full test attempt reached its 60-second tool limit; rerun via the recorded background runner completed all 60 suites successfully. Initial Node/PATH and architecture failures were environment selection issues, resolved with existing ARM Node 20.20.2; no dependency installation or rebuild. No application changes after the passing build, only browser harness capture/authorization checks and docs.

## Preserved / remaining
Owner-modified AGENTS.md remains unstaged with only its requested canonical-path adjustment; Codex/ remains untouched/untracked. Workbook/source JSON, Jenkins and production are unchanged. No operator database reset, external Supplier call or deployment.

Full V1 remains PARTIAL: Claim/Refund VND pool/execution/recovery, Supplier actual/payable/claim cutover, refund-category commission totals/revisions and comprehensive pilot/manual UAT. This increment supplies bounded manual commission inputs, not full commission acceptance. Carrier/Supplier policy and real-data evidence remain required only for dependent flows. Old USD modules are not certified for VND.

All new documentation and evidence are under the canonical Developer repo. Task code/evidence will be committed by explicit path and pushed by ordinary fast-forward only; final chat records verified resulting SHAs.
