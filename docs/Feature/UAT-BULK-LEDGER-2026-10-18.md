# Bulk purchase & Balance Ledger — 18/10/2026

Baseline: `4a836ea`, fast-forward from GitHub main. **Partial internal acceptance; not production approval.**

## Environment

Independent checkout `dmd-uat`; fresh `.smoke/internal-uat-test-ledger-oct18.db` created with guarded internal seeder; additive `seed-bulk-ledger-uat.cjs` strictly requires this exact test path and NODE_ENV=test. No production DB, synced sources or `Codex/` changed. Existing port 3000 process left untouched; this build uses 127.0.0.1:3121. Synthetic credentials use Demo12345!, never production accounts.

17 Clients: original 15 plus `uat.partial` ($15 opening Payment, zero credit) and `uat.overdue` ($50 historical fee, no payment). Original fixture contains 544 Orders, reserves, manual lock and multiple service structures. Additional Orders below were created through browser, not counted from seed.

## Implemented

- GET `/api/financials?view=overview`: Admin all Clients; Sales exactly assigned Clients; Client/Finance/BOD/Warehouse denied. Summary only: Wallet, Credit Limit, AR, overdue AR, reserves, available-to-buy, blocking reasons and historical allocation warning count. Existing accountFinancials remains authoritative, including existing FIFO/interest materialization on read; this is not a new accounting calculation or read-only SQL snapshot.
- Search name/username; filters blocked, overdue, room <=0, legacy reconciliation warnings, reserves; drill-down to existing transactions/allocations/statements/debt. Desktop table; mobile cards under 640 px.
- Financial forms review Client/current amounts/inputs before submission. Response includes `before_summary` acquired inside the same immediate transaction as the existing command, and actual after values. Retry shows current before/after, not a fabricated repeat of the original effect. Existing request keys and permission rules retained.
- Bulk Balance sheet shows account context before entry, validates and reviews each entered row, then rereads account values after attempts. Batch before/after is an observed interval and can include concurrent activity; it is not a per-command receipt or prediction. Empty default rows no longer require removal. Successful rows clear; failed rows retain errors/request keys. No direct balance overwrite introduced.
- Queue bug found by browser: arbitrary manual lock text was classified SYSTEM. Account eligibility failures now classify DATA independently of the user-entered reason; missing template/config errors retain SYSTEM classification.

## Browser UAT actually executed

| Case | Observed result |
|---|---|
| Client uat.partial creates TSV batch | LEDGER-UAT-1..3 at 0.2 kg, price $8.26 each; LEDGER-UAT-4 at 12 kg saved as Draft, purchase checkbox disabled with weight reason |
| Buy selected three with $15 | 1 success; two distinct insufficient Balance errors; success retained; failed Drafts available for manual retry; no auto-retry |
| Admin READY | LEDGER-UAT-1 present; Client unpurchased Drafts 2/3/4 absent from both queues |
| Export selected one | Downloaded Purchase_ePacket_Standard_DMD_1-orders.xlsx; ExcelJS parser found only LEDGER-UAT-1, excluded 2/3/4 |
| Tracking/Label | Entered LEDGER-TRACK-001 + local demo label; save reports 1 Order; READY count 38 ->37 and row disappears |
| ISSUES | Invalid weight reason visible, checkbox/Tracking disabled; custom lock reason misclassification found and fixed; automated retest checks DATA |
| Ledger desktop/mobile | All account columns, manual-lock filter and drill-down; 390x844 width=390, mobile card shows six amounts and reason; overdue filter identifies $50 account |
| Financial form | $20 additional fee: review shows Client/current values, submit shows Wallet $7.74 ->0, AR 0->$12.26, available $7.74 ->-$12.26 |
| Bulk Balance | One $1 Payment to uat.partial; review shows account and AR; submitted through browser. Final retest details below |
| Sales | Login epacket.sales; Ledger select contains only assigned Clients (7 after added fixtures), no Admin controls |

Evidence: project `outputs/bulk-ledger-uat/`, screenshots and exported workbook outside Git. Browser engine/viewport tests are not physical mobile/Safari tests. Carrier labels/purchases are synthetic.

## Automated verification

See final appended results. Domain tests, HTTP tests and DB audits are distinct from browser operations above. HTTP test `scripts/e2e-balance-overview.cjs` checks summary parity, role boundaries, account lock classification, unpurchased draft exclusion, simultaneous same-key Payments, mismatched payload rejection, atomic before-summary and fee retry.

## Open acceptance / Owner decisions

- Physical mobile, scanner/printer, real supplier labels/rates, legacy DB migration rehearsal, approved FX/cost coverage and existing credit/cancellation policy gates remain open.
- No network-offline UI or two simultaneous human browser sessions verified. Concurrent HTTP requests prove only the tested command cases; not every purchase/charge race.
- Bulk Balance import Excel keeps existing import path; no new per-row preflight/after receipt for Excel import. Owner should review whether to require a separate import approval screen.
- Overview derives full accountFinancials for each authorized Client. Suitable for this 17-account fixture; large-account performance/pagination needs measurement before production.
- Arbitrary manual-lock messages in other legacy error-classification callers may still use text heuristics; queue correction does not claim typed errors across all backend modules.
- Reserve/charge/Payment/Debt semantics unchanged. Existing detailed finance views remain the source for allocations and statements; no new debt policy invented.

## Final results on production build

- `npm test`: 19 domain suites PASS. `npm run lint`, `npm run typecheck`, production build and `git diff --check`: PASS. Development typecheck errors during implementation were corrected before this final build; no failed gates hidden as PASS.
- HTTP suite final: **140 assertions PASS** on production build :3121 with 17 Clients; count differs from earlier 125/133 as tests and an overdue fixture were added. Retry runs are not summed.
- Sales browser final: exactly 7 assigned Clients; one-line Payment batch review showed AR $9.28, confirmation applied $1 once, receipt showed AR $9.28 ->$8.28, Wallet/reserve unchanged, available -$9.28 ->-$8.28. Eight empty defaults are excluded; sheet clears after success.
- Client browser final at 390x844: own Wallet/AR/statement/payment allocation and charge visible; no overview/client selector, no Admin controls or actor column. Desktop tested at 1280x900. These are browser viewport checks.
- Direct read-only DB audit: LEDGER-UAT-1 PURCHASED, exactly one CHARGED reserve 826 cents and exactly one ORDER_CHARGE $8.26; LEDGER-UAT-2/3/4 remain SALES_DRAFT with no reserves/charges. integrity_check `ok`, zero foreign-key violations.
- Export workbook parser verified selected Order only. No native Excel printing or real label-provider transaction performed.
- Log copies: `outputs/bulk-ledger-uat/logs/` at project root outside repository. Final server retained at :3121 with independent test DB. Port 3000 was already occupied; no unknown process was stopped or repointed.
