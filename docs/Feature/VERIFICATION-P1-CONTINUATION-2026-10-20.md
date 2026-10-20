# P1 continuation — 20/10/2026

Status: verified incremental delivery; **not full GĐ1 acceptance**. Fetched GitHub and fast-forwarded clean main from `2a3e1d0` to requested baseline `bcc7ec085be01aedcfbabdbbc3771e20616bc812`. No audit rerun, unknown DB reset, production deployment, real carrier/bank action or `Codex/` change.

## Code and recovery

Bulk Tracking/Label now retains the Order's current sub-service when the request omits `sub_service`. Previously omission became an empty string and a purchased/versioned Order failed the locked-route check. Explicit supplied values still undergo the existing validation and route lock.

New `verify-bulk-recovery.cjs`, included in `npm test`, passes **19 assertions**. It creates its own disposable DB and invokes actual API route handlers: two purchased ePacket US one-carton Orders; an injected second-group tracking insertion failure rolls back the first group's tracking, reserve, charge and audit; explicit reselection succeeds; retry adds neither tracking nor charge. A separate partial Client purchase keeps the valid reserve, leaves the invalid Draft unreserved, does not auto purchase after correction/read, and succeeds only on explicit reselection. No Balance Adjustment is introduced.

`syncStatements` now prepares its existing-item lookup once per synchronization rather than once per debit entry. Financial rules, transaction boundaries and late-posting checks are unchanged.

## Executed checks

Node 20.20.2; Next 16.3.6 production build. Final `npm test` **27 suites PASS**, lint/typecheck/build **exit 0**, diff check clean. Logs in [evidence](evidence/p1-continuation-2026-10-20/).

- Order HTTP **33 assertions**: UPS three cartons/two lots, replacements, labels, status, scoped Client/Sales and Finance cost visibility.
- Manifest HTTP **16 assertions**: selected physical carton only, duplicate/replaced tracking rejection, real XLSX rendering.
- Order acceptance HTTP **42 checks**, zero failures, including incomplete carton/label coverage and atomic failed tracking save.
- Statement HTTP **39 assertions**: five-role login/scope, concurrent Finalize, no extra charge, Payment interest/principal/Balance ordering, signed Refund channels, late correction and BOD parity.
- Domain suites include Refund **60**, Payment Reconciliation **52**, Payment Adjustment **66**, Statement **78** assertions; existing injected rollback and independent writer retry cases ran again. These are domain/route-handler checks, not browser transactions or real bank evidence.

The four HTTP suites above ran on the rebuilt baseline before the two small source changes. The final production build was tested separately by the new HTTP load/financial/restore runner below; the new bulk regression invokes the final source. Do not describe all earlier HTTP suites as rerun against the final build.

## HTTP concurrency and restore rehearsal

Run `node scripts/rehearse-http-cutover.cjs`. It ignores inherited DB selection, creates a fresh temporary target, verifies the resolved directory and synthetic-only user inventory, checks integrity/FK, backs up with SQLite backup API and reopens the backup before HTTP writes. It never resets or overwrites any existing DB. Evidence remains at the exact paths printed in the log.

100 Clients × 100 Ledger debits = **10,000 entries**. Authenticated HTTP preview requests validate every closing and movement count. 200 requests per phase; latency includes response body/JSON; memory samples use asynchronous `ps` every 100ms.

| Concurrent requests | p50 ms | p95 ms | max ms | errors |
|---|---:|---:|---:|---:|
| 1 | 10.13 | 16.37 | 21.59 | 0/200 |
| 8 | 37.13 | 84.30 | 174.20 | 0/200 |
| 24 | 91.85 | 538.28 | 1228.52 | 0/200 |

Sampled server peak RSS **218.02 MB**, runner RSS **223.25 MB**. Before prepared-query reuse, the equivalent sample p95 was 20.23/106.70/668.59 ms and server peak RSS 300.56 MB. These are individual samples under variable host load, not a causal performance guarantee, endurance test or production SLA. Queue latency still grows with concurrency; higher volumes/imports/multi-instance contention remain unverified.

After load, actual HTTP commands convert $50 of negative Balance to Debt, post a $60 Sales Payment, finalize a $12 Claim, record $3 Refund to Balance and $11 to Bank. Assert one Debt account and closing **Balance −3700 cents / Debt 0 / Refund −200**, with Bank outflow **1100**. Twelve concurrent Finalize requests return the same snapshot and create one history row. No automatic Balance Adjustment.

Stop the server, take a post-write backup, restore into a **new file**, check all-table content digest equality, integrity `ok`, FK `[]`, restart the application using the restored path, log in again and compare the same History response and financial balances. Issued snapshot is identical including metadata. Source and backup DBs are retained, not deleted.

Final synthetic rehearsal target: `/var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-http-cutover-Dscgz5/synthetic.db`; backups `before.db` and `after.db`, restored target `restored.db` in that directory. This certifies this newly created target, not an unspecified deployment database. Full logs carry before/after digests.

An initial harness run incorrectly compared Finalize's financial snapshot to History's metadata-enriched response. It failed and was corrected to compare History before/after restore. That failed attempt is not counted as a PASS.

## Browser UAT scope actually observed

Real in-app browser at **1440×900 and 390×844**, not Chrome companion or physical mobile. Five role login/navigation smoke: Admin Orders; Sales scoped Orders; Client scoped UPS Order and expanded three-label popover; Finance Statement selector; BOD report entry. Screenshots exist for all five roles at both viewports, with selected DOM accessibility snapshots. Finance additionally selected the issued 20/10 Statement in a separate synthetic financial fixture: −$37 Balance / $0 Debt / $7 Refund, $2 Bank payout, next unissued period 21/10 and future Finalize disabled. This financial fixture is separate from the negative-Refund restore fixture above.

This is **focused browser smoke, not complete workflow UAT**. Mobile Orders uses horizontal table scrolling; the captured Client mobile viewport does not show the offscreen label popover. No claim of full mobile label usability, keyboard audit, five-role end-to-end purchases, Refund recovery browser acceptance or real carrier downloads. Screenshots/DOM were captured before the backend-only changes; UI source is unchanged.

## Remaining gates

1. Full five-role desktop/mobile workflow and error/reload/reselection acceptance. In-app browser is usable; missing Chrome companion is not a blocker to all browser work.
2. Priced UPS/Yun multi-carton/multi-lot Draft→purchase→reserve→charge→Manifest→status→Statement as one integrated flow. Current `purchaseService/orderQuote` only has versioned ePacket pricing; manual UPS/Yun flows are not evidence of this whole contract. The UPS HTTP fixture has zero sale price and cannot prove financial conservation. Yun integrated coverage remains absent. Do not reuse ePacket US one-carton rules as a generic UPS/Yun adapter.
3. Larger sustained/mixed write HTTP load, imports and deployment-equivalent hardware/SLO acceptance. This run adds 10k-entry HTTP concurrency, not unlimited load certification.
4. A separately selected deployment target needs its own provenance/backup/restore and financial reconciliation. No unknown existing DB was selected or erased.
5. Owner-approved real prices, carrier/cancellation evidence, Supplier/FX/bank documents and supervised pilot. See [pilot checklist](PILOT-CHECKLIST-2026-10-20.md). No real labels/transfers/deployment were performed.
