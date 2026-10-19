# Continuation audit, Refund implementation and UAT — 20/10/2026

**Full DMD financial build: INCOMPLETE. Local implementation only; no production release, new commit or push.**

## Verified starting point

Fetched `origin/main` successfully after retrying the sandbox DNS failure with network access. Local HEAD and fetched origin/main both equal `917ed9c8f8281ef655f29c4740387e5f8dced3f0`. Main includes the earlier manual Debt-conversion negative-Balance guard, Client balance overview and bulk-purchase work; file presence was not used as proof of the new Owner rules.

The earlier Work left uncommitted `src/lib/financial-core/`, its 79-assertion suite and docs. It had not imported that core into application routes. Actual `credit.ts` still allocates Payments into Statements, derives receivables from Statement paid/unpaid and requires Statement selection for Debt. Actual `claims.ts` automatically credited refund/compensation to Balance. Finance's existing workspace was Supplier-focused. Those were verified code discrepancies, not assumptions based on earlier status messages.

## Implemented in this continuation

- Replaced application Claim financial finalization with append-only signed Client refund obligations and revisions; current Claim UI supports incident categories and entering a new total. Decision updates no Client wallet funds.
- Added authenticated `/api/refunds`, dedicated Finance payout sheet (atomic batch), private bank evidence/history, warning-only over-refund, Admin-only partial recovery and Client/Sales durable in-app notifications/read acknowledgement.
- Actual Balance refund/recovery links an immutable wallet posting to the refund event in one transaction. Actual Bank payout has no Client wallet entry. No fc_* account or second wallet balance is activated.
- Added BOD/Finance refund exposure/flow report with separate positive and negative Client exposures, Balance versus Bank channels, category corrections and drilldown. Legacy Clients needing reconciliation are explicitly flagged; their unknown historical obligations must not be treated as complete zero liabilities.
- Updated actual-claim-paid Control Tower projection for new payouts without counting Claim decisions twice. Excluded Refund recovery from legacy service-fee receivable materialization. Corrected public wallet projection to signed net Balance and refresh after refund/recovery.
- Updated demo fixture to make an explicit Finance actual payout after the Claim obligation; kept existing synthetic-only reset guards and backup. Added a separate browser seed which always creates a new isolated database.
- Updated Feature, decisions, operational flow, roadmap and migration/UAT docs together. Historical sections remain labeled by the current-status override and new feature document.

## Automated verification

Final results are recorded after the commands finish; see the final evidence below. Test database creation is independent of operational DB paths. `verify-refunds.cjs` imports the real route handlers with real session authentication, not mocked permission results.

Coverage includes: Claim revision conservation; no automatic wallet credit; exact cents and rejection of sub-cent Claim amounts; signed overpayment; immutable originals/ledger/audit; retries/payload conflict; four independent SQLite writer connections issuing 40 identical payouts with one credit; rollback when any batch row or notification insertion fails; Finance/Admin/Sales/Client/BOD/Warehouse boundaries; cross-Client restrictions; bank-account privacy; executed-date validation; partial recovery/no excess recovery; recipient-only acknowledgement; category reclassification/report parity; migration refusal for old-format Claims; explicit incomplete-history report flags; refund recovery not becoming a service charge; signed public wallet projection.

## Browser evidence (synthetic DB only)

The browser seed created `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-refund-browser-Zc0WKm/synthetic.db`, a new temporary DB with synthetic users `uat.admin`, `uat.sales`, `uat.finance`, `uat.client`, `uat.bod`. Local server was bound to `127.0.0.1:3120`; it was stopped after UAT. No financial action reached a real bank or external payment service.

| Role/scenario | Observed result | Evidence |
|---|---|---|
| Finance Balance payout | Obligation $12 → payout $15 → Refund Balance −$3, warning without blocking | [Screenshot](evidence/refunds-2026-10-20/finance-over-refund.png) |
| Finance Bank payout | Free-text source/destination, proof, reference and date accepted; $2 bank payout → Refund Balance −$5; wallet stayed $15 | [Screenshot](evidence/refunds-2026-10-20/finance-bank-history.png) |
| Admin partial recovery | Two explicit $1 recoveries → Refund Balance −$3 and net wallet $13; no automatic recovery | [Screenshot](evidence/refunds-2026-10-20/admin-partial-recovery.png) |
| Sales | Assigned Client balance/history/notifications, no payout or recovery form | [Screenshot](evidence/refunds-2026-10-20/sales-refund-notifications.png) |
| Client | Own history; Bank account details hidden; recipient acknowledgement removes that unread action | [Screenshot](evidence/refunds-2026-10-20/client-history.png) |
| Client mobile | 390×844 viewport: current signed balance, scrollable history and notifications available | [Screenshot](evidence/refunds-2026-10-20/client-mobile-notifications.png) |
| BOD | Read-only report: $0 owes / $3 overpaid, $15 Balance refunds / $2 Bank outflow, LOST $12; drilldown lists all five events | [Screenshot](evidence/refunds-2026-10-20/bod-refund-report.png) |

Browser testing found and fixed stale Balance overview after recovery and the old unallocated-credit wallet projection. The early temporary UAT DB contained two recovery rows materialized by the legacy Statement path before the exclusion fix; later isolated final-domain tests verify zero service receivable for recovery on a fresh DB. The old Claim-era automatic-credit help text was also replaced. Bank date entry required a native keyboard change after automated fill; a successful actual-bank payout was then observed. Full browser re-run of every scenario after the final small validation/report changes is not claimed.

Not exercised in browser: Admin Claim revision end-to-end, Finance multi-row rollback, concurrent tabs, mobile Finance payout sheet or new Payment/Debt/Statement screens. Their applicable domain/API cases are tested, but this is not full Owner UAT.

## Migration, safety and release blockers

- No operational DB reset, migration or seed. Existing DB provenance is still unverified; only newly generated independent synthetic databases were used. `sources/` and `Codex/` unchanged.
- New Refund schema is additive. A Client with old `claim_decisions` cannot record new obligations/payouts/recoveries until a reviewed opening-balance migration exists. Readable backup/restore and historical reconciliation remain pending. No automatic backfill guesses how old credits were executed.
- **Payment reconciliation and adjustment are still legacy/incomplete in application.** The isolated FinancialCore has primitives but Sales Payment operational writes still allocate into Statement/FIFO. No new detector was added.
- **ONE Debt account independent of Statement is still incomplete in application.** Old manual Debt UI/action still selects a Statement; terms and purchase checks still use legacy aggregates.
- **Statement option A is still incomplete in application.** No activated immutable financial snapshot containing opening/closing Balance, Debt and Refund Balance; dispute derivation/late-adjustment adapter still needed. Refund recovery is now kept out of old fee receivables, but full recovery/bank movements in finalized snapshots still require the cutover.
- **Full BOD financial report remains incomplete.** Dedicated signed refund report is implemented; unified Payment/Debt/Statement financial reporting still needs reconciliation.
- Legacy generic ledger/import paths are not retired; not all money can yet be required to use the new typed workflows. This and the old Statement lifecycle prevent treating the platform as Owner-approved financial release.
- Production migration/restore, operational notification transport beyond in-app, real carrier/policy/pricing acceptance, and full multi-role end-to-end financial UAT remain open.

## Final gate results

- `npm test`: **22 suites PASS**; new Refund domain/API suite **60 assertions PASS**; isolated replacement FinancialCore **79 assertions PASS**.
- `npm run lint`: **PASS**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS** on a newly created `/tmp/dmd-refund-release-build.*/build.db`, including the new Refund API. The final lint → typecheck → test → build → diff-check command used fail-fast execution and exited 0.
- `git diff --check`: **PASS**. New source/docs files were also checked for trailing whitespace and merge markers; captured command logs retain their original progress formatting.
- No changes to `Codex/`, sources or package dependencies; operational DB untouched. No new commit or push. Local HEAD and fetched `origin/main` remain `917ed9c8f8281ef655f29c4740387e5f8dced3f0`.

Raw [test log](evidence/refunds-2026-10-20/domain-api-tests.log), [lint log](evidence/refunds-2026-10-20/lint.log), [typecheck log](evidence/refunds-2026-10-20/typecheck.log), [production build log](evidence/refunds-2026-10-20/production-build.log).

Passing these local gates validates the implemented subset; it does not satisfy the outstanding full-build integration, migration and UAT requirements above. No commit/push is performed merely because adapter tests pass while those requirements remain incomplete.
