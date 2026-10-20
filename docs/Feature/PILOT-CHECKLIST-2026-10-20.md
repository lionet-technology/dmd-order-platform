# GĐ1 pilot checklist — execution requires Owner acceptance

Status: prepared, not executed. No production deployment, carrier purchase, label purchase, real transfer or automatic Balance Adjustment is authorized by this checklist.

## Before pilot

- [ ] Name the target environment, resolved DB file, host, commit, operator and rollback owner. Confirm synthetic/production provenance using actual users, orders and configuration, not a filename alone.
- [ ] Take a SQLite backup with the application quiesced or SQLite backup API. Reopen it; require integrity `ok`, zero FK violations and record SHA-256. Restore into a new file and verify application login, signed balances, Debt, Refund, issued Statements and BOD parity before selecting it as the target.
- [ ] Close the UPS/Yun manual pricing/reserve adapter gap and run a priced multi-carton/multi-lot full flow. Do not use ePacket's one-carton US pricing rules for other services.
- [ ] Owner approves real Base Rate, retail/discount, route limits, carrier cancellation matrix, FX and Supplier cost coverage. Synthetic prices and labels are not pilot evidence.
- [ ] Full desktop/mobile workflow acceptance for Admin, Sales, Finance, BOD and Client, including keyboard/error handling. The five-role smoke screenshots in this delivery do not complete this gate.
- [ ] Agree expected concurrency/history sizes and latency/error/memory limits; repeat HTTP tests on matching infrastructure. The 10k-entry localhost sample is not a capacity guarantee.

## Supervised pilot script

1. Record openings for Balance, Debt, Refund Balance, Credit Limit and Reserve. Confirm one Debt account per Client. Use a small agreed set of Clients/Orders.
2. Create ePacket US one-carton Draft; preview and purchase. Confirm Draft has no financial effect, Purchase reserves once and tracking+label charges once. Check UPS/Yun multi-carton and two lots under approved configuration separately.
3. Scan each physical carton into Manifest; exclude replaced tracking, export exactly selected cartons, update ETD/status and reconcile Supplier costs without changing locked sales price.
4. Submit a bulk batch with a correct and incorrect row, preserve successes where specified, explicitly reselect failures, reload, retry and verify no duplicate tracking, reserve or charge. Atomic tracking saves must roll back the entire selected save if any group fails.
5. Sales Payment settles accrued interest, then principal, then Balance. Finance confirms/corrects with evidence; force a stale-version/conflicting-key request. Do not compensate automatically with Balance Adjustment.
6. Finalize a Claim separately from an actual Refund. Verify Balance credit, Bank cash outflow, negative Refund Balance and manual recovery independently; retain supporting evidence.
7. Finalize Statement without money movement. Compare signed opening + movements = closing in all three accounts and BOD issued totals. Post a late correction and prove the issued financial snapshot remains identical; the correction belongs to the next period.

## Stop / rollback / acceptance

- Stop for duplicate money, wrong Client scope, unexplained totals, missing label/Manifest carton, FK/integrity failure, or exceeded agreed load limits. Freeze writes and preserve logs and DB/WAL state.
- Restore only a verified backup into a new DB path, check integrity/FK and financial invariants, then switch the configured target under the named operator's approval. Never erase an unknown database or silently replay money commands.
- Record actual result per step, screenshots, carrier/bank references, errors, commit and timestamps. Owner signs off residual gaps before any production change. Real carrier/bank actions remain separate supervised actions.
