# DMD Finance Ops — PoC

Fast MVP for replacing linked DMD reporting spreadsheets with one canonical input system.

## What it does

- Imports the existing **Template Lên đơn** (Admin/Sales) directly from `.xlsx`.
- Imports **Template Chi phí** and matches by Tracking.
- Imports **Template Balance** with payment/refund, service-cost and error sections.
- Auto-links Order ↔ Supplier Cost ↔ Balance Ledger.
- Auto-reconciles Estimated Net Cost vs True Net Cost.
- Calculates the current markup rules from the DMD Report sheet.
- Provides **Admin** vs **Sales** views from the same record instead of maintaining two copies.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

SQLite is created automatically at `data/dmd-finance-ops.db`.

## MVP boundaries

- No authentication yet; the Admin/Sales toggle is only a view simulation.
- No direct write to production DMD.
- No secrets or production customer data are included in this repository.
- Balance imports are global until Customer/User identity is added to the template.

See `docs/logic.md` for source-template mappings, rules and open questions.
