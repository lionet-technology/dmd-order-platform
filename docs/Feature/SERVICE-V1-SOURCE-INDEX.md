# Authoritative price source — final (2), 16/11/2026

Owner selected the attachment in chat 6ad35267-1ad8-83ec-a691-9d80c58281df, file ID file_00000000ce488211a543524616e03cb2.
The actual attachment was opened from the chat attachment preview path and copied byte-for-byte to [canonical workbook](../data/service-v1/net-cost-final-2.xlsx).
Original Unicode filename: Bảng Net Cost Dịch vụ(2).xlsx.
Size 60,966 bytes; SHA256 `a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2`.

## Verified, not inferred

Three sheets: ePacket, Yun Express, UPS. [Normalized data and every nonblank raw cell](../data/service-v1/net-cost-final-2.json) are reproduced by `scripts/import-final-net-cost.py` with no DB writes.
335 ePacket/Yun rate cells; 3,360 UPS account/sub-service/zone/tier cells, including unavailable `o`; 249 source zone rows.
No formulas in populated source cells. Decimal strings preserve the actual XLSX numeric values, including source floating point tails.

- ePacket US Standard/Eco raw USD: ePacket!A6:C60, max 10kg. Initial FX ePacket!D72 = 26000, monthly Admin-confirmed configuration, not permanent hardcode.
- ePacket EU VND: E6:I35, max 2kg. Its country-to-market table L5:O40 is independent of Yun.
- Yun VND: A5:F25, max 2kg. Country-to-market I6:L41 distinguishes EU 1/EU 2; Austria maps EU 2, Belgium EU 1.
- ePacket fixed VND charges D73:D75: 135000 above 55cm; 285000 above 75cm, noncumulative with 135000; non-cont/APO/FPO/DPO 405000 once. These amounts never multiply by FX. The USD surcharge descriptions in earlier handoff sections are SUPERSEDED.
- UPS: Saver/Express have 44 tiers/account, Expedited 24; nine account/sub-service blocks, 10 zones. FIXED through 20kg, PER_KG above 20 through max 300kg; `o` is unavailable, never zero.
- UPS globals B138:B141: Fuel 0.525, VAT 0.08, Broker 0.03, Customs 10000 VND/kg. Weight surcharge H147:N173 has SDS 50% discount, VTT/JD blank discount = 0. Net Discount and Shipment Surcharge tables have no configured rows: zero according to approved blank-variable rule.
- UPS China excluding South: A189:C189, zone 3. China South G261:I261, source code SO, zone 10. This is a carrier-specific code, not an inferred ISO Somalia mapping. CN alone requires explicit China-region selection. Preserve other special source codes (M1/M2/M3 etc.), duplicate VI/VG/RS source rows and note markers; do not fuzzy-match or silently rewrite geography.

## Source precedence and remaining gates

`Bảng Net Cost Dịch vụ(1)(1).xlsx`, earlier unversioned workbook references, and separate `UPS Zone.pdf` are **SUPERSEDED** by final (2). They are historical references only. The V1 MD handoff remains committed/readable; the Owner need not resend it.

CLOSED: final workbook identity/access, rate/market/UPS-zone source availability, fixed-VND ePacket surcharge/FX relationship, initial markup/global values in this workbook.
This does not certify runtime import, publication, operational Purchase, UAT or production readiness. Source availability is separate from implementation acceptance.
Owner confirmed 17/11/2026: ePacket Standard/Eco Net includes mid-mile + last-mile. Coverage is CLOSED; detailed component accounting/allocation is DEFERRED and does not block V1. No additional mid-mile cost may be assumed on top of inclusive Net. Supplier cancellation/void values and carrier evidence still require configuration per service/route; manual follow-up with Admin-selected percentage/amount is approved. Ambiguous destinations/unsupported source values still require review.
