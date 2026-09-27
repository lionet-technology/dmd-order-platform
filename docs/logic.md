# DMD linked input logic

## Core principle

Manual entry is the primary workflow. Excel import is only a bulk/migration option.

Both paths call the same business functions:
- upsertOrder
- addSupplierCost
- addLedgerEntry

This keeps pricing, linking, reconciliation and ledger updates consistent.

## Order workflow

Sales can create a draft before Tracking exists.

Admin can later update the same Order with:
- Supplier
- Tracking
- Label
- Estimated Net Cost
- Base / Retail / Discount / Sales Price
- Surcharge / Import Tax

Merge rules:
- Existing record ID wins.
- Otherwise Tracking matches existing Order.
- Otherwise if Admin adds Tracking and exactly one pending draft has the same Order ID, merge into that draft.
- If multiple pending drafts share one Order ID, automatic merge is refused to avoid multi-carton corruption.

## Cost workflow

Supplier Cost requires Tracking.

Cost can be entered before or after the Order:
- Cost after Order: reconcile immediately.
- Cost before Order: store as unmatched; when matching Order appears later, reconcile automatically.

Reconciliation:
- True Net Cost = Total Net Cost.
- If True Net <= Estimated Net => PASS.
- If True Net > Estimated Net => REVIEW.
- Supplemental surcharge/import tax augment Total Due.
- Latest Supplier Cost for a Tracking is authoritative in the MVP.

## Balance workflow

Every tracked Order automatically maintains one ORDER_CHARGE DEBIT equal to current Total Due.

Manual/Import ledger entries:
- Payment => CREDIT
- Refund => CREDIT
- Service Cost => DEBIT
- Error Processing => CREDIT
- Error Refund => CREDIT
- Chargeable => DEBIT
- Adjustment Credit / Debit => explicit direction

Manual Balance form supports Customer/User and reference ID.

## Pricing assumptions implemented

- ePacket: Base = 106% Net, Retail = 116% Net.
- Yun Express: Base = 112% Net, Retail = 132% Net.
- UPS: Base = 112% Net, Retail = 132% Net.
- Chuyên tuyến: Base = 115% Net, Retail = 137% Net.
- Sales Price = Retail × (1 - Discount%).
- Total Due = Sales Price + total surcharge + Import Tax + later supplemental surcharge/import tax.
- Chargeable Weight = max(weight kg, volume cm3 / 5000).
- ePacket dimension surcharge: length >75cm => 10.5 USD; else >55cm => 5 USD.
- Manual surcharge is stored separately from auto dimension surcharge so repeated edits/imports are idempotent.

## Existing Report templates still supported

Order intake:
Ngày tạo, Sales, Khách, Supplier, Dịch vụ, Sub-Service, Label, Tracking, Order ID, Net Cost, Base Cost, Retail, Discount, Sales Price, Phụ phí, Thuế NK, Tổng cần thu, recipient/package fields.

Cost intake:
Supplier, Dịch vụ, Sub-Service, Tracking, Ngày, Mặt hàng, Điểm đến, Cân nặng, Net Price, Phụ phí, HQ export/import, Total Net Cost, Phụ phí Bổ sung, Thuế NK, Note.

Balance intake:
- Payment/Refund => CREDIT.
- Service cost => DEBIT.
- Refund/Processing error => CREDIT.
- Chargeable error => DEBIT.

## Production questions

1. Add Customer/User ID to the Excel Balance template if balance is customer-scoped.
2. Confirm whether Tracking is globally unique. Multi-carton may require Tracking + parcel/carton key.
3. Confirm Sales Price formula and whether Discount is always percent.
4. Confirm whether Total Net Cost already includes Net Price + surcharge + export/import customs.
5. Confirm lifecycle/reversal for Processing = + Balance.
6. Provide official remote-area State/ZIP source.
7. Confirm whether supplier payable/receivable needs a separate ledger.
