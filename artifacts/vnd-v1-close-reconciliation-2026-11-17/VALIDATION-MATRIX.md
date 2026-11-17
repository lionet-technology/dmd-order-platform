# Validation matrix — TEST fixtures only, 17/11/2026
No real invoices, bank transfers, carrier actions, Jenkins or production database were used.

| Area / representative case | Expected result | Evidence |
|---|---|---|
| Supplier original Jan Actual 40.123456, approved receivable 20 | Frozen payable 40.123456 and receivable 20, separately | verify-vnd-period-close |
| Duplicate close / stale previous period / gap / today or future close | Reject; one immutable snapshot only | period suite + Chrome |
| Current replacement Actual 30.000001 after Jan close | Payable delta −10.123455; original Jan snapshot identical | period suite |
| Claim approved 20 → corrected 15 after close | Receivable 15, payable unchanged; source link retained | period suite |
| Free adjustment after close without original / wrong original | Reject and roll back journal/command | period suite |
| Valid linked adjustment | Append current delta; never edit original | period suite + Chrome |
| Feb close after Jan, then late correction of Jan Actual | Frozen Feb opening stays 40.123456; correction still references JAN, not carry-forward Feb | period suite |
| Injected receipt failure / UPDATE or DELETE snapshot/link / backdated journal insert | Atomic rollback / immutable rejection / closed-period rejection | period suite |
| Chrome TEST original 123.123456, current adjustment 1.000001 | Live payable 124.123457; frozen 123.123456 unchanged; linked source visible | browser-uat.json + period screenshots |
| Manual Supplier review / Excel TOTAL and SUPPLEMENT | Existing semantics preserved; only approved latest Lot total counts | full regression + expanded Supplier suite |
| Supplier Claim Bank / Offset / reversal / concurrent settlement | Separate receivable/payable; approved Actual stays 100.123456 in GP regardless of settlement | Supplier receivable suite, 55 assertions |
| Freight 100.123456, Base 40.000001; surcharge 999 | GP-Base 60.123455; reference commission 7.314938056; surcharge excluded | commission suite, 38 assertions |
| Negative GP-Base / equal Sales=Base / cancelled / uncharged | Zero reference commission; per-Order nonnegative basis before summation | commission suite |
| Missing Base or historical Sales | Unavailable, not guessed zero or current account owner | commission suite |
| Pending Claim / latest decision reduced to zero | Does not classify as positive approved Refund | commission suite |
| Approved one-Order Claim 10 in complete cohort/group | Whole-Claim group Refund 10 once; signed GP-Base minus Refund 50.123455; no pool-to-Order split | commission suite |
| Approved multi-Order Claim across purchase months | UNALLOCATED_CROSS_COHORT_OR_GROUP, null group Refund; no invented distribution | commission suite |
| Missing approved Actual / multiple corrected total documents | GP-Net unavailable until complete; then latest total per Lot, never sum replacement history | Supplier/report and import suites |
| Supplier payable/receivable/payment versus GP | Receivable/Offset/Bank never added again to GP-Net | Supplier receivable suite |
| Control Tower pending unmatched import | Typed error queue remains pending and internal only | exceptions suite + Chrome |
| Assigned versus unrelated Sales / Client / forged role / Warehouse | Scoped allowed queues; unrelated data absent; forged/unauthorized role rejected | exceptions suite, 17 assertions |
| Sales/Client reporting and Supplier journal | 403; no Actual Net or Supplier import evidence in scoped exception response | five-role Chrome + full privacy regressions |
| Desktop/mobile period, exception and BOD reports | Contained tables, no page-level horizontal overflow or browser page errors | Chrome screenshots, visual inspection |
| Synthetic backup → new file restore | SQLite integrity/foreign keys valid; 8 tables identical including frozen snapshots and late links | pilot-restore.json |

## Evidence still required before real pilot acceptance
Real source Supplier documents and operator reconciliation, actual service/route cancellation policy and carrier evidence, deployment-target backup/restore rehearsal, operational backup/retention setup and Owner acceptance. A successful TEST restore does not establish any of these.
