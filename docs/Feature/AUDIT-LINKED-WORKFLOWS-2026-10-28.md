# Owner continuation — 28/10/2026
**Base:** main `f7b1083`. **Status:** implemented candidate; synthetic verification, no production acceptance. Existing `Codex/` and user data preserved.

## Changes and reproducible findings
- Manual Order input: MAX 20 rows for Client and Admin/Sales, including paste/add/clone/Enter. Oversized paste rejects the whole paste. Server checks Client JSON and new Admin/Sales manual-batch endpoint before processing. Admin/Sales retain existing per-row authorization and partial-success behavior. File CSV/XLSX remains bulk (Client <=1000 Orders), reparsed from multipart on preview/save; a JSON source flag grants no exemption. Other spreadsheet paths are unchanged.
- **P1 — stale displayed purchase price:** Draft showed one version but purchase silently re-quoted another. Client now sends the saved quote key; comparison happens inside the Reserve transaction. A changed quote rejects and requires explicit reload/reconfirmation. Accepted-purchase lost-response retries preserve the original snapshot. Legacy/domain callers without keys retain re-quote compatibility; no claim of universal quote-consent enforcement.
- **P1 — silently accepted changed Supplier feed:** reuse of a source key with a different cost returned an old successful result. Normalized source fields, amounts and direct Lot are now compared; conflicts reject and require an audited cost adjustment. Exact reimport may have a new batch ID and still posts once, including after Supplier enum deactivation; new inactive-Supplier sources remain blocked.
- **Financial recovery gap:** downward revisions already produced negative Refund Balance without auto-debit. Existing explicit Admin recovery used wallet only. Finance can now record actual **Bank recovery** with positive cents, executed date, reference, accounts and proof, bounded by the negative pool. It changes Refund only, never wallet/Payment/Debt/Commission. Bank and wallet recoveries serialize against the same pool. Gross cash paid and cash recovered remain separate in Refund/BOD/Statement UI.
- Minimal Admin alerts: failed purchase reserves/jobs, active Labels with still-reserved Charge, unresolved monthly Statement close reviews; no auto retry or hidden money mutation. Backup monitoring explicitly NOT_CONFIGURED.
- Test fixture repair: Statement suite pinned its business clock but issued login sessions expired against SQLite's real current clock. Test-only sessions now get a stable future expiry. Production auth is unchanged.

## Independent linked scenario
`scripts/verify-linked-workflows.cjs` owns a new temporary DB and uses real domain/API commands. Base 10 USD, 20% markup, zero discount gives a known 12 USD sale; 5 USD estimate, 20 USD actual and a separate reviewed 3 USD surcharge give -5 USD commercial GP. A 25 USD late actual reopens review with -10 USD actual GP. Supplier tax/surcharge feed metadata never auto-charges the Client.

A 100 USD Payment, 12 USD Charge, 3 USD surcharge, 6 USD actual Balance refund and explicit 2.50 USD Balance recovery leave **88.50 USD wallet**. 10 USD approved, 6 USD Balance + 4 USD Bank paid, revised approved total 3 USD, recovered 2.50 USD leave **-4.50 USD Refund**. That issued Statement remains byte-identical after late cost and obligation corrections. A later actual Bank recovery changes Refund/cash only; Commission follows approved revisions, not cash settlement.

Includes stale preview, deactivation between preview/purchase, interrupted purchase and Charge rollback/retry, frozen snapshot, mixed channels, overpayment rejection, bank recovery, signed late-period correction, approved/pending negative GP, supplier source conflicts, role privacy, VND internal due installments/partial payments, 80 fixed-seed accounting-oracle steps, FK/integrity checks, and online SQLite backup restored to a distinct copy with every table compared.

Concurrency coverage also lives in existing suites: competing purchases/headroom, distinct Bank/Balance payouts, distinct Bank/wallet recoveries, repeated exact receipts across SQLite connections, Sales attribution races and expense installment races. The linked suite also races independent route/purchase SQLite writers: one simultaneous release plus both controlled writer orderings, recording route-active state at the exact Reserve insert. This is a linearizability regression, not an unbounded route-mutation load benchmark.

## Data and deployment boundaries
Owner confirms historical data is TEST; no legacy migration is requested for a new verified target. This run does not reset an existing DB, infer old financial openings, activate `fc_*`, modify prices/credentials in the user's runtime, or operate a bank/carrier. Build uses its disposable DB wrapper.

Backup rehearsal is synthetic COPY-only. A deployment-target restore, scheduled backups, retention, destination credentials, off-host monitoring and responsible operator remain deployment acceptance work. The app health endpoint is a liveness probe, not proof of financial reconciliation or backup freshness.

## Deliberate remaining scope
- **Unidentified incoming-funds pool:** current Payment workflow requires identified Client ownership and immediately affects wallet/Debt. Unowned legacy ledger rows have no reviewed allocation/reversal state. No safe existing waiting-pool adapter was found; a dedicated receipt/allocation ledger is required. Do not represent unknown receipts as arbitrary wallet credits.
- **Supplier close/reopen:** append-only Supplier account/cost/Claim corrections exist, but there is no defined immutable Supplier-period close object. No invented close/reopen flag or retroactive payable rewrite. Confirmed cost corrections need explicit signed account adjustment and allocation evidence.
- Real provider connectivity, approved rates/cancellation policy, FX and tax/cost mapping, Supplier late-cost allocation, company bank reconciliation, production scheduler/escalation and real-data acceptance remain open.
- Public Order APIs and legacy callers without quote keys are not universal consent-token enforcement; Client UI is protected.
- Manual batch keeps existing partial success and duplicate-Order handling; it is not a new exactly-once Order-creation protocol.

## Real-data acceptance gates
1. Verify target DB identity/owner; create and restore a consistent backup to a separate path. Use a fresh TEST target rather than resetting an unidentified DB.
2. Approved rate and cancellation matrix; actual Supplier template/Label/Tracking, tax and cost coverage evidence; verify all relevant roles with real policy data.
3. Reconcile wallet, reserve, Debt, signed approved Refund, actual Bank/Balance settlements and Supplier exposure independently. Test a downward approved revision and both explicit recovery channels.
4. Finalize one real acceptance period; apply a late cost/payment/refund correction in the next period; prove original bytes and opening/closing chain stay unchanged.
5. Verify BOD commercial/cash and Sales monthly inputs; keep VND expenses separate from USD GP until approved FX rules exist.
6. Configure backup schedule/retention/monitoring and failed-job/statement escalation; run restore/startup rehearsal on deployment infrastructure.
7. Owner pilot acceptance before claiming production readiness.

## Verification results
- `npm test`: **41/41 suites PASS** on the final source; linked scenario **489 assertions PASS**, including independent route writers, exact Supplier retry after deactivation, cash-date/posting-date separation and operational-queue invariants.
- `verify-manual-order-limit.cjs`: 19 assertions; exact 20, rejected 21, forged import flag, CSV/XLSX >20, per-row authorization and partial success.
- `verify-refunds.cjs`: 83 assertions, including independent competing Bank/wallet recoveries, evidence, role privacy, HTTP retry and outbox rollback.
- `verify-owner-http.cjs`: all 10 owned HTTP suites PASS (Order 36, Operations 23, Finance 20, Manifest 16, Cancellation 86, Credit 18, Manual 31, Statement 39, Balance Overview 140, Finance List 22 assertions). Manual suite includes concurrent Tracking/price retries.
- `e2e-manual-order-limit.cjs`: 46 HTTP/browser assertions PASS, 1440px and 390px; Client manual 20/file 21, Admin paste/add/clone guards, real server batch guard/partial success, Finance Bank recovery and BOD separate gross cash totals. No runtime browser errors.
- `e2e-expenses-refunds.cjs`: 30 HTTP/browser assertions PASS, BOD/Finance installment creation/edit/partial payment/reversal, concurrency and role checks; screenshots retained under this audit's directory. Earlier screenshots remain unchanged.
- `rehearse-http-cutover.cjs`: 100 Clients ×100 ledger rows; 600 HTTP previews, zero errors at concurrency 1/8/24, p95 10.12/85.74/552.32ms. Twelve concurrent finalizations returned one identical snapshot. Eight Bank-recovery retries posted once. Restored copy has equal all-table digest, integrity OK, zero FK violations, identical Statement and -3700-cent wallet. Sampled server RSS 247.7MB; this synthetic single-instance run is not a production capacity guarantee.
- Typecheck, lint (zero warnings) and isolated build PASS. No package installation/dependency change.
- Test-only benchmark fixture was updated from obsolete overpayout behavior to approve enough first, then revise downward. Fixed-port restore harness now refuses an occupied port before any HTTP request.
- Environment: repository's Node 20.20.2 ARM runtime matches installed SQLite. Node 22 x86 cannot load that ARM native addon. Installed Chrome failed the browser-control handshake; Brave/Chromium completed the browser suites using temporary profiles. No personal browser profile was used.

[Structured evidence](evidence/linked-20261028/verification.json). Screenshots: [Client mobile](evidence/linked-20261028/client-limit-390.png), [Admin mobile](evidence/linked-20261028/admin-limit-390.png), [Finance recovery](evidence/linked-20261028/finance-bank-recovery-390.png), [BOD cash](evidence/linked-20261028/finance-bod-cash-390.png).

No P0 was reproduced in the exercised synthetic scenarios. This is not proof that every production combination is error-free. The two P1 findings and recovery gap above have regression coverage; remaining deployment/real-data gates are listed explicitly.
