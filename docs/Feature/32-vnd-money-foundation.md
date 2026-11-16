## Operational VNĐ increment — 16/11/2026
[Feature 33](33-vnd-manual-purchase.md) now delivers a **bounded Chuyên tuyến Manual Quote slice** for explicitly activated, empty Client accounts: Purchase Request → price consent/scoped override → atomic Reserve/Awaiting Funds/FIFO → complete Tracking+Label charge → exact VNĐ ledger → Order correction/fees/tax → route-policy cancellation and Supplier follow-up. Existing USD data is never converted or relabelled. This does **not** complete automatic-service Purchase, Statements/Debt/reporting cutover, shipping Edit, Cancel & Duplicate or Client Add-on.
This section supersedes older blanket “no operational VNĐ/consent/FIFO/correction delivery” statements only within that scope. All wider gaps remain.

# Exact VNĐ arithmetic — cutover foundation
Status: IMPLEMENTED helper, operational integration MISSING. Reviewed 16/11/2026.

The approved handoff requires fractional VNĐ without additional rounding. Legacy credit storage rounds money to USD cents; changing currency labels would destroy fractional values and mix units.

## Current increment
`src/lib/vnd-money.ts` represents finite decimal values as canonical strings with BigInt arithmetic. Addition, subtraction, multiplication, comparison and summation do not use binary floating point or impose a decimal-place rounding rule. Signed deltas are supported. Invalid/scientific-notation input is rejected; callers must supply explicit decimal strings. A 1000-character resource limit rejects oversized input/results rather than rounding.

Cancellation helper uses current collected revenue including signed correction and applicable fees, policy percentage and prior refunds, capped at remaining collected funds and floored at zero. Example: 200000 + 20000 + 10000 at 90% = 207000; previous refund 7000 leaves 200000. The helper does not select policy, grant cancellation permission, move funds, or handle shipping Claims.

## Integration still required
No existing wallet, reserve, ledger, payment, Debt, Statement, report or quote storage is converted. This helper has no endpoint and moves no money. V1 quotes still use REAL/JavaScript numbers and remain purchase-ineligible. Do not convert an already-rounded Number to a string and claim source precision.

Next: exact decimal source pricing and quote calculation; explicitly isolated disposable VND target; consistent wallet/ledger/reserve/payment/Statement/report storage; persisted consent/Awaiting Funds/FIFO with atomic reserve replacement; Financial Posting and correction history; role/API/UI integration. No implicit USD-to-VND conversion or production reset.

## Verification
`scripts/verify-vnd-money.cjs` checks tiny fractions, values beyond Number safe integers, repeated sums, signed reversibility, refund cap/previous refunds, invalid inputs and resource rejection. Included in `npm test`. Full candidate checks recorded under `artifacts/service-v1-continuation-2026-11-16/`.
