# DMD Finance Ops

MVP platform to replace the linked DMD Excel workflow with one canonical data-entry system.

## What it does

- Manual Order entry for Sales/Admin.
- Manual Supplier Cost entry linked by Tracking.
- Manual Balance ledger entry for payment/refund/service/error/adjustment.
- Edit Order directly from the Orders table.
- Keeps Excel import as a bulk/migration path.
- Manual entry and Excel import use the same business logic.
- Auto-links Order ↔ Supplier Cost ↔ Reconciliation ↔ Balance Ledger.
- Supplier Cost can arrive before Order; it auto-links when the matching Tracking appears later.
- Auto-reconciles Estimated Net Cost vs True Net Cost.
- Admin/Sales views read from the same canonical Order record.
- Auto pricing / chargeable weight / surcharge rules from the current DMD Report scope.

## Run

npm install
npm run dev

Open http://localhost:3000.

SQLite is created automatically at data/dmd-finance-ops.db.

## Current workflow

1. Sales creates an Order draft with Order ID.
2. Admin edits the same record and adds Supplier / Tracking / Net Cost / Label.
3. Supplier Cost is entered manually or imported and matched by Tracking.
4. Reconciliation changes to PASS or REVIEW automatically.
5. Supplemental surcharge/import tax update Total Due.
6. ORDER_CHARGE in the Balance ledger is updated automatically.
7. Payment/refund/service/error entries can be added manually or imported.

## MVP boundaries

- No authentication yet; Admin/Sales toggle is a view simulation.
- No direct write to production DMD.
- No secrets or production customer data are included.
- Balance manual form supports Customer/User, but the old Excel Balance template still does not have that key.
- Multi-carton merge is intentionally conservative: if one Order ID has multiple pending drafts, the system refuses automatic merge.

See docs/logic.md for rules and open questions.
