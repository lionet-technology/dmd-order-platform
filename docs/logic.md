# DMD linked input logic

## Source templates from `Report`

### Order intake (row 64)
`Ngày tạo, Sales, Khách, Supplier, Dịch vụ, Sub-Service, Label, Tracking, Order ID, Net Cost, Base Cost, Retail, Discount, Sales Price, Phụ phí, Thuế NK, Tổng cần thu, ...recipient/package fields`

Color semantics observed in the source workbook:
- Red: Admin-only input (`Supplier`, `Net Cost`).
- Yellow: Admin result/return-to-Sales fields (`Label`, `Tracking`, `Base Cost`, `Retail`, `Phụ phí`, `Thuế NK`, etc.).

MVP stores one canonical order row and uses Admin/Sales views instead of two independent files.

### Cost intake (row 95)
`Supplier, Dịch vụ, Sub-Service, Tracking, Ngày, Mặt hàng, Điểm đến, Cân nặng, Net Price, Phụ phí, Phí HQ Xuất khẩu, Phí HQ Nhập khẩu, Total Net Cost, Phụ phí Bổ sung, Thuế NK, Note`

Link rule:
- Match `Tracking` to order.
- `True Net Cost = Total Net Cost` (fallback = component sum if Total missing).
- If `True Net <= Estimated Net` => PASS.
- If `True Net > Estimated Net` => REVIEW.
- Extra surcharge/import tax augment the order charge without overwriting original estimate fields.

### Balance intake (row 83)
Three parallel sections:
1. Payment/Refund (`A:E`) => CREDIT balance.
2. Service cost (`G:M`) => DEBIT balance.
3. Error (`O:T`): Refund/Processing => CREDIT; Chargeable => DEBIT.

Every order automatically creates/updates an `ORDER_CHARGE` DEBIT equal to Total Due.

## Pricing assumptions implemented
- ePacket: Base = 106% Net, Retail = 116% Net.
- Yun Express: Base = 112% Net, Retail = 132% Net.
- UPS: Base = 112% Net, Retail = 132% Net.
- Chuyên tuyến: Base = 115% Net, Retail = 137% Net.
- Sales Price = Retail × (1 - Discount%).
- Total Due = Sales Price + Surcharge + Import Tax + later supplemental surcharge/import tax.
- Chargeable Weight = max(weight kg, volume cm3 / 5000).
- ePacket dimension surcharge: length >75cm => 10.5 USD; else >55cm => 5 USD.

## Production questions
1. Balance template needs Customer/User ID if debt/balance is customer-scoped. Current template does not contain it.
2. Confirm whether Tracking is globally unique. Multi-carton workflows may require `(Tracking, carton)` or another key.
3. Confirm Sales Price formula and whether Discount is percent vs amount.
4. Confirm whether `Total Net Cost` already includes Net Price + surcharge + export/import customs.
5. Confirm lifecycle for `Processing = + Balance`: temporary credit or final accounting entry?
6. Provide remote-area state/ZIP list for automatic surcharge.
7. Confirm whether supplier payable/receivable needs its own ledger instead of being derived only from cost rows.
