# Client Carton grouping — Implementation and verification, 20/10/2026

## Implemented
- Excel/CSV file Client Orders is normalized strictly by *adjacent* Client Order ID groups. Every physical row is one Carton. Each row needs its ID; the first row alone must contain integer Carton Quantity, which must equal the number of rows in its group; subsequent Quantity must be blank. IDs appearing after another group are errors. Carton No. is generated internally in source order.
- Group conflicts are detected before Draft persistence. The save path **revalidates** Carton rows instead of trusting errors or groups posted from the browser; malicious nested internal fields are excluded from Client preview/error responses.
- Client Draft persists an Order's Carton rows and default Lot 1 in the same transaction. Invalid group means no partial Order. On file preview, one row/card represents one Order and displays underlying Excel line numbers; user must fix workbook and upload again rather than editing a partial Carton group. Single-carton path continues unchanged.
- Route setting uses **only** `max_cartons_per_order` (default 1) and is configurable by Admin. The same `carton-policy.ts` helper enforces the Route limit at Client preview, Order Carton/Lot structure save and Purchase; ePacket/Yun remain hard capped at 1, regardless of stale Route setting. Duplicate Client Order ID check in Client import is scoped to Client, not all Clients.
- Added English header aliases for `Carton Quantity`, `Carton Qty`, `Recipient Name`; original Excel physical row numbers are preserved across empty lines.
- UPS/chuyên tuyến **pricing remains intentionally gated** until proper multi-carton price is approved/configured; the code must not silently quote using the first Carton or ePacket's rules. No new per-Carton Ledger charge.

## Evidence
Final clean run on Node 20 / Next 16.3.6:
- `npm test`: **29/29 domain suites PASS**, including ePacket **170** checks, grouping **21**, new Client Orders authenticated API/XLSX **17**, Statement V2 **78**, Bulk Recovery **19**. Existing Purchase Template engine multi-carton synthetic fixture was reclassified from obsolete ePacket T11 two-carton to UPS Express two-carton with an explicit allowed Route limit; template placeholder tests still use synthetic template values rather than approved real UPS layouts.
- `npm run lint`: PASS (no warnings), `npm run typecheck -- --incremental false`: PASS, `git diff --check`: PASS.
- `npm run build`: PASS on new ephemeral `DMD_DB_PATH` (not operational).
- New API test exercises actual Client preview/save, two distinct one-carton Drafts, no extra charge, same-Client duplicate rejection / cross-Client allowance, ePacket multi-carton block, Client private-data filtering, Admin invalid ePacket limit and UPS limit configuration. Independent synthetic fixtures, no external label/carrier/bank purchase.
- `seed-internal-uat.cjs` no longer creates illegal Yun multi-carton fixtures. A new `.smoke/internal-uat-test-carton-rule-20261020.db` was generated (never overwriting existing DB): **500 Order**, **40 multi-lot Orders** using UPS/Chuyên tuyến, 300 Supplier Cost rows, `PRAGMA integrity_check = ok`. This is a seeded integrity check, not a browser clickthrough or operational target migration.

## Deliberate limitations and remaining UAT gates
- The Client upload path is implemented and verified via XLSX-to-parser-to-authenticated route; **full multi-carton UPS/Yun purchase-through-Statement has NOT been tested or activated**. Yun remains one Carton by policy. UPS and chuyên tuyến require approved Route-specific quotation/reservation and supplier purchase templates; no price guessed.
- Manual form and general public API do not yet have a polished nested-Carton editor / published canonical contract. The Client JSON route accepts validated nested `carton_rows` from the file preview. Do not claim three-method parity or full browser E2E.
- No five-role full browser UAT, migration on deployment target, real-carrier label or Owner pilot acceptance in this change. Existing synthetic data outside isolated fixtures was not reset.
- Existing `Codex/` untracked and untouched.

## Next gates
Implement approved UPS/chuyên tuyến multi-carton price adapter plus UI/API contract; test Excel grouping with heterogeneous Cartons all the way through Draft → Purchase → Tracking/Manifest → Charge/Reserve → Statement using a separately approved test pricing fixture, then five-role desktop browser UAT and Owner acceptance.
