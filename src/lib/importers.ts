import { createHash } from "node:crypto";
import { readSheet, SheetNotFoundError } from "read-excel-file/node";
import { db } from "./db";
import { addLedgerEntry, addSupplierCost, norm, normalizeDateInput, num, text, upsertOrder } from "./finance";
import { canonicalEnumValue } from "./enums";
import { findTrackingOwner, replaceOrderTracking } from "./order-operations";
import { logOrderEvent } from "./order-audit";

type Row = unknown[];
type ImportKind = "orders" | "sales_orders" | "costs" | "tracking_updates" | "balance";
type SalesImportContext = { userId:number; displayName:string };

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

function importDate(value: unknown) {
  if (value instanceof Date) return normalizeDateInput(value) || "";
  return text(value);
}

function importOrders(rows: Row[][], actorId?:number) {
  const h = findHeader(rows, ["Sales", "Khách", "Order ID"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Lên đơn.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];

  rows.slice(h + 1).forEach((row, offset) => {
    if (norm(row[0]).startsWith("rule:")) return;
    const tracking = text(pick(row, headers, "Tracking"));
    const orderId = text(pick(row, headers, "Client Order ID", "Order ID"));
    const customer = text(pick(row, headers, "Khách"));
    if (!tracking && !orderId && !customer) return;
    if (!tracking && !orderId) {
      warnings.push(`Bỏ qua dòng ${h + offset + 2}: cần Tracking hoặc Order ID.`);
      return;
    }

    try {
      let salesName = text(pick(row, headers, "Sales"));
      const clientAccount = customer ? db.prepare(`
        SELECT c.id,c.display_name,c.sales_user_id,s.display_name sales_name
        FROM users c LEFT JOIN users s ON s.id=c.sales_user_id
        WHERE c.role='CLIENT' AND c.active=1
          AND (lower(c.display_name)=lower(?) OR lower(c.username)=lower(?))
        LIMIT 1
      `).get(customer,customer) as {id:number;display_name:string;sales_user_id:number|null;sales_name:string|null}|undefined : undefined;
      if(clientAccount?.sales_name)salesName=clientAccount.sales_name;
      const saved = upsertOrder({
        client_user_id: clientAccount?.id || null,
        sales: salesName,
        customer: clientAccount?.display_name || customer,
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
        discount_note:text(pick(row,headers,"Lý do Discount")),
        sales_price: pick(row, headers, "Sales Price") as string | number | null,
        surcharge: pick(row, headers, "Phụ phí") as string | number | null,
        import_tax: pick(row, headers, "Thuế NK") as string | number | null,
        total_due: pick(row, headers, "Tổng cần thu") as string | number | null,
        auto_pricing: false,
        note: text(pick(row, headers, "Note")),
        internal_note: headers.has(norm("Private Note"))||headers.has(norm("Note nội bộ"))?text(pick(row, headers, "Private Note", "Note nội bộ")):undefined,
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
      if (clientAccount) {
        db.prepare("UPDATE orders SET client_user_id=?,sales_user_id=?,sales=? WHERE id=?")
          .run(clientAccount.id,clientAccount.sales_user_id,salesName,saved.id);
      } else if (salesName) {
        const salesUser = db.prepare(
          "SELECT id FROM users WHERE role='SALES' AND active=1 AND (lower(display_name)=lower(?) OR lower(username)=lower(?)) LIMIT 1"
        ).get(salesName, salesName) as { id:number } | undefined;
        if (salesUser) db.prepare("UPDATE orders SET sales_user_id=? WHERE id=?").run(salesUser.id, saved.id);
        else warnings.push("Sales '"+salesName+"' chưa có account tương ứng; order vẫn import nhưng chỉ Admin thấy.");
      }
      const after=db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id);
      logOrderEvent({orderId:saved.id,eventType:"ORDER_IMPORTED",summary:"Order được nhập từ file Admin.",actorId,source:"IMPORT",after});
      imported++;
    } catch (error) {
      warnings.push(`Dòng ${h + offset + 2}: ${error instanceof Error ? error.message : "không thể lưu"}`);
    }
  });

  return { imported, warnings };
}

function importSalesOrders(rows: Row[][], actor: SalesImportContext) {
  const h = findHeader(rows, ["Khách", "Order ID"]);
  if (h < 0) throw new Error("Không tìm thấy header Template Lên đơn Sales.");
  const headers = headerMap(rows[h]);
  let imported = 0;
  const warnings: string[] = [];

  rows.slice(h + 1).forEach((row, offset) => {
    if (norm(row[0]).startsWith("rule:")) return;
    const orderId = text(pick(row, headers, "Client Order ID", "Order ID"));
    const customer = text(pick(row, headers, "Khách"));
    if (!orderId && !customer) return;
    if (!orderId) {
      warnings.push(`Bỏ qua dòng ${h + offset + 2}: Sales import bắt buộc Order ID.`);
      return;
    }

    try {
      const clientAccount = db.prepare(`
        SELECT id,display_name FROM users
        WHERE role='CLIENT' AND active=1 AND sales_user_id=?
          AND (lower(display_name)=lower(?) OR lower(username)=lower(?))
        LIMIT 1
      `).get(actor.userId,customer,customer) as {id:number;display_name:string}|undefined;
      if(!clientAccount){
        warnings.push(`Dòng ${h + offset + 2}: Client '${customer}' không tồn tại hoặc không thuộc Sales đang đăng nhập.`);
        return;
      }

      const matches = db.prepare("SELECT id,client_user_id FROM orders WHERE order_id=? ORDER BY id")
        .all(orderId) as Array<{id:number;client_user_id:number|null}>;
      if (matches.length > 1) {
        warnings.push(`Dòng ${h + offset + 2}: Order ID ${orderId} có nhiều record; Admin cần xử lý multi-carton.`);
        return;
      }
      let existingId: number | undefined;
      if (matches.length === 1) {
        if (matches[0].client_user_id === null) {
          warnings.push(`Dòng ${h + offset + 2}: Order ID ${orderId} đang chưa gán Client; Admin cần assign trước.`);
          return;
        }
        if (matches[0].client_user_id !== clientAccount.id) {
          warnings.push(`Dòng ${h + offset + 2}: Order ID ${orderId} thuộc Client khác.`);
          return;
        }
        existingId = matches[0].id;
      }

      const saved = upsertOrder({
        id: existingId,
        client_user_id: clientAccount.id,
        sales: actor.displayName,
        customer: clientAccount.display_name,
        service: text(pick(row, headers, "Dịch vụ")),
        sub_service: text(pick(row, headers, "Sub-Service")),
        order_id: orderId,
        note: text(pick(row, headers, "Note")),
        internal_note: headers.has(norm("Private Note"))||headers.has(norm("Note nội bộ"))?text(pick(row, headers, "Private Note", "Note nội bộ")):undefined,
        item: text(pick(row, headers, "Mặt hàng")),
        material: text(pick(row, headers, "Chất liệu")),
        declared_value: pick(row, headers, "Giá trị hàng hoá") as string | number | null,
        carton_count: pick(row, headers, "Số lượng Carton") as string | number | null,
        length: pick(row, headers, "Dài") as string | number | null,
        width: pick(row, headers, "Rộng") as string | number | null,
        height: pick(row, headers, "Cao") as string | number | null,
        manual_volume:pick(row,headers,"Thể tích") as string|number|null,
        discount:pick(row,headers,"Discount") as string|number|null,
        discount_note:text(pick(row,headers,"Lý do Discount")),
        weight: pick(row, headers, "Khối lượng") as string | number | null,
        recipient_name: text(pick(row, headers, "Tên người nhận")),
        address1: text(pick(row, headers, "Địa chỉ*")),
        address2: text(pick(row, headers, "Địa chỉ 2")),
        city: text(pick(row, headers, "Thành phố*")),
        state: text(pick(row, headers, "Bang*")),
        zip: text(pick(row, headers, "ZIP*")),
        country: text(pick(row, headers, "Nước*")),
        phone: text(pick(row, headers, "Điện thoại")),
      }) as { id:number };

      db.prepare(
        "UPDATE orders SET client_user_id=?,sales_user_id=?,customer=?,sales=?,created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?"
      ).run(clientAccount.id, actor.userId, clientAccount.display_name, actor.displayName, actor.userId, actor.userId, saved.id);
      const after=db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id);
      logOrderEvent({orderId:saved.id,eventType:"ORDER_IMPORTED",summary:"Order được nhập từ file Sales.",actorId:actor.userId,source:"IMPORT",after});
      imported++;
    } catch (error) {
      warnings.push(`Dòng ${h + offset + 2}: ${error instanceof Error ? error.message : "không thể lưu"}`);
    }
  });

  return { imported, warnings };
}

function importCosts(rows: Row[][], batchId: number, actorId?:number) {
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
      occurred_at: importDate(pick(row, headers, "Ngày")),
      item: text(pick(row, headers, "Mặt hàng")),
      destination: text(pick(row, headers, "Điểm đến")),
      weight: pick(row, headers, "Cân nặng") as string | number | null,
      net_price: pick(row, headers, "Net Price") as string | number | null,
      fee: pick(row, headers, "Phụ phí") as string | number | null,
      export_customs: pick(row, headers, "Xuất khẩu") as string | number | null,
      import_customs: pick(row, headers, "Nhập khẩu") as string | number | null,
      total_net_cost: pick(row, headers, "Total Net Cost", "Total") as string | number | null,
      extra_surcharge: pick(row, headers, "Phụ phí Bổ sung") as string | number | null,
      surcharge_type: text(pick(row, headers, "Loại phụ phí")),
      import_tax: pick(row, headers, "Thuế NK") as string | number | null,
      note: text(pick(row, headers, "Note")),
      batch_id: batchId,
      source_key:createHash("sha256").update(JSON.stringify(row.map(value=>value instanceof Date?value.toISOString():String(value??"").trim()))).digest("hex"),
    });
    if (result.warning) warnings.push(`Tracking ${tracking}: ${result.warning}`);
    if(!result.duplicate){
      db.prepare("UPDATE supplier_costs SET created_by_user_id=? WHERE id=?").run(actorId||null,result.id);
      const cost=db.prepare("SELECT matched_order_id,tracking,total_net_cost,extra_surcharge,import_tax,surcharge_type,note FROM supplier_costs WHERE id=?").get(result.id) as {matched_order_id:number|null;tracking:string;total_net_cost:number;extra_surcharge:number;import_tax:number;surcharge_type:string|null;note:string|null}|undefined;
      if(cost?.matched_order_id)logOrderEvent({orderId:cost.matched_order_id,eventType:"SUPPLIER_COST_IMPORTED",summary:`Cập nhật chi phí theo Tracking ${cost.tracking}: Net Cost True ${cost.total_net_cost} USD, phụ phí ${cost.extra_surcharge||0} USD, thuế NK ${cost.import_tax||0} USD.`,actorId,visibility:"ADMIN",source:"IMPORT",after:cost});
      imported++;
    }
  }
  return { imported, warnings };
}

function importTrackingUpdates(rows:Row[][],actorId?:number){
  const h=findHeader(rows,["Tracking cũ","Tracking mới"]);
  if(h<0)throw new Error("Không tìm thấy header Template đổi Tracking.");
  const headers=headerMap(rows[h]);let imported=0;const warnings:string[]=[];
  for(const [offset,row] of rows.slice(h+1).entries()){
    if(norm(row[0]).startsWith("rule:"))break;
    const oldTracking=text(pick(row,headers,"Tracking cũ"));const newTracking=text(pick(row,headers,"Tracking mới"));
    if(!oldTracking&&!newTracking)continue;
    try{
      if(!oldTracking||!newTracking)throw new Error("Tracking cũ và Tracking mới là bắt buộc.");
      const owner=findTrackingOwner(oldTracking);if(!owner)throw new Error("Không tìm thấy Tracking cũ.");
      const reason=text(pick(row,headers,"Lý do"));
      const replacement=replaceOrderTracking({orderId:owner.order_id,oldTrackingId:owner.id,newTracking,newLabelUrl:text(pick(row,headers,"URL Label mới")),reason,actorId});
      logOrderEvent({orderId:owner.order_id,eventType:"TRACKING_REPLACED",summary:`Đổi Tracking ${oldTracking} → ${newTracking}.${reason?` Lý do: ${reason}.`:""}`,actorId,source:"IMPORT",before:owner,after:replacement});
      imported++;
    }catch(error){warnings.push(`Dòng ${h+offset+2}: ${error instanceof Error?error.message:"không thể đổi Tracking"}`)}
  }
  return {imported,warnings};
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
        occurred_at: importDate(row[0]) || null,
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

    const serviceRaw = text(row[6]);
    let service = "";
    if (serviceRaw) {
      try { service = canonicalEnumValue("SERVICE", serviceRaw); }
      catch (error) { warnings.push(`Service "${serviceRaw}": ${error instanceof Error ? error.message : "không hợp lệ"}`); }
    }
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

export async function importWorkbook(
  kind: ImportKind,
  buffer: Buffer,
  filename: string,
  options?: { salesActor?: SalesImportContext; actorId?:number },
) {
  const rows = await workbookRows(buffer);
  return db.transaction(()=>{
  const batch = db.prepare("INSERT INTO import_batches(kind,filename) VALUES (?,?)").run(kind, filename);
  const batchId = Number(batch.lastInsertRowid);
  let result: { imported:number; warnings:string[] };
  if (kind === "orders") result = importOrders(rows,options?.actorId);
  else if (kind === "sales_orders") {
    if (!options?.salesActor) throw new Error("Sales context is required.");
    result = importSalesOrders(rows, options.salesActor);
  } else if (kind === "costs") result = importCosts(rows, batchId,options?.actorId);
  else if(kind==="tracking_updates")result=importTrackingUpdates(rows,options?.actorId);
  else result = importBalance(rows, batchId);
  db.prepare("UPDATE import_batches SET imported_rows=?, warnings=? WHERE id=?").run(result.imported, JSON.stringify(result.warnings), batchId);
  return { batchId, ...result };
  })();
}
