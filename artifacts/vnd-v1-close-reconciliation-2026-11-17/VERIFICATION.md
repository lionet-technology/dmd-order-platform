# DMD V1 — Supplier close / GP reconciliation / Control Tower, 17/11/2026

Canonical repo: /Users/quan/Developer/report. Starting local main, origin/main and live remote main independently verified as **8225737b1d7c2104db1a98dbabeebb4600e16972**. Remote fetched again before finalization; ahead/behind 0/0. Existing owner changes: modified AGENTS.md and untracked Codex/. These remain excluded from the task commit. Final commit/remote equality is reported in the chat after push.

## Delivered scope
- Supplier Finance/BOD period close by ended Vietnam-local days, consecutive periods, immutable snapshot with original evidence, unresolved imports, opening/movement/closing payable and separate receivable. Actor/reason/idempotency/CAS and immediate transaction. No reopen.
- Late manual/Excel cost corrections post only current-period replacement delta and link to the original frozen source period, including when carried through later closed-period openings. Claim corrections/settlement/reversal likewise preserve frozen history. Free adjustments after close require an original frozen Supplier ledger reference. Backdated writes into closed periods reject.
- Existing import work is retained: pending/unmatched/error rows do not become Actual or payable before explicit review. Old manual cost review remains operational, now sharing period/audit protections. No queue redesign or deep Claim workflow.
- Freight-only signed GP-Base, per-Order nonnegative commission basis, zero for cancellation/unpaid, missing Base/Sales unavailable. Latest Owner-requested reference formula when freight sales > Base: sales × 0.001 + max(sales−Base,0) × 0.12, otherwise zero. No commission payout/accrual.
- Approved Claim classification uses all current positive decisions, not first Claim or mere existence of a pending Claim. Whole approved totals are counted once only in complete same-Sales/purchase-month/group scope. Cross-cohort/group totals stay unavailable for manual review; no per-Order Client pool allocation. Actual payouts are not deducted a second time.
- GP-Net before Client Refund: commercial freight plus surcharge minus latest approved total per Lot, only when every Lot has Actual. Tax excluded; Supplier receivable/payment/offset is not counted in GP again. Overall post-pool finalized GP remains unavailable rather than fabricated.
- Scoped read-only VNĐ Control Tower in /vnd and Operations: purchasing states, negative headroom, selling at/below snapshotted Base, internal missing Actual and Supplier import queues. No private raw pricing errors/Actual/Supplier evidence for Sales/Client.
- Updated Feature 41, Approved Decisions, current handoff/index and dependent feature docs. [Validation matrix](VALIDATION-MATRIX.md).

## Verification evidence
- Full regression: **68 suites PASS** (66 retained + 2 new), completed final test.log and test.exit=0. Final period suite is the 38-assertion run including original-period linkage after a second close.
- Supplier period close suite: **38 assertions PASS**, including stale/gapped/future close, receipt failure rollback, immutability, closed-period backdate rejection, first/second close snapshots, current replacement/Claim delta, invalid source rejection, and original January reference retained after February carry-forward.
- Commission suite: **38 assertions PASS**. Positive/negative/equal/cancelled/unpaid/missing Base, exact fractional formula, freight/surcharge boundary, historical Sales, pending/zero/positive decisions, whole-Claim deduplication, multi-Order cross-month unavailable.
- Supplier actual suite: **39 assertions PASS**. Supplier receivable suite expanded to **55 assertions PASS**: concurrency/excess rejection and unchanged Actual-based GP after Bank/Offset/reversal.
- VNĐ exceptions: **17 assertions PASS**, active/forged role checks, assigned/unrelated Sales, Client scope, internal-only import queue, privacy and no writes.
- Typecheck, lint and production build: **PASS**, exit 0; logs in this directory. Node 20.20.2 matches installed native SQLite. Build uses the existing owned disposable-DB wrapper.
- Real headless Chrome on production build and localhost, owned synthetic DB: **81 checks PASS / 5 roles**; no browser page errors. Includes retained 62 checks plus period UI close, current exact correction, byte-identical snapshot, visible original audit, Admin/Sales/Client denial, scoped exception privacy, before-Refund GP-Net versus commission reference and mobile containment. browser-uat.json/browser.log. Final period desktop/mobile and Control Tower screenshots visually inspected; tables scroll within their containers.
- Synthetic backup/restore: **PASS**, eight table-by-table comparisons plus integrity_check and foreign_key_check. Frozen snapshots and original-source links survive restoring to a new TEST file. pilot-restore.json names the owned temporary paths. This is not a restore of the deployment target.
- Final diff whitespace, explicit staged paths and source hashes are checked before commit.

Earlier failed candidate checks were corrected before final evidence: TypeScript callback/date field inference and a test fixture whose current Sales assignment had been intentionally cleared. The first long combined tool request timed out, so final long-running checks use bounded launches with persisted exit files. Final logs contain completed reruns, not assumed results.

## Protected material and safety
AGENTS.md SHA256 unchanged: 7d476b36bb045b832b0ef7b79e31c6927d96717330b6254204b3f11c5538dda6.
Final workbook docs/data/service-v1/net-cost-final-2.xlsx SHA256 unchanged: a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2.
No AGENTS.md/Codex/workbook edits, no synced project sources, no operator DB reset, no Jenkins/production/carrier action or actual bank transfer. Git commit stages explicit task paths only; push is ordinary fast-forward without force.

## Remaining V1 gates
This coherent continuation is not full V1/pilot acceptance:
1. Real Supplier documents and operator reconciliation; real service/route cancellation policy and carrier evidence. All newly supplied evidence here is clearly labelled TEST.
2. Deployment-target restore rehearsal, operational backup destination/retention/scheduler, rollout and Owner acceptance are unverified.
3. Cross-Sales/month/group Refund allocation and final commission decisions remain manual; no automatic payout or inferred post-pool final GP.
4. Supplier tax/pass-through-specific accounting import, high-volume queue pagination/performance and comprehensive legacy cutover are not delivered.
5. Claim/watchlist/Complete Claim lifecycle and manual Client–Supplier case linking stay in the NEXT phase, per Owner. No complex new workflow was added.

No new unresolved business decision was needed for this slice. Missing real operational evidence is not replaced with defaults or a claim that the pilot passed.
