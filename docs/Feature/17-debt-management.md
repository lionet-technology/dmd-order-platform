# Debt Management
Current implementation: 22/10/2026. [Owner execution and accounting assumptions](OWNER-EXECUTION-2026-10-22.md).

## Account and actions
A Client has one Debt account. Admin converts only existing negative net Balance, with amount, deadline, optional daily rate and reason/proof text. Review shows before/after Balance and Debt; submit revalidates the amount inside an immediate transaction. The existing financial command creates an idempotency receipt, adds principal to the same account, records immutable transfer before/after and audit. No Payment is fabricated. Multiple legacy accounts block purchasing and require reconciliation; they are not merged.

The horizontal Debt tab shows remaining principal, posted plus projected unpaid completed-day interest, total due, Debt deadline/status, oldest covered finalized Statement date, credit-term due/status and the Client credit term. Admin can change prospective rate or extend Debt deadline through existing actions. Principal changes, interest rows and Payments are visible in bounded history. Extending a Debt deadline does not rewrite frozen Statement aging.

## Age and safety
Coverage uses signed combined remaining obligations and frozen incremental economic buckets newest-to-oldest, including open-period capacity without giving it an invented finalized date. Transfers and allocations cancel; Payment settlement is not treated as new obligation capacity. Partial Payment can move the oldest covered bucket. No allocation is written by financial GET. Ambiguous legacy opening, negative adjustment buckets, unknown types or late edits to frozen sources are REVIEW and block new buying.

Daily interest projection rounds each completed Vietnam day separately, uses the effective principal/rate segment and excludes already posted days and the current day. It is read-only and labelled separately from posted Statement balances. Explicit monetary commands materialize the same completed days before settlement.

Payment priority remains interest → principal → wallet. Signed Refund and immutable Statement snapshots are independent. See the linked execution note for assumptions, caller audit, test boundaries and the default-DB bootstrap incident.
