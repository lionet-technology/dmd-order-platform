# ePacket / T11 / DMD

`purchase.xlsx` buys labels before tracking is assigned. `manifest.xlsx` declares the cartons actually shipped using only the scanned active tracking/carton selection. Both repeat Sheet1 row 2 per carton and combine orders into one workbook. Apply variables from `route.json` only to this route.

Purchase mapping: Order Partner uses `order.client_order_id` (sample DEMO01); HAWBValue (USD) uses `carton.total_manufacturing_value`, the sum of allocated quantities × unit manufacturing values. These interpretations fit the source columns and examples; the supplier files do not contain explicit definitions. Values must be entered in USD; this template does not convert currency.

Purchase uses EPK / T11; TrackingNumber stays blank. Manifest uses Epacket Zero, carton tracking, kg × 1000 for grams, and the confirmed Hanoi return address. The first item in each carton supplies its description, quantity (default 1), and unit value; carton price remains the total across all allocated items. Recipient email is optional. Item name, HS code and customer note stay blank as requested.

Supplier headers, styles, validations and notes are retained. Sample shipment rows are cleared. Upload each file under its corresponding template kind, validate, preview and activate. Activation updates local database state; the committed workbooks and route settings provide the reproducible configuration.
