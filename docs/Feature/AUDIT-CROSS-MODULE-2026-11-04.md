# Deep logic continuation — 04/11/2026

Owner explicitly defers UI. Based on actual local and GitHub HEAD `fa60cab790c0dcb5ef4faba9ef0bfba55aa7ce33` (not a reset to its parent). Work ran in a separate local clone. Original `Codex/`, operational DBs, env and generated operational data were not used or modified by tests. No production reset, carrier calls, migration or deployment.

## Reproduced findings and fixes

| Priority | Reproduction | Resolution / evidence |
| --- | --- | --- |
| P1 | New priced Client Purchase with no expected quote key was accepted; legacy `/api/purchase-jobs` supplied none. | Mandatory domain check for CLIENT in the Reserve transaction. Both API paths return normal FAILED/DATA items for missing/stale quote. Preview/reload/reconfirm uses existing workflow. [Before-fix failure](../verification/2026-11-04/consent-before-fix.log). |
| P1 | With $10 net Balance reserved for a $10 purchase, Refund recovery could also consume $10. A three-writer test returned successful Purchase **and** recovery. Accepted purchase funding was lost. | Recovery now uses `max(0, net Balance - active reserves)`, without Credit Limit. [Before-fix failure](../verification/2026-11-04/race-before-fix.log), `verify-shared-funds-race.cjs`. Fixed and simultaneous schedules, 21 independent SQLite writers and retry receipts. |
| P2 | Supplier report exposed separate books but did not explicitly quantify documentary invoice vs Account payable differences or aggregate Claim channels. No reproduced $20/$10 accounting double count. | Add read-only per-Supplier channel totals, Account payable, documentary outstanding, signed difference and review flag. Invoice/Account postings, cost and GP engines unchanged. |

No reproduced P0 in this run. This does not assert absence of P0/P1 outside tested coverage.

## Verified contracts

- P1.1: Missing/stale quote rejects before Reserve; price **version** changes and route deactivation between Preview/Purchase reject; fresh confirmation accepts. Accepted purchase replay without a new key preserves original snapshot/reservation after later pricing changes. Direct domain calls cannot bypass the Client rule. Legacy Client API now shares the existing bulk result shape; Admin/Sales response contract stays unchanged. Quote mismatch is DATA; configuration faults retain existing SYSTEM classification.
- Approved manual exception remains: UPS/Chuyên tuyến service request has no known price, quote confirmation, Reserve or Charge. Admin later confirms one total Order price before Tracking/Label charge. No UI or new confirmation feature.
- P1.2: Independent oracle: cost $100, documentary invoice $100, payment $40, Claim $30, Offset $20 and actual Bank receipt $10. Account payable $40; Supplier receivable $0; documentary outstanding $100; discrepancy $60. GP remains $50, not $80 or $20. Late cost $15 changes GP to $35 only after review; Account payable changes to $55 only through an explicit documentary account adjustment. Invoice never posts another cost. New channel fields are **net active settlements** and exclude reversed settlements; they are not a complete bank cash ledger or period report.
- P1.3: Start with $10 Balance, $10 Debt and -$10 Refund pool; concurrent new Payment $10 must repay Debt, without releasing another $10 for spending. Purchase and recovery compete for the original $10: exactly one succeeds. Payment/allocation and successful action retries post once. Rejected recovery leaves no debit/receipt; rejected Purchase leaves no reserve. An accepted reserve can charge afterward with final Balance $0.
- P1.4: Actual repository policy is service/adapter based, with **no configurable route AUTO/MANUAL field**. Versioned automatic quotes support ePacket Standard/Eco DMD. UPS/Chuyên tuyến retain the approved manual exception. Unsupported ePacket/Yun configurations fail without a price table and cannot use manual price entry. This run does **not** claim a Yun/UPS automatic adapter exists or add a mode engine/schema.

## Linked coverage and historical identity

| Chain | Evidence in this run |
| --- | --- |
| Draft → Quote → Purchase → Reserve → Charge → Tracking/Label → Cancel/retry | Existing ePacket/bulk/purchase/cancellation suites; new consent regression; HTTP Order/cancellation/manual-price retry suites. |
| Supplier late cost/tax/surcharge → Claim/Credit/Payable/Bank → GP | Supplier accounting oracle (15), Account (138), linked workflows (489), Emergency (152). Documentary outstanding is never summed with Account liability. |
| Refund negative edits → Balance/Bank recovery → Debt → issued/next Statement | Refund (102), Debt/Payment adjustment, Statement V2 (86), linked workflows (489, including 80 fixed-seed obligation/payout/recovery oracle steps). Frozen Statement bytes and next-period deltas checked. |
| BOD cash vs commercial/GP; VND expenses | BOD Finance (28), linked workflow independent money/GP oracle, Internal Expenses (74); VND payments leave Client USD/Refund/Statement unchanged. |
| Sales multi-Order/multi-Sales/multi-month | Sales monthly suite (56, plus 40 concurrent owner/purchase snapshots); processing-month Claim revisions remain distinct from purchase revenue. This is manual commission-input behavior, not an automated commission payout formula. |
| Identity after monetary posting | New consent extension: direct changes to Client, Sales, Supplier, service/route, Tracking and Lot structure reject after Charge, preserving Order/Ledger/Sales snapshot/Lots. Existing Sales transfer tests preserve historical attribution. Emergency tests preserve old/new Supplier scope, original Charge and historical cost source during approved route/Tracking replacement; partial replacement rolls back. No guessed historical allocation or silent transfer. |
| Sales/Client privacy | Supplier privacy (25), egress (194), RBAC, linked role requests and HTTP suites. These do not certify confidentiality of arbitrary external PDF/Label contents. |

## Validation actually completed

- `node scripts/verify-all.cjs`: **44/44 suites PASS**. [Full log](../verification/2026-11-04/domain.log). This full pass includes the initial 40-assertion consent test; its later identity extension separately passed **64 assertions**, in handler mode and against a real owned localhost production server. No application code changed after the full pass.
- `node scripts/verify-owner-http.cjs`: **10 HTTP suites, 431 assertions PASS** against disposable DBs. [Log](../verification/2026-11-04/http.log).
- `DMD_CONSENT_HTTP=1 node scripts/verify-purchase-consent.cjs`: **64 assertions PASS**, a combination of real HTTP purchase requests and direct domain/identity invariants. [Log](../verification/2026-11-04/purchase-consent-http.log). Handler-mode counterpart also passes.
- New shared-funds race: **67 assertions**, 21 independent writers, controlled Purchase-first/recovery-first/Payment-first and four simultaneous rounds. Exact successful retries are included. This is finite adversarial coverage, not proof of all possible schedules.
- TypeScript and ESLint PASS; `git diff --check` PASS. [Evidence](../verification/2026-11-04/).
- `npm run build -- --webpack`: PASS, with the repository's isolated-build wrapper and a disposable build DB. Default Turbopack rejected the external `node_modules` symlink in the temporary clone; Webpack was used without changing product configuration. Node 20.20.2 arm64 matches the installed SQLite binary. An initial Node 22 x86_64 attempt could not load it; this was an environment mismatch, not a domain result.
- No fresh browser/visual acceptance claimed: no UI was changed. Existing HTTP and domain evidence does not replace future UI or production acceptance.

## Remaining limitations / hypotheses

1. **Verified implementation limit:** Yun automatic pricing is not implemented. It fails closed rather than silently using manual prices. New route adapters/policy configuration need their own approved requirements; no new module was introduced here.
2. **Verified reconciliation limit:** Invoice-to-cost/account document matching remains manual. A zero aggregate difference does not prove the same documents were matched. Report flags differences; it does not allocate, close periods or produce Supplier Statements. Actual Bank receipt reporting in Account is not full company-bank reconciliation.
3. **Verified exception requirement:** Late costs, multiple Suppliers/Lots and Emergency replacements may require explicit allocation/review. Current tests protect history; they do not infer missing business evidence. Historical overwritten identity cannot be reconstructed from current owner settings.
4. **Unverified external risks:** Real carrier rates, real Label/PDF confidentiality, third-party timeouts and complete production workload/role-device acceptance still require controlled real-data UAT. No reproduced new defect is asserted for these hypotheses.
5. Existing legacy financial records with unreconciled decisions/allocations remain guarded for reviewed migration; test success is not authorization to reset or activate a real DB. No Supplier Statement, period close, unallocated-money pool, spreadsheet upgrade or UI polish.

UI remains deferred per Owner. Continue nitpick/UAT against the explicit limits above; this report does not certify production readiness.
