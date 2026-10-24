# Supplier Refund Receivable — 24/10/2026

Status: implemented and locally verified on synthetic fixtures, based on HEAD d6714ff. This is a scoped financial continuation, not completion/production acceptance of every module.

## Owner option A and accounting
Final Approved Amount is explicit, can be below Requested, and is finalized once per Supplier Claim. An immutable approval creates the receivable without touching Supplier Balance, Client ledger, Order cost/revenue or GP. Partial `REFUND_RECEIVED` reduces receivable only; partial `OFFSET` reduces receivable and increases signed Supplier Balance. Remaining receivable stays open. A final zero decision closes without posting money.

Invariant: approved = received + offset + outstanding; all integer cents and outstanding ≥ 0. Requested $300 → approved $200 → offset $100 → received $50 → outstanding $50. Claim is PARTIALLY_SETTLED until the last settlement automatically appends CLOSED. Closing creates no additional accounting. Final approvals cannot be edited/repeated and closed claims cannot settle again.

Finance/BOD only; actor is the authenticated session. `moneyCommand` persists request receipt, approval/settlement, Balance Offset and status event under one SQLite immediate write transaction. Unique approval claim ID, settlement Supplier/reference (trimmed, case insensitive, across actors/claims/kinds) and Balance source prevent duplicate accounting. Exact actor/key/payload retries replay; conflicting payloads reject. UPDATE/DELETE triggers preserve approval, settlement and existing claim/account history. Evidence/reference/reason/actor/timestamp are returned with claims.

Only explicit Actual Cost confirmation of a reconciled PASS posts payable; Estimated/Review do not. Existing BUY/SELL Add-ons, Supplier detail, Client account UX and simple nonblocking due warnings are retained. Complex allocation/reconciliation remains manual REVIEW, without new automatic allocation.

## Compatibility and data safety
Additive tables/index/immutable triggers only. No operational database was opened/reset/seeded for this validation; all suites and browser servers use isolated disposable/synthetic paths. Build used `/tmp/dmd-receivable-build.db`. `Codex/` is untouched and excluded from the commit.

Legacy `CLAIM:<id>` Balance postings remain intact, flagged REVIEW and blocked from creating a second receivable. Unposted legacy APPROVED claims require an explicit final decision; no amount is inferred. Retired `claim_credit` rejects new writes with guidance to the new settlement action; already persisted exact command receipts still replay without posting. No destructive migration or automatic historical conversion.

## Executed verification
- `npm test`: all 35 domain suites PASS; Supplier Account suite 103 assertions including partial approval, zero final decision, owner example, exact replay/payload conflict, actor/source uniqueness, over-settlement/closed guards, immutable updates/deletes, rollback on approval-event and Balance-post failures, no success receipt on failure, RBAC/API actor spoof and no artificial GP/Client movements.
- `node scripts/verify-owner-http.cjs`: all 10 HTTP suites PASS (Orders, Operations, Finance, Manifest, Cancellation, Owner Credit, Manual flow, Statement V2, Balance overview, Finance list), on owned synthetic servers/databases.
- `npm run typecheck`, `npm run lint`, `npm run build`: PASS. Node 20.20.2 matches the installed SQLite native module; bundled Node 24 is ABI-incompatible and was not used for final validation.
- `node scripts/e2e-supplier-accounts.cjs`: Chrome desktop 1440×1000 and mobile 390×844 PASS, 11 assertions. Actual UI approves $200 of $300, offsets $100, receives $50, verifies remaining $50 and unchanged Balance on cash receipt, then receives final $50 and verifies CLOSED. Existing Add-on BUY/SELL and account-centered Client navigation also pass; no page overflow or browser errors.
- `git diff --check`: PASS.

Browser evidence: [desktop partial](evidence/supplier-receivables-20261024/supplier-claims-desktop.png), [mobile partial](evidence/supplier-receivables-20261024/supplier-claims-mobile.png), [closed desktop](evidence/supplier-receivables-20261024/supplier-claims-closed-desktop.png). Evidence is synthetic only.

## Remaining limitations
- No final-decision correction/reopen or settlement reversal workflow. Resolve incorrect/legacy postings through reviewed reconciliation before production use; do not create another Claim to duplicate the same source.
- Evidence is required text/reference, not uploaded files or verified bank integration. Source uniqueness protects the same reference; operators must preserve a stable source reference for the same real transaction.
- Client operations `supplier_recoveries` remains a separate manual follow-up module, without automatic linking/import to Supplier Account. Never record the same refund in both modules. Company bank/GP report consolidation is pending.
- Historical invoice/cost/opening reconciliation, multi-Supplier/component allocation, full account pagination/performance, Supplier-specific catalogue and complete operational-role/device acceptance remain open.
- No production reset, deployment, carrier/bank operation or real-document acceptance was performed. Production backup/restore/migration and rollout acceptance remain separate gates.
