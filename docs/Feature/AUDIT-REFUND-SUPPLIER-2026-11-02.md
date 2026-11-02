# Refund Adjustment and Supplier UAT — 02/11/2026

Status: validated local changes; synthetic acceptance only. Baseline inspected: main at b380bc6. Existing untracked Codex/ was preserved. No deployment, operator DB reset, Supplier Statement/period lock, unidentified-money book or spreadsheet enhancement. Manual Orders MAX 20 is unchanged.

## Reproduced P1 and repair
A disposable probe loaded the actual b380bc6 RefundService through git show. Approved $10 → Bank payout $10 → decision $0 → Admin Balance recovery $1 succeeded with Balance $0 → -$1 and Refund -$10 → -$9. This reproduced an unfunded debit contrary to the funded-only requirement.

The existing service now checks signed net Balance in the immediate transaction before posting linked ADJUSTMENT_DEBIT / RECOVERY. It uses ledger plus the existing outstanding restructured-principal exclusion; Credit Limit cannot fund recovery. Regression covers zero/insufficient/exact funding, net versus raw ledger with existing Debt/interest, replay, batch rollback and competing SQLite writers. No automatic collection or new Debt.

Both Admin and Finance can choose Balance or Bank recovery in UI/API, bounded by the current negative Client pool with positive integer cents. Ordinary payouts remain Finance-only; Admin cannot hide one inside a batch. Bank receipt requires date/accounts/reference/proof. Balance reference is saved or defaults to actor/request-key. Admin/Finance can inspect evidence; Client/Sales stay redacted. Existing audit, notifications, journal and receipts are reused without a replacement engine or schema cutover.

## Actual results
| Check | Result |
|---|---|
| npm test | PASS, 42 domain suites including new Supplier oracle |
| Latest targeted Refund domain/API | PASS, 102 assertions |
| Linked workflows | PASS, 489 assertions / 80 fixed-seed independent oracle steps / restored synthetic copy |
| Supplier accounting oracle | PASS, 13 assertions |
| npm run lint / npm run typecheck | PASS |
| npm run build | PASS, build-isolated.cjs with a dedicated build DB |
| Expense/Refund real HTTP + Chrome | PASS, 41 assertions, actual Admin Balance / Finance Bank recovery; both channel choices for both roles; desktop/mobile; no runtime errors |
| Supplier/Client Chrome | PASS, 22 assertions, desktop/mobile |
| Order HTTP | PASS, 36 assertions in each of two separate fresh DBs |
| Operations HTTP | PASS, 23 assertions |
| Finance HTTP | PASS, 20 assertions |
| git diff --check | PASS before commit |

The full 42-suite run preceded five final Debt/funding assertions; the latest targeted Refund run passed all 102. Lint/typecheck were rerun afterwards. Application source did not change after the isolated build.

Full suites cover RBAC/privacy, Order/Pricing/Purchase snapshots, tracking/label/charge/retry, cancellation, tax/surcharge, Claims/Refund, Balance/Debt/interest, immutable Statements/late journal, Supplier cost/reconciliation/payables/accounts, BOD, Sales monthly and Internal Expenses. This verifies encoded synthetic cases, not every possible workflow or production acceptance.

Local evidence:
- Full test log: /tmp/dmd-20261102-final-tests.log
- Build log: /tmp/dmd-20261102-build.log
- Browser screenshots: /tmp/dmd-20261102-browser-evidence and /tmp/dmd-20261102-supplier-browser
- Final Refund/Expense fixture/server log: /var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-expense-uat-kwwV52
- Order/Operations/Finance DBs/logs: /var/folders/x6/q7g3prc91cng1tjxqpd64yvc0000gn/T/dmd-http-20261102-IRo5Qb

All DBs are newly owned temporary fixtures. The default operator DB was not reset or selected. Synthetic servers were stopped; no remaining UAT server was found at final inspection.

## Independent Supplier expected values
New regression: scripts/verify-supplier-accounting-oracle.cjs, registered in verify-all.cjs.
| Step | Supplier Balance cents | Receivable cents | Documentary invoice outstanding cents | Actual GP cents |
|---|---:|---:|---:|---:|
| Cost $100 confirmed, invoice $100 | -10000 | 0 | 10000 | 5000 |
| Partial Account payment $40 | -6000 | 0 | 10000 | 5000 |
| Claim $30 approved | -6000 | 3000 | 10000 | 5000 |
| Payable offset $20 | -4000 | 1000 | 10000 | 5000 |
| Bank refund $10 received | -4000 | 0 | 10000 | 5000 |
| Late cost $15 | -4000 | 0 | 10000 | 3500, not finalized |
| Explicit allocation adjustment -$15, cost reviewed | -5500 | 0 | 10000 | 3500 finalized |

Revenue $150 − cost $115 = GP $35. Invoice never duplicates cost. Payment/offset/Bank refund never creates another GP gain or Client money movement. Retries post once and the same bank reference is rejected across Account/legacy Payables. Late cost reopens Review; original cost-confirmation history stays immutable. Explicit Supplier allocation adjustment is not a second commercial cost.

Linked workflows independently verify immutable issued Client Statements, posting-period late adjustments, BOD gross cash paid versus recovered, and Sales processing-month obligation revisions.

## Remaining limits and failed attempts
- No new Supplier P0/P1 reproduced. The documentary invoice and Supplier Balance books require explicit reviewed opening/reconciliation: Account payments/offsets do not automatically allocate invoices. Do not sum their liabilities or fabricate another bank posting to make them agree. No wizard/period close added.
- Component/multi-Supplier/late allocations still require explicit evidence; no automatic historical cutover, FX inference, external bank reconciliation or real carrier acceptance.
- Bank evidence is text. Production data, real supplier statements, every role/device and deployment acceptance were not exercised.
- Initial PATH lacked Node. Installed Node 22 was x86_64 against arm64 SQLite; reported passes use existing arm64 Node 20.20.2. No dependency installation/rebuild.
- One connector browser request timed out and is not counted as PASS. Direct local runs completed. New UAT initially selected a mobile button on desktop and attempted a Balance read using Finance, which existing RBAC denies. It now selects the desktop button and uses a separate Admin read for the accounting check. Final UAT passed; product permissions were not widened for those test assumptions.
