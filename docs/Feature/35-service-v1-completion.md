# V1 continuation — 17/11/2026

Status: implementation in progress; no production acceptance.

## Verified starting point
Local main and remote main are 3c6811aa3728ae424b7ed9805a7a7936abccf207. Existing AGENTS.md and Codex/ changes are outside this work. Final workbook (2) opened directly through the source parser: SHA a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2, three sheets. Source decisions are not reopened.

## Approved vs delivered gap review
- UPS: pure source resolver and account/global Review/Publish exist. Operational VND adapter, account-bearing export and lot editing are missing.
- ePacket EU: separate rate tables exist; destination routing from Standard/Eco is missing. Only an eligible configured ePacket EU route may be selected; never Yun or a US fallback.
- Shipping Edit: existing VND requests block all shipping edits. Separate pre-issuance edit is required; partial Tracking OR Label locks it. Offer and post-charge correction remain separate.
- Cancel & Duplicate: policy cancellation/supplier follow-up exist; atomic linked Purchasing replacement is missing.
- Client Add-on and Statements/Debt/reporting: VND cutover is missing; legacy USD is not relabelled.
- Browser UAT: dedicated VND role/workflow verification remains open.

## Genuine unresolved decision
Handoff §5 explicitly leaves Service change after a manual offer OPEN. Asked Owner whether to require an explicit new offer/automatic pricing selection or explicit retention. Until answered, do not silently carry an offer to a different service. This does not block UPS or destination routing work.

## Guardrails
Reuse VND consent, atomic FIFO reserve, one-time charge and immutable ledger. Financial postings may exceed credit with no automatic Debt. Cancellation policy is route-specific; Claim refund remains separate. Internal Purchase/export never calls a Supplier. Preserve source workbook and existing working changes; no Jenkins/production.
