import { db } from "./db";
import { validateOrderEnums, validateSupplierCostEnums } from "./enums";

export type OrderInput = {
  id?: number;
  created_at?: string | null;
  sales?: string;
  customer?: string;
  supplier?: string;
  service?: string;
  sub_service?: string;
  label?: string;
  tracking?: string | null;
  order_id?: string | null;
  est_net_cost?: number | string | null;
  base_cost?: number | string | null;
  retail?: number | string | null;
  discount?: number | string | null;
  sales_price?: number | string | null;
  surcharge?: number | string | null;
  import_tax?: number | string | null;
  total_due?: number | string | null;
  auto_pricing?: boolean | number | string | null;
  note?: string;
  item?: string;
  material?: string;
  declared_value?: number | string | null;
  carton_count?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  volume?: number | string | null;
  weight?: number | string | null;
  chargeable_weight?: number | string | null;
  recipient_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

export type SupplierCostInput = {
  supplier?: string;
  service?: string;
  sub_service?: string;
  tracking: string;
  occurred_at?: string | null;
  item?: string;
  destination?: string;
  weight?: number | string | null;
  net_price?: number | string | null;
  fee?: number | string | null;
  export_customs?: number | string | null;
  import_customs?: number | string | null;
  total_net_cost?: number | string | null;
  extra_surcharge?: number | string | null;
  import_tax?: number | string | null;
  note?: string;
  batch_id?: number | null;
};

export type LedgerInput = {
  occurred_at?: string | null;
  entry_type: string;
  direction?: "CREDIT" | "DEBIT";
  amount: number | string;
  customer?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  bill_url?: string | null;
  note?: string | null;
  batch_id?: number | null;
};

type OrderRecord = Record<string, unknown> & {
  id: number;
  tracking: string | null;
  order_id: string | null;
  customer: string | null;
  created_at: string | null;
  service: string | null;
  sub_service: string | null;
  supplier: string | null;
  country: string | null;
  est_net_cost: number;
  sales_price: number;
  manual_surcharge: number;
  surcharge: number;
  import_tax: number;
  extra_surcharge: number;
  extra_import_tax: number;
  total_due: number;
  auto_pricing?: number;
};

export const text = (v: unknown) => String(v ?? "").trim();
export const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const nullableNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));
export const money = (v: number) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
export const norm = (v: unknown) => text(v).toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ");

export function normalizeDateInput(value: unknown, field = "Ngày") {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = text(value);
  let day: number;
  let month: number;
  let year: number;

  const displayMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (displayMatch) {
    day = Number(displayMatch[1]);
    month = Number(displayMatch[2]);
    year = Number(displayMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    throw new Error(`${field} phải đúng định dạng dd/mm/yyyy.`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${field} không hợp lệ.`);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function draftKey(parts: Array<string | number | null | undefined>) {
  return parts.map((x) => norm(x)).filter(Boolean).join("|").slice(0, 500);
}

export function pricing(serviceRaw: string, subServiceRaw: string, estNet: number, current: {
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
    base: money(base),
    retail: money(retail),
    salesPrice: money(salesPrice),
    surcharge: money(surcharge),
    chargeable,
    totalDue: money(totalDue),
  };
}

export function getOrderByTracking(tracking: string) {
  return db.prepare("SELECT * FROM orders WHERE tracking=?").get(tracking) as OrderRecord | undefined;
}

export function upsertAutoOrderCharge(order: OrderRecord) {
  if (!order.tracking || !order.total_due) return;
  db.prepare(`
    INSERT INTO ledger_entries(occurred_at, entry_type, direction, amount, customer, reference_type, reference_id, note)
    VALUES (?, 'ORDER_CHARGE', 'DEBIT', ?, ?, 'TRACKING', ?, 'Auto from order total due')
    ON CONFLICT(entry_type, reference_type, reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'ORDER_CHARGE'
    DO UPDATE SET occurred_at=excluded.occurred_at, amount=excluded.amount, customer=excluded.customer
  `).run(order.created_at || null, order.total_due, order.customer || null, order.tracking);
}

export function applyLatestSupplierCost(tracking: string) {
  const order = getOrderByTracking(tracking);
  if (!order) return false;
  const cost = db.prepare(`
    SELECT total_net_cost, extra_surcharge, import_tax
    FROM supplier_costs WHERE tracking=? ORDER BY id DESC LIMIT 1
  `).get(tracking) as { total_net_cost:number; extra_surcharge:number; import_tax:number } | undefined;
  if (!cost) return false;

  const totalDue = money(
    Number(order.sales_price || 0) +
    Number(order.surcharge || 0) +
    Number(cost.extra_surcharge || 0) +
    Number(order.import_tax || 0) +
    Number(cost.import_tax || 0)
  );
  const delta = money(Number(cost.total_net_cost || 0) - Number(order.est_net_cost || 0));
  db.prepare(`
    UPDATE orders SET
      true_net_cost=?, extra_surcharge=?, extra_import_tax=?, total_due=?,
      gross_profit_net=ROUND(sales_price-?, 2),
      gross_margin_pct=CASE WHEN sales_price>0 THEN ROUND(((sales_price-?)/sales_price)*100,2) ELSE 0 END,
      margin_status=CASE WHEN sales_price>0 AND ((sales_price-?)/sales_price)*100<15 THEN 'LOW_MARGIN' ELSE 'OK' END,
      reconciliation_delta=?,
      reconciliation_status=CASE WHEN ? <= est_net_cost THEN 'PASS' ELSE 'REVIEW' END,
      workflow_status='RECONCILED', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(cost.total_net_cost, cost.extra_surcharge, cost.import_tax, totalDue, cost.total_net_cost, cost.total_net_cost, cost.total_net_cost, delta, cost.total_net_cost, order.id);
  const refreshed = getOrderByTracking(tracking);
  if (refreshed) upsertAutoOrderCharge(refreshed);
  return true;
}

function findPendingOrderByOrderId(orderId: string) {
  if (!orderId) return [] as Array<{id:number}>;
  return db.prepare("SELECT id FROM orders WHERE order_id=? AND (tracking IS NULL OR tracking='') ORDER BY id").all(orderId) as Array<{id:number}>;
}

function findOrder(input: OrderInput, tracking: string, orderId: string, key: string) {
  if (input.id) {
    const byId = db.prepare("SELECT * FROM orders WHERE id=?").get(input.id) as OrderRecord | undefined;
    if (byId) return byId;
  }
  if (tracking) {
    const byTracking = getOrderByTracking(tracking);
    if (byTracking) return byTracking;
  }
  if (tracking && orderId) {
    const pending = findPendingOrderByOrderId(orderId);
    if (pending.length === 1) return db.prepare("SELECT * FROM orders WHERE id=?").get(pending[0].id) as OrderRecord;
    if (pending.length > 1) throw new Error(`Order ID ${orderId} có nhiều draft chưa Tracking. Chọn đúng record để tránh merge sai multi-carton.`);
  }
  if (key) {
    const byDraft = db.prepare("SELECT * FROM orders WHERE draft_key=?").get(key) as OrderRecord | undefined;
    if (byDraft) return byDraft;
  }
  return undefined;
}

function stringValue(input: OrderInput, key: keyof OrderInput, existing?: OrderRecord) {
  const incoming = input[key];
  if (incoming !== undefined && incoming !== null && String(incoming).trim() !== "") return text(incoming);
  return text(existing?.[String(key)]);
}

function numericValue(input: OrderInput, key: keyof OrderInput, existing?: OrderRecord) {
  const incoming = input[key];
  if (incoming !== undefined && incoming !== null && incoming !== "") return num(incoming);
  return num(existing?.[String(key)]);
}

export function upsertOrder(input: OrderInput) {
  const initialOrderId = text(input.order_id);
  const initialTracking = text(input.tracking);
  const preliminaryKey = draftKey([
    initialOrderId,
    input.customer,
    input.service,
    input.sub_service,
    input.item,
    input.recipient_name,
  ]);
  const existing = findOrder(input, initialTracking, initialOrderId, preliminaryKey);

  const orderId = stringValue(input, "order_id", existing);
  const tracking = stringValue(input, "tracking", existing);
  if (!orderId && !tracking) throw new Error("Cần Order ID hoặc Tracking.");

  const customer = stringValue(input, "customer", existing);
  const enumValues = validateOrderEnums({
    service: input.service,
    sub_service: input.sub_service,
    supplier: input.supplier,
    country: input.country,
  }, existing);
  const service = enumValues.service;
  const subService = enumValues.sub_service;
  const item = stringValue(input, "item", existing);
  const recipient = stringValue(input, "recipient_name", existing);
  const length = numericValue(input, "length", existing);
  const width = numericValue(input, "width", existing);
  const height = numericValue(input, "height", existing);
  const volume = input.volume !== undefined && input.volume !== null && input.volume !== ""
    ? num(input.volume)
    : money(length * width * height);
  const weight = numericValue(input, "weight", existing);
  const estNet = numericValue(input, "est_net_cost", existing);
  const discount = numericValue(input, "discount", existing);
  const supplier = enumValues.supplier;

  const manualSurcharge = input.surcharge !== undefined && input.surcharge !== null && input.surcharge !== ""
    ? num(input.surcharge)
    : num(existing?.manual_surcharge);

  const autoPricing = input.auto_pricing !== undefined && input.auto_pricing !== null
    ? !["0","false","off"].includes(String(input.auto_pricing).toLowerCase())
    : existing ? Boolean(existing.auto_pricing) : true;

  const calc = pricing(service, subService, estNet, {
    base: autoPricing ? 0 : numericValue(input, "base_cost", existing),
    retail: autoPricing ? 0 : numericValue(input, "retail", existing),
    discount,
    salesPrice: autoPricing ? 0 : numericValue(input, "sales_price", existing),
    surcharge: manualSurcharge,
    importTax: numericValue(input, "import_tax", existing),
    weight,
    volume,
    length,
  });

  const payload = {
    created_at: normalizeDateInput(stringValue(input, "created_at", existing), "Ngày tạo"),
    sales: stringValue(input, "sales", existing),
    customer,
    supplier,
    service,
    sub_service: subService,
    label: stringValue(input, "label", existing),
    tracking: tracking || null,
    order_id: orderId || null,
    draft_key: draftKey([orderId, customer, service, subService, item, recipient]) || null,
    workflow_status: tracking && supplier && estNet ? "ADMIN_READY" : tracking ? "TRACKING_ASSIGNED" : "SALES_DRAFT",
    est_net_cost: estNet,
    base_cost: calc.base,
    retail: calc.retail,
    discount,
    sales_price: calc.salesPrice,
    auto_pricing: autoPricing ? 1 : 0,
    manual_surcharge: money(manualSurcharge),
    surcharge: calc.surcharge,
    import_tax: numericValue(input, "import_tax", existing),
    total_due: input.total_due !== undefined && input.total_due !== null && input.total_due !== "" ? money(num(input.total_due)) : calc.totalDue,
    gross_profit_base: money(calc.salesPrice - calc.base),
    gross_profit_net: money(calc.salesPrice - estNet),
    gross_margin_pct: calc.salesPrice > 0 ? money(((calc.salesPrice - estNet) / calc.salesPrice) * 100) : 0,
    margin_status: calc.salesPrice > 0 && ((calc.salesPrice - estNet) / calc.salesPrice) * 100 < 15 ? "LOW_MARGIN" : "OK",
    note: stringValue(input, "note", existing),
    item,
    material: stringValue(input, "material", existing),
    declared_value: input.declared_value !== undefined ? nullableNum(input.declared_value) : nullableNum(existing?.declared_value),
    carton_count: input.carton_count !== undefined ? nullableNum(input.carton_count) : nullableNum(existing?.carton_count),
    length,
    width,
    height,
    volume,
    weight,
    chargeable_weight: input.chargeable_weight !== undefined && input.chargeable_weight !== null && input.chargeable_weight !== ""
      ? num(input.chargeable_weight)
      : calc.chargeable,
    recipient_name: recipient,
    address1: stringValue(input, "address1", existing),
    address2: stringValue(input, "address2", existing),
    city: stringValue(input, "city", existing),
    state: stringValue(input, "state", existing),
    zip: stringValue(input, "zip", existing),
    country: enumValues.country,
    phone: stringValue(input, "phone", existing),
  };

  let id: number;
  if (existing) {
    db.prepare(`
      UPDATE orders SET
        created_at=@created_at,sales=@sales,customer=@customer,supplier=@supplier,service=@service,sub_service=@sub_service,
        label=@label,tracking=@tracking,order_id=@order_id,draft_key=@draft_key,workflow_status=@workflow_status,
        est_net_cost=@est_net_cost,base_cost=@base_cost,retail=@retail,discount=@discount,sales_price=@sales_price,auto_pricing=@auto_pricing,
        manual_surcharge=@manual_surcharge,surcharge=@surcharge,import_tax=@import_tax,total_due=@total_due,gross_profit_base=@gross_profit_base,
        gross_profit_net=@gross_profit_net,gross_margin_pct=@gross_margin_pct,margin_status=@margin_status,note=@note,item=@item,material=@material,declared_value=@declared_value,
        carton_count=@carton_count,length=@length,width=@width,height=@height,volume=@volume,weight=@weight,
        chargeable_weight=@chargeable_weight,recipient_name=@recipient_name,address1=@address1,address2=@address2,
        city=@city,state=@state,zip=@zip,country=@country,phone=@phone,updated_at=CURRENT_TIMESTAMP
      WHERE id=@id
    `).run({ ...payload, id: existing.id });
    id = existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO orders(
        created_at,sales,customer,supplier,service,sub_service,label,tracking,order_id,draft_key,workflow_status,
        est_net_cost,base_cost,retail,discount,sales_price,auto_pricing,manual_surcharge,surcharge,import_tax,total_due,gross_profit_base,gross_profit_net,gross_margin_pct,margin_status,
        note,item,material,declared_value,carton_count,length,width,height,volume,weight,chargeable_weight,recipient_name,
        address1,address2,city,state,zip,country,phone,updated_at
      ) VALUES (
        @created_at,@sales,@customer,@supplier,@service,@sub_service,@label,@tracking,@order_id,@draft_key,@workflow_status,
        @est_net_cost,@base_cost,@retail,@discount,@sales_price,@auto_pricing,@manual_surcharge,@surcharge,@import_tax,@total_due,@gross_profit_base,@gross_profit_net,@gross_margin_pct,@margin_status,
        @note,@item,@material,@declared_value,@carton_count,@length,@width,@height,@volume,@weight,@chargeable_weight,@recipient_name,
        @address1,@address2,@city,@state,@zip,@country,@phone,CURRENT_TIMESTAMP
      )
    `).run(payload);
    id = Number(result.lastInsertRowid);
  }

  if (tracking) {
    applyLatestSupplierCost(tracking);
    const current = getOrderByTracking(tracking);
    if (current) upsertAutoOrderCharge(current);
  }
  return db.prepare("SELECT * FROM orders WHERE id=?").get(id);
}

export function addSupplierCost(input: SupplierCostInput) {
  const tracking = text(input.tracking);
  if (!tracking) throw new Error("Tracking là bắt buộc để link chi phí.");
  const enumValues = validateSupplierCostEnums(input);
  const netPrice = num(input.net_price);
  const fee = num(input.fee);
  const exportCustoms = num(input.export_customs);
  const importCustoms = num(input.import_customs);
  const totalNet = money(num(input.total_net_cost) || netPrice + fee + exportCustoms + importCustoms);
  if (!totalNet) throw new Error("Cần Total Net Cost hoặc các thành phần chi phí.");

  const result = db.prepare(`
    INSERT INTO supplier_costs(
      supplier,service,sub_service,tracking,occurred_at,item,destination,weight,net_price,fee,
      export_customs,import_customs,total_net_cost,extra_surcharge,import_tax,note,batch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    enumValues.supplier, enumValues.service, enumValues.sub_service, tracking, normalizeDateInput(input.occurred_at, "Ngày chi phí"),
    text(input.item), text(input.destination), num(input.weight), netPrice, fee, exportCustoms, importCustoms,
    totalNet, money(num(input.extra_surcharge)), money(num(input.import_tax)), text(input.note), input.batch_id || null
  );

  const matched = applyLatestSupplierCost(tracking);
  return {
    id: Number(result.lastInsertRowid),
    tracking,
    matched,
    total_net_cost: totalNet,
    warning: matched ? null : "Chưa có order cùng Tracking; chi phí được giữ lại và sẽ auto-link khi order xuất hiện.",
  };
}

export function addLedgerEntry(input: LedgerInput) {
  const amount = money(num(input.amount));
  if (!amount) throw new Error("Số tiền phải lớn hơn 0.");
  const type = text(input.entry_type).toUpperCase();
  let direction = input.direction;
  if (!direction) {
    if (["PAYMENT", "REFUND", "ERROR_REFUND", "ERROR_PROCESSING", "ADJUSTMENT_CREDIT"].includes(type)) direction = "CREDIT";
    else direction = "DEBIT";
  }
  const result = db.prepare(`
    INSERT INTO ledger_entries(
      occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,bill_url,note,batch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    normalizeDateInput(input.occurred_at, "Ngày giao dịch"), type, direction, amount, text(input.customer) || null,
    text(input.reference_type) || null, text(input.reference_id) || null, text(input.bill_url) || null,
    text(input.note) || null, input.batch_id || null
  );
  return db.prepare("SELECT * FROM ledger_entries WHERE id=?").get(result.lastInsertRowid);
}
