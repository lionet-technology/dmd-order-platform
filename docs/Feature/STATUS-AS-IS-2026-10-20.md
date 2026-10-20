# DMD as-is audit — 20/10/2026

## Verified starting state

- Repository: `lionet-technology/dmd-order-platform`, `main`. Fresh `git fetch origin` succeeded; `HEAD` and `origin/main` both `bf32ec844983921e62ebf0f83d22cfac75be7cf2`, divergence 0/0, clean working tree.
- Found the latest handed-over Work result and verified its commit locally: Statement V2 was delivered after `43426ce`. It is not still an unreported pending implementation.
- Inspected active schema/projection, Statement API/UI, Payment allocation paths, Feature docs and verification/UAT scripts. No `reports/` directory exists; evidence is in `docs/Feature/`.
- Completed in source: operational immutable snapshots, posting-period carry-forward, signed three-account balances, Debt-first Payment receipt, Claim dispute projection, scoped API/UI and BOD period parity. `fc_*` remains isolated.
- Previous recorded evidence: 26 suites, 73 Statement assertions, 32 HTTP assertions plus scoped browser checks. These are prior-run evidence until rerun below.

## In progress in this continuation

- Re-run full regression, lint, non-incremental typecheck, production build and isolated HTTP/browser checks.
- Make consecutive period selection practical in UI; expose next period boundary, captured references and protect Client switches from stale responses.

## Open gates / blocked scope

- Legacy schema/Claim/allocation migration and pre-checkpoint history remain unverified. No populated database reset or migration is authorized by provenance evidence from this audit alone; use newly generated synthetic fixtures for checks.
- Complete role/device acceptance, production volume performance, operational restore rehearsal and real pilot rates/carrier/bank evidence remain open. Client refund bank totals do not certify enterprise bank/Supplier reconciliation.
- No new unresolved business rule was found in the Statement continuation. Production acceptance is not inferred from automated tests.

## Current-run evidence

- Baseline rerun: **26/26 suites PASS**, Statement **73 assertions**. After implementation: **26/26 suites PASS**, Statement **78 assertions**, including four independent connections / forty concurrent Finalize retries, immutable snapshots, no repeated charge, late corrections, three-account conservation and BOD parity.
- Final ESLint: PASS with no warnings; `npm run typecheck -- --incremental false`: PASS; final production build: PASS. `git diff --check`: PASS.
- Production localhost `3131`: expanded Statement HTTP suite **39 assertions PASS**, then rerun **39 PASS on restored synthetic backup** with final build. All five roles read permitted history/next boundary; Sales/Client/BOD cannot Finalize, future Finalize denied, concurrent retries return identical bytes, true Bank outflow remains separate.
- Exact scenario: fee $100, Debt conversion $50, Payment $60 ($50 Debt / $10 Balance), Refund Balance $3 and Bank $2 from $12 Claim obligation. Issued Balance −$37 / Debt $0 / Refund $7, Bank $2. Late $1 fee leaves issue unchanged; next preview opens −$37 and closes −$38 with just the late fee, Refund $7 unchanged.
- Desktop browser: Finance selected Client, automatically received 21/10 after issued 20/10, previewed late movement, Finalize disabled for future period, captured Credit Limit/Reserve displayed separately. Sales and Client loaded scoped history without Finalize; BOD selector/history had no Finalize; Admin loaded history with Finalize control and corrected **Xem Payment / Debt / Balance** label. This is focused Statement role coverage, not complete end-to-end acceptance of every workflow or mobile role matrix.
- [Saved final period-flow screenshot](evidence/2026-10-20-statement-next-period.jpg) shows disabled future Finalize and reconciled late-fee carry-forward. It was captured before the final unrelated Admin detail-label correction; the final Admin label was subsequently verified in browser.
- Newly generated fixture: `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-refund-browser-OvnD3M/synthetic.db`, produced by `seed-refund-uat.cjs`; five synthetic users, initially zero Ledger rows and a $12 synthetic Claim obligation. Consistent SQLite `.before-uat` backup reopened read-only with integrity OK. Restored via SQLite backup API into a new `restored-uat.db`; integrity OK, foreign_key_check empty, same five users and zero Ledger rows before running the final HTTP scenario. No original file was overwritten/deleted. This rehearsal proves only this fixture, not operational disaster recovery.
- No existing application data reset, `fc_*` activation, deployment, `Codex/` or synced `sources/` edits. Local UAT server stopped after verification.

## Next implementation order and risks

1. Verify exact populated DB provenance/schema/legacy counts on a backup and rehearse a controlled migration or proven-synthetic reset/reseed. Historical Statement allocation / legacy Claim / NOT NULL Debt-source guards remain; snapshots before checkpoint are unavailable. No such live DB was certified by this run.
2. Complete remaining multi-client, mobile/device and load/long-history acceptance. Focused desktop Statement checks now cover all five requested roles; arbitrary in-flight browser response timing has not been deterministically simulated.
3. Reconcile pilot service rates/carrier evidence and Supplier/company bank statement scope, then deployment/Owner acceptance. No new business-rule question blocks the changes delivered here.
