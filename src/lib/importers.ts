import { readSheet } from "read-excel-file/node";
import { SheetNotFoundError } from "read-excel-file/node";
import { db } from "./db";

type Row = unknown[];
type ImportKind = "orders" | "costs" | "balance";

type OrderRecord = {
  id: number;
  tracking: string | null;
  order_id: string | null;
  customer: string | null;
  created_at: string | null;
  est_net_cost: number;
  sales_price: number;
  surcharge: number;
  import_tax: number;
  extra_surcharge: number;
  extra_import_tax: number;
  total_due: number;
};

const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const nullableNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));
const money = (v: number) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
const norm = (v: unknown) => text(v).toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ");

async function workbookRows(buffer: Buffer): Promise<Row[][]> {
  try {
    return (await readSheet(buffer, "Report")) as Row[][];
  } catch (error) {
    if (error instanceof SheetNotFoundError) return (await readSheet(buffer, 1)) as Row[][];
    throw error;
  }
}

function findHeader(rows: Row[][], mustContain: string[]): number {
  const wanted = mustContain.map((x) => x.toLowerCase());
  return rows.findIndex((row) => {
    const values = row.map(norm);
    return wanted.every((w) => values.some((v) => v.includes(w)));
  });
}

function headerMap(row: Row) {
  const map = new Map<string, number>();
  row.forEach((value, idx) => map.set(norm(value), idx));
  return map;
}

function pick(row: Row, headers: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const exact = headers.get(norm(name));
    if (exact !== undefined) return row[exact];
    for (const [key, idx] of headers) if (key.includes(norm(name))) return row[idx];
  }
  return null;
}

function draftKey(parts: Array<string | number | null | undefined>) {
  return parts.map((x) => norm(x)).filter(Boolean).join("|").slice(0, 500);
}

function pricing(serviceRaw: string, subServiceRaw: string, estNet: number, current: {
  base: number;
  retail: number;
  discount: number;
  salesPrice: number;
  surcharge: number;
  importTax: number;
  weight: number;
  volume: number;
  length: number;
}) {
  const service = norm(serviceRaw);
  const sub = norm(subServiceRaw);
  let base = current.base;
  let retail = current.retail;
  const chargeable = Math.max(current.weight || 0, (current.volume || 0) / 5000);

  if (!base || !retail) {
    if (service.includes("epacket")) {
      base ||= estNet * 1.06;
      retail ||= estNet * 1.16;
    } else if (service.includes("yun express")) {
      base ||= estNet * 1.12;
      retail ||= estNet * 1.32;
    } else if (service.includes("ups") || ["saver", "express", "expedited"].some((x) => sub.includes(x))) {
      base ||= estNet * 1.12;
      retail ||= estNet * 1.32;
    } else if (service.includes("chuyên tuyến") || service.includes("chuyen tuyen")) {
      base ||= estNet * 1.15;
      retail ||= estNet * 1.37;
    }
  }

  let surcharge = current.surcharge || 0;
  if (service.includes("epacket") && current.length > 75) surcharge += 10.5;
  else if (service.includes("epacket") && current.length > 55) surcharge += 5;

  const salesPrice = current.salesPrice || retail * (1 - (current.discount || 0) / 100);
  const totalDue = salesPrice + surcharge + (current.importTax || 0);
  return {
    base: money(base), retail: money(retail), salesPrice: money(salesPrice),
    surcharge: money(surcharge), chargeable, totalDue: money(totalDue),
  };
}

function upsertAutoOrderCharge(order: OrderRecord) {
  if (!order.tracking || !order.total_due) return;
  db.prepare(`
    INSERT INTO ledger_entries(occurred_at, entry_type, direction, amount, customer, reference_type, reference_id, note)
    VALUES (?, 'ORDER_CHARGE', 'DEBIT', ?, ?, 'TRACKING', ?, 'Auto from order total due')
    ON CONFLICT(entry_type, reference_type, reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'ORDER_CHARGE'
    DO UPDATE SET occurred_at=excluded.occurred_at, amount=excluded.amount, customer=excluded.customer
  `).run(order.created_at || null, order.total_due, order.customer || null, order.tracking);
}

function getOrderByTracking(tracking: string): OrderRecord | undefined {
  return db.prepare("SELECT * FROM orders WHERE tracking=?").get(tracking) as OrderRecord | undefined;
}

function applyLatestSupplierCost(tracking: string) {
  const order = getOrderByTracking(tracking);
  if (!order) return false;
  const cost = db.prepare(`
    SELECT total_net_cost, extra_surcharge, import_tax
    FROM supplier_costs WHERE tracking=? ORDER BY id DESC LIMIT 1
  `).get(tracking) as { total_net_cost:number; extra_surcharge:number; import_tax:number } | undefined;
  if (!cost) return false;

  const totalDue = money(Number(order.sales_price || 0) + Number(order.surcharge || 0) + Number(cost.extra_surcharge || 0) + Number(order.import_tax || 0) + Number(cost.import_tax || 0));
  const delta = money(Number(cost.total_net_cost || 0) - Number(order.est_net_cost || 0));
  db.prepare(`
    UPDATE orders SET
      true_net_cost=?, extra_surcharge=?, extra_import_tax=?, total_due=?,
      gross_profit_net=ROUND(sales_price-?, 2), reconciliation_delta=?,
      reconciliation_status=CASE WHEN ? <= est_net_cost THEN 'PASS' ELSE 'REVIEW' END,
      workflow_status='RECONCILED', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(cost.total_net_cost, cost.extra_surcharge, cost.import_tax, totalDue, cost.total_net_cost, delta, cost.total_net_cost, order.id);
  const refreshed = getOrderByTracking(tracking);
  if (refreshed) upsertAutoOrderCharge(refreshed);
  return true;
}

function findPendingOrderByOrderId(orderId: string) {
  if (!orderId) return [] as Array<{id:number}>;
  return db.prepare("SELECT id FROM orders WHERE order_id=? AND (tracking IS NULL OR tracking='') ORDER BY id").all(orderId) as Array<{id:number}>;
}

function importOrders(rows: Row[][], batchId: number) {
  const h = findHeader(rows, ["Ngày tạo", "Sales", "Khách", "Order ID"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Lên đơn.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];

  const insert = db.prepare(`
    INSERT INTO orders(
      created_at,sales,customer,supplier,service,sub_service,label,tracking,order_id,draft_key,workflow_status,
      est_net_cost,base_cost,retail,discount,sales_price,surcharge,import_tax,total_due,
      gross_profit_base,gross_profit_net,note,item,material,declared_value,carton_count,
      length,width,height,volume,weight,chargeable_weight,recipient_name,address1,address2,
      city,state,zip,country,phone,updated_at
    ) VALUES (
      @created_at,@sales,@customer,@supplier,@service,@sub_service,@label,@tracking,@order_id,@draft_key,@workflow_status,
      @est_net_cost,@base_cost,@retail,@discount,@sales_price,@surcharge,@import_tax,@total_due,
      @gross_profit_base,@gross_profit_net,@note,@item,@material,@declared_value,@carton_count,
      @length,@width,@height,@volume,@weight,@chargeable_weight,@recipient_name,@address1,@address2,
      @city,@state,@zip,@country,@phone,CURRENT_TIMESTAMP
    )
  `);

  const updateById = db.prepare(`
    UPDATE orders SET
      created_at=@created_at,sales=@sales,customer=@customer,
      supplier=COALESCE(NULLIF(@supplier,''),supplier),service=@service,sub_service=@sub_service,
      label=COALESCE(NULLIF(@label,''),label),tracking=COALESCE(NULLIF(@tracking,''),tracking),
      order_id=@order_id,draft_key=COALESCE(draft_key,@draft_key),workflow_status=@workflow_status,
      est_net_cost=@est_net_cost,base_cost=@base_cost,retail=@retail,discount=@discount,
      sales_price=@sales_price,surcharge=@surcharge,import_tax=@import_tax,total_due=@total_due,
      gross_profit_base=@gross_profit_base,gross_profit_net=@gross_profit_net,note=@note,item=@item,
      material=@material,declared_value=@declared_value,carton_count=@carton_count,length=@length,
      width=@width,height=@height,volume=@volume,weight=@weight,chargeable_weight=@chargeable_weight,
      recipient_name=@recipient_name,address1=@address1,address2=@address2,city=@city,state=@state,
      zip=@zip,country=@country,phone=@phone,updated_at=CURRENT_TIMESTAMP
    WHERE id=@id
  `);

  const findByDraft = db.prepare("SELECT id FROM orders WHERE draft_key=?");
  const tx = db.transaction(() => {
    rows.slice(h + 1).forEach((row, offset) => {
      if (norm(row[0]).startsWith("rule:")) return;
      const tracking = text(pick(row, headers, "Tracking"));
      const orderId = text(pick(row, headers, "Order ID"));
      const createdAt = text(pick(row, headers, "Ngày tạo"));
      const customer = text(pick(row, headers, "Khách"));
      const service = text(pick(row, headers, "Dịch vụ"));
      const subService = text(pick(row, headers, "Sub-Service"));
      const item = text(pick(row, headers, "Mặt hàng"));
      const recipient = text(pick(row, headers, "Tên người nhận"));
      if (!tracking && !orderId && !createdAt && !customer) return;
      if (!tracking && !orderId) {
        warnings.push(`Bỏ qua dòng ${h + offset + 2}: cần Tracking hoặc Order ID.`);
        return;
      }

      const estNet = num(pick(row, headers, "Net Cost"));
      const discount = num(pick(row, headers, "Discount"));
      const length = num(pick(row, headers, "Dài"));
      const volume = num(pick(row, headers, "Thể tích"));
      const weight = num(pick(row, headers, "Khối lượng"));
      const supplier = text(pick(row, headers, "Supplier"));
      const calc = pricing(service, subService, estNet, {
        base: num(pick(row, headers, "Base Cost")), retail: num(pick(row, headers, "Retail")),
        discount, salesPrice: num(pick(row, headers, "Sales Price")),
        surcharge: num(pick(row, headers, "Phụ phí")), importTax: num(pick(row, headers, "Thuế NK")),
        weight, volume, length,
      });
      const totalDue = num(pick(row, headers, "Tổng cần thu")) || calc.totalDue;
      const dKey = draftKey([orderId, customer, service, subService, item, recipient]);
      const workflow = tracking && supplier && estNet ? "ADMIN_READY" : tracking ? "TRACKING_ASSIGNED" : "SALES_DRAFT";
      const payload = {
        created_at: createdAt || null, sales: text(pick(row, headers, "Sales")), customer,
        supplier, service, sub_service: subService, label: text(pick(row, headers, "Label")),
        tracking: tracking || null, order_id: orderId || null, draft_key: dKey || null, workflow_status: workflow,
        est_net_cost: estNet, base_cost: calc.base, retail: calc.retail, discount, sales_price: calc.salesPrice,
        surcharge: calc.surcharge, import_tax: num(pick(row, headers, "Thuế NK")), total_due: totalDue,
        gross_profit_base: money(calc.salesPrice - calc.base), gross_profit_net: money(calc.salesPrice - estNet),
        note: text(pick(row, headers, "Note")), item, material: text(pick(row, headers, "Chất liệu")),
        declared_value: nullableNum(pick(row, headers, "Giá trị hàng hoá")),
        carton_count: nullableNum(pick(row, headers, "Số lượng Carton")), length,
        width: num(pick(row, headers, "Rộng")), height: num(pick(row, headers, "Cao")), volume, weight,
        chargeable_weight: num(pick(row, headers, "Hạng cân")) || calc.chargeable, recipient_name: recipient,
        address1: text(pick(row, headers, "Địa chỉ*")), address2: text(pick(row, headers, "Địa chỉ 2")),
        city: text(pick(row, headers, "Thành phố*")), state: text(pick(row, headers, "Bang*")),
        zip: text(pick(row, headers, "ZIP*")), country: text(pick(row, headers, "Nước*")),
        phone: text(pick(row, headers, "Điện thoại")),
      };

      let existingId: number | undefined;
      if (tracking) existingId = (db.prepare("SELECT id FROM orders WHERE tracking=?").get(tracking) as {id:number}|undefined)?.id;
      if (!existingId && tracking && orderId) {
        const pending = findPendingOrderByOrderId(orderId);
        if (pending.length === 1) existingId = pending[0].id;
        else if (pending.length > 1) warnings.push(`Order ID ${orderId} có ${pending.length} draft chưa Tracking; không tự merge để tránh sai multi-carton.`);
      }
      if (!existingId && dKey) existingId = (findByDraft.get(dKey) as {id:number}|undefined)?.id;

      if (existingId) updateById.run({ ...payload, id: existingId });
      else insert.run(payload);

      if (tracking) {
        applyLatestSupplierCost(tracking);
        const current = getOrderByTracking(tracking);
        if (current) upsertAutoOrderCharge(current);
      }
      imported++;
    });
  });
  tx();
  return { imported, warnings };
}

function importCosts(rows: Row[][], batchId: number) {
  const h = findHeader(rows, ["Supplier", "Dịch vụ", "Sub-Service", "Tracking", "Total"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Chi phí.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];
  const insert = db.prepare(`
    INSERT INTO supplier_costs(supplier,service,sub_service,tracking,occurred_at,item,destination,weight,net_price,fee,export_customs,import_customs,total_net_cost,extra_surcharge,import_tax,note,batch_id)
    VALUES (@supplier,@service,@sub_service,@tracking,@occurred_at,@item,@destination,@weight,@net_price,@fee,@export_customs,@import_customs,@total_net_cost,@extra_surcharge,@import_tax,@note,@batch_id)
  `);

  db.transaction(() => {
    for (const row of rows.slice(h + 1)) {
      if (norm(row[0]).startsWith("rule:")) break;
      const tracking = text(pick(row, headers, "Tracking"));
      if (!tracking) continue;
      const netPrice = num(pick(row, headers, "Net Price"));
      const fee = num(pick(row, headers, "Phụ phí"));
      const exportCustoms = num(pick(row, headers, "Xuất khẩu"));
      const importCustoms = num(pick(row, headers, "Nhập khẩu"));
      const totalNet = money(num(pick(row, headers, "Total Net Cost", "Total")) || netPrice + fee + exportCustoms + importCustoms);
      const extraSurcharge = money(num(pick(row, headers, "Phụ phí Bổ sung")));
      const importTax = money(num(pick(row, headers, "Thuế NK")));
      insert.run({
        supplier: text(pick(row, headers, "Supplier")), service: text(pick(row, headers, "Dịch vụ")),
        sub_service: text(pick(row, headers, "Sub-Service")), tracking,
        occurred_at: text(pick(row, headers, "Ngày")), item: text(pick(row, headers, "Mặt hàng")),
        destination: text(pick(row, headers, "Điểm đến")), weight: num(pick(row, headers, "Cân nặng")),
        net_price: netPrice, fee, export_customs: exportCustoms, import_customs: importCustoms,
        total_net_cost: totalNet, extra_surcharge: extraSurcharge, import_tax: importTax,
        note: text(pick(row, headers, "Note")), batch_id: batchId,
      });
      if (!applyLatestSupplierCost(tracking)) warnings.push(`Chi phí tracking ${tracking} chưa match được đơn; đã giữ lại để auto-link khi đơn được nhập sau.`);
      imported++;
    }
  })();
  return { imported, warnings };
}

function importBalance(rows: Row[][], batchId: number) {
  const h = findHeader(rows, ["Ngày", "Hạng mục", "Số tiền", "Service", "Status"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Balance.");
  let imported = 0;
  const warnings: string[] = [];
  const ledger = db.prepare(`INSERT INTO ledger_entries(occurred_at,entry_type,direction,amount,reference_type,reference_id,bill_url,note,batch_id)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const serviceCost = db.prepare(`INSERT INTO service_costs(service,from_date,to_date,quantity,total,payment_due_date,note,batch_id)
    VALUES (?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    for (const row of rows.slice(h + 1)) {
      if (norm(row[0]).startsWith("rule:")) break;
      const category = text(row[1]);
      const amount = num(row[2]);
      if (category && amount) {
        const isRefund = norm(category).includes("refund");
        ledger.run(text(row[0]) || null, isRefund ? "REFUND" : "PAYMENT", "CREDIT", amount, "BALANCE_IMPORT", null, text(row[3]), text(row[4]), batchId);
        imported++;
      }
      const service = text(row[6]);
      const total = num(row[10]);
      if (service && total) {
        serviceCost.run(service, text(row[7]), text(row[8]), num(row[9]), total, text(row[11]), text(row[12]), batchId);
        ledger.run(null, "SERVICE_COST", "DEBIT", total, "SERVICE_COST", service, null, text(row[12]), batchId);
        imported++;
      }
      const status = text(row[14]);
      const errorTotal = num(row[18]);
      if (status && errorTotal) {
        const key = norm(status);
        const direction = key.includes("chargeable") || key.includes("chareable") ? "DEBIT" : "CREDIT";
        ledger.run(null, `ERROR_${status.toUpperCase()}`, direction, errorTotal, text(row[15]) || "ERROR", text(row[16]) || null, null, `${text(row[17])} ${text(row[19])}`.trim(), batchId);
        imported++;
      }
    }
  })();
  warnings.push("Template Balance hiện chưa có Customer/User key; PoC ghi ledger global. Nên thêm Customer/User ID trước production.");
  return { imported, warnings };
}

export async function importWorkbook(kind: ImportKind, buffer: Buffer, filename: string) {
  const rows = await workbookRows(buffer);
  const batch = db.prepare("INSERT INTO import_batches(kind,filename) VALUES (?,?)").run(kind, filename);
  const batchId = Number(batch.lastInsertRowid);
  const result = kind === "orders" ? importOrders(rows, batchId) : kind === "costs" ? importCosts(rows, batchId) : importBalance(rows, batchId);
  db.prepare("UPDATE import_batches SET imported_rows=?, warnings=? WHERE id=?").run(result.imported, JSON.stringify(result.warnings), batchId);
  return { batchId, ...result };
}
