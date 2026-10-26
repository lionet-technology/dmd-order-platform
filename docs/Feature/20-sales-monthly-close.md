# Client Sales attribution, BOD trends and monthly Statement close
Updated: 2026-10-25. Local implementation; verification results recorded separately.

## Sales owner and purchase
Client owner remains users.sales_user_id. Sales access to current Client data follows that field, including after transfer. Order sales_user_id and sales become a historical snapshot at the first accepted service purchase (manual routes: initial service request), or legacy tracking completion if no service request existed. No Sales selection is required per Client Order.

The snapshot runs inside the SQLite purchase transaction/write lock. Active valid Sales owner is required for linked Client purchases. Failed purchase rolls back the snapshot and money together; retry does not resnapshot. Snapshot evidence is append-only in order_sales_snapshots with Client, Sales name/ID, time and available actor. Purchased attribution and Client ID are immutable, including later amendments. Legacy purchased rows retain existing values verbatim; no reconstruction from today's owner is attempted. Previously overwritten history cannot be recovered without independent evidence/backups.

Admin owner changes append client_sales_owner_history, without updating any historical Order. GET /api/users/{id} exposes the audit to Admin. Optional expected_sales_user_id rejects stale owner edits with 409. A fresh Client ownership check occurs inside purchase transactions; a former owner cannot buy after transfer.

## BOD commercial reporting
GET /api/bod-finance-report?month=YYYY-MM&months=6 (or 12), BOD/Finance only.
Four drilldowns remain total, Sales, Client, Service/Subservice/Supplier. Sales groups use Order snapshot exclusively, never current Client owner. Month boundaries use Vietnam time and purchase cohort. Current month is partial. Prior months remain live cohorts as reconciliation changes; they are not issued accounting snapshots.

Revenue and GP Base use sales_price and base_cost, excluding surcharge/tax. Only FINALIZED + COMPLETE + PASS with non-null finalized_gp contributes finalized GP Net. Pending estimated GP and missing estimates are separate. Eligible commission GP Base is shown separately and now follows Owner's partial-refund rule: max(0, sales_price − approved service Refund for that Order − base_cost). Compensation does not masquerade as a service-price Refund. The latest Claim Decision replaces its prior amount; subsequent Bank/Balance payouts do not subtract again. For Claims spanning multiple Orders, allocation must sum to the approved Refund before counting commission; otherwise mark the affected Orders for review and conservatively withhold their commission GP. Legacy Refund without a current Claim Decision remains review/withheld, not guessed. Cancelled Orders are excluded. This is an eligibility projection, not a commission payout ledger/rate configuration.

6/12-month revenue bars and full monthly tables include zero-activity months and signed GP. MoM uses absolute prior value as denominator; prior zero returns no percentage. No company net-profit label or inferred accounting close.

## Automatic monthly safe close
Existing immutable Statement V2 snapshots are reused. closeMonthlyStatements processes contiguous periods from the checkpoint / last issued end, through completed calendar months. The checkpoint's first month may be partial. Max 100 Clients and 12 periods per Client per batch; cursor resumes Clients and another pass resumes older periods. Inactive Clients remain included for financial history.

Automatic finalization requires confirmed, current-amount Payment reconciliation through period end, valid manual Order price, and existing journal/balance/legacy-migration gates. Failure rolls back finalization effects and records Admin Review with a concrete reason. One Client's exception does not prevent others. Open Claim alone does not block closing; dispute remains a live projection while issued financial bytes remain immutable. Replays do not create another snapshot or charge. Late postings move into the next open period. Manual finalize retains its existing explicit workflow; the additional Payment confirmation gate is for automatic close.

Admin/Finance use the Statement panel's monthly close action and Admin Review list, or authenticated POST /api/statements-v2:
```json
{"action":"monthly_close","through_month":"2026-09","after_client_id":0,"limit":50,"max_periods":12}
```
The response also lists remaining_client_ids for periods still open (Review or the 12-period cap). Repeat with next_client_id until null, then restart at 0 on subsequent scheduled runs to catch remaining backlog/Review resolutions.
GET /api/statements-v2?monthly_review=1 is restricted to Admin/Finance.

## Scheduler integration
No background scheduler is installed or claimed. The UI is an on-demand trigger. A system scheduler can invoke the authenticated API or, on the application host with installed project dependencies:
```sh
DMD_DB_PATH=/absolute/path/to/existing.db DMD_STATEMENT_ACTOR_ID=123 node scripts/statement-monthly-close.cjs 2026-09
```
Select an active Admin/Finance actor. The CLI refuses a missing/non-absolute DB path and missing file. Exit 2 means Review or remaining period backlog exists; other failures are nonzero. Keep database selection explicit and back up before initial migration. Set the scheduler timezone to Asia/Ho_Chi_Minh, invoke for the last completed month, rerun daily for catchup. Provision the scheduler externally; this repository does not activate one.

## Verification and data safety
New suite scripts/verify-sales-monthly-close.cjs uses a disposable DB, 36 assertions and 40 concurrent purchases versus owner transfers. Existing domain/HTTP suites, lint/typecheck, isolated build and desktop/mobile browser verification are required; final results are recorded in [the verification note](VERIFICATION-SALES-MONTHLY-2026-10-25.md). Demo reset script includes the new audit/batch tables only within its existing explicit demo-path, backup and non-production guards. No operational DB reset is part of this change.
