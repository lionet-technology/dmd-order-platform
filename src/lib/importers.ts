import { readSheet, SheetNotFoundError } from "read-excel-file/node";
import { db } from "./db";
import { addLedgerEntry, addSupplierCost, norm, num, text, upsertOrder } from "./finance";

type Row = unknown[];
type ImportKind = "orders" | "costs" | "balance";

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

function importOrders(rows: Row[][]) {
  const h = findHeader(rows, ["Ngày tạo", "Sales", "Khách", "Order ID"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Lên đơn.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];

  rows.slice(h + 1).forEach((row, offset) => {
    if (norm(row[0]).startsWith("rule:")) return;
    const tracking = text(pick(row, headers, "Tracking"));
    const orderId = text(pick(row, headers, "Order ID"));
    const createdAt = text(pick(row, headers, "Ngày tạo"));
    const customer = text(pick(row, headers, "Khách"));
    if (!tracking && !orderId && !createdAt && !customer) return;
    if (!tracking && !orderId) {
      warnings.push(`Bỏ qua dòng ${h + offset + 2}: cần Tracking hoặc Order ID.`);
      return;
    }

    try {
      const salesName = text(pick(row, headers, "Sales"));
      const saved = upsertOrder({
        created_at: createdAt || null,
        sales: salesName,
        customer,
        supplier: text(pick(row, headers, "Supplier")),
        service: text(pick(row, headers, "Dịch vụ")),
        sub_service: text(pick(row, headers, "Sub-Service")),
        label: text(pick(row, headers, "Label")),
        tracking: tracking || null,
        order_id: orderId || null,
        est_net_cost: pick(row, headers, "Net Cost") as string | number | null,
        base_cost: pick(row, headers, "Base Cost") as string | number | null,
        retail: pick(row, headers, "Retail") as string | number | null,
        discount: pick(row, headers, "Discount") as string | number | null,
        sales_price: pick(row, headers, "Sales Price") as string | number | null,
        surcharge: pick(row, headers, "Phụ phí") as string | number | null,
        import_tax: pick(row, headers, "Thuế NK") as string | number | null,
        total_due: pick(row, headers, "Tổng cần thu") as string | number | null,
        auto_pricing: false,
        note: text(pick(row, headers, "Note")),
        item: text(pick(row, headers, "Mặt hàng")),
        material: text(pick(row, headers, "Chất liệu")),
        declared_value: pick(row, headers, "Giá trị hàng hoá") as string | number | null,
        carton_count: pick(row, headers, "Số lượng Carton") as string | number | null,
        length: pick(row, headers, "Dài") as string | number | null,
        width: pick(row, headers, "Rộng") as string | number | null,
        height: pick(row, headers, "Cao") as string | number | null,
        volume: pick(row, headers, "Thể tích") as string | number | null,
        weight: pick(row, headers, "Khối lượng") as string | number | null,
        chargeable_weight: pick(row, headers, "Hạng cân") as string | number | null,
        recipient_name: text(pick(row, headers, "Tên người nhận")),
        address1: text(pick(row, headers, "Địa chỉ*")),
        address2: text(pick(row, headers, "Địa chỉ 2")),
        city: text(pick(row, headers, "Thành phố*")),
        state: text(pick(row, headers, "Bang*")),
        zip: text(pick(row, headers, "ZIP*")),
        country: text(pick(row, headers, "Nước*")),
        phone: text(pick(row, headers, "Điện thoại")),
      }) as { id:number };
      if (salesName) {
        const salesUser = db.prepare(
          "SELECT id FROM users WHERE role='SALES' AND active=1 AND (lower(display_name)=lower(?) OR lower(username)=lower(?)) LIMIT 1"
        ).get(salesName, salesName) as { id:number } | undefined;
        if (salesUser) db.prepare("UPDATE orders SET sales_user_id=? WHERE id=?").run(salesUser.id, saved.id);
        else warnings.push("Sales '"+salesName+"' chưa có account tương ứng; order vẫn import nhưng chỉ Admin thấy.");
      }
      imported++;
    } catch (error) {
      warnings.push(`Dòng ${h + offset + 2}: ${error instanceof Error ? error.message : "không thể lưu"}`);
    }
  });

  return { imported, warnings };
}

function importCosts(rows: Row[][], batchId: number) {
  const h = findHeader(rows, ["Supplier", "Dịch vụ", "Sub-Service", "Tracking", "Total"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Chi phí.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];

  for (const row of rows.slice(h + 1)) {
    if (norm(row[0]).startsWith("rule:")) break;
    const tracking = text(pick(row, headers, "Tracking"));
    if (!tracking) continue;
    const result = addSupplierCost({
      supplier: text(pick(row, headers, "Supplier")),
      service: text(pick(row, headers, "Dịch vụ")),
      sub_service: text(pick(row, headers, "Sub-Service")),
      tracking,
      occurred_at: text(pick(row, headers, "Ngày")),
      item: text(pick(row, headers, "Mặt hàng")),
      destination: text(pick(row, headers, "Điểm đến")),
      weight: pick(row, headers, "Cân nặng") as string | number | null,
      net_price: pick(row, headers, "Net Price") as string | number | null,
      fee: pick(row, headers, "Phụ phí") as string | number | null,
      export_customs: pick(row, headers, "Xuất khẩu") as string | number | null,
      import_customs: pick(row, headers, "Nhập khẩu") as string | number | null,
      total_net_cost: pick(row, headers, "Total Net Cost", "Total") as string | number | null,
      extra_surcharge: pick(row, headers, "Phụ phí Bổ sung") as string | number | null,
      import_tax: pick(row, headers, "Thuế NK") as string | number | null,
      note: text(pick(row, headers, "Note")),
      batch_id: batchId,
    });
    if (result.warning) warnings.push(`Tracking ${tracking}: ${result.warning}`);
    imported++;
  }
  return { imported, warnings };
}

function importBalance(rows: Row[][], batchId: number) {
  const h = findHeader(rows, ["Ngày", "Hạng mục", "Số tiền", "Service", "Status"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Balance.");
  let imported = 0;
  const warnings: string[] = [];

  for (const row of rows.slice(h + 1)) {
    if (norm(row[0]).startsWith("rule:")) break;

    const category = text(row[1]);
    const amount = num(row[2]);
    if (category && amount) {
      addLedgerEntry({
        occurred_at: text(row[0]) || null,
        entry_type: norm(category).includes("refund") ? "REFUND" : "PAYMENT",
        direction: "CREDIT",
        amount,
        reference_type: "BALANCE_IMPORT",
        bill_url: text(row[3]),
        note: text(row[4]),
        batch_id: batchId,
      });
      imported++;
    }

    const service = text(row[6]);
    const total = num(row[10]);
    if (service && total) {
      db.prepare(`
        INSERT INTO service_costs(service,from_date,to_date,quantity,total,payment_due_date,note,batch_id)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(service, text(row[7]), text(row[8]), num(row[9]), total, text(row[11]), text(row[12]), batchId);
      addLedgerEntry({
        entry_type: "SERVICE_COST",
        direction: "DEBIT",
        amount: total,
        reference_type: "SERVICE_COST",
        reference_id: service,
        note: text(row[12]),
        batch_id: batchId,
      });
      imported++;
    }

    const status = text(row[14]);
    const errorTotal = num(row[18]);
    if (status && errorTotal) {
      const key = norm(status);
      addLedgerEntry({
        entry_type: key.includes("chargeable") || key.includes("chareable") ? "ERROR_CHARGEABLE" : key.includes("processing") ? "ERROR_PROCESSING" : "ERROR_REFUND",
        direction: key.includes("chargeable") || key.includes("chareable") ? "DEBIT" : "CREDIT",
        amount: errorTotal,
        reference_type: text(row[15]) || "ERROR",
        reference_id: text(row[16]) || null,
        note: `${text(row[17])} ${text(row[19])}`.trim(),
        batch_id: batchId,
      });
      imported++;
    }
  }

  warnings.push("Template Balance hiện chưa có Customer/User key; PoC ghi ledger global. Nên thêm Customer/User ID trước production.");
  return { imported, warnings };
}

export async function importWorkbook(kind: ImportKind, buffer: Buffer, filename: string) {
  const rows = await workbookRows(buffer);
  const batch = db.prepare("INSERT INTO import_batches(kind,filename) VALUES (?,?)").run(kind, filename);
  const batchId = Number(batch.lastInsertRowid);
  const result = kind === "orders" ? importOrders(rows) : kind === "costs" ? importCosts(rows, batchId) : importBalance(rows, batchId);
  db.prepare("UPDATE import_batches SET imported_rows=?, warnings=? WHERE id=?").run(result.imported, JSON.stringify(result.warnings), batchId);
  return { batchId, ...result };
}
