import { refreshDraft,activePricing,routeFor } from "./route-pricing";
import { db } from "./db";
import { validateOrderEnums, validateSupplierCostEnums } from "./enums";
import { addOrderTracking, findTrackingOwner, matchSupplierCostsForOrder, normalizeTracking } from "./order-operations";
import { ensureOrderShipmentStructure } from "./order-shipments";

export type OrderInput = {
  id?: number;
  client_user_id?: number | string | null;
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
  discount_note?: string;
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
  manual_volume?: number | string | null;
  dimensional_divisor?: number | string | null;
  weight?: number | string | null;
  internal_note?: string;
  chargeable_weight?: number | string | null;
  recipient_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  recipient_email?: string;
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
  surcharge_type?: string;
  import_tax?: number | string | null;
  note?: string;
  batch_id?: number | null;
  source_key?: string | null;
};

export type LedgerInput = {
  client_user_id?: number | string | null;
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
  client_user_id: number | null;
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

export function pricing(_serviceRaw: string, _subServiceRaw: string, _estNet: number, current: {
  base: number;
  retail: number;
  discount: number;
  salesPrice: number;
  surcharge: number;
  importTax: number;
  weight: number;
  volume: number;
  length: number;
  dimensionalDivisor?: number;
}) {
  // Pricing markups are intentionally deferred. For now these are manual
  // snapshots; only measurement and payable-total arithmetic are automatic.
  const divisor=Number(current.dimensionalDivisor||5000)||5000;
  const chargeable=Math.max(current.weight||0,(current.volume||0)/divisor);
  return {
    base:money(current.base),retail:money(current.retail),salesPrice:money(current.salesPrice),
    surcharge:money(current.surcharge),chargeable,
    totalDue:money((current.salesPrice||0)+(current.surcharge||0)+(current.importTax||0)),
  };
}

export function getOrderByTracking(tracking: string) {
  const owner=findTrackingOwner(tracking);
  return owner?db.prepare("SELECT * FROM orders WHERE id=?").get(owner.order_id) as OrderRecord:undefined;
}

export function upsertAutoOrderCharge(order: OrderRecord) {
  if (order.workflow_status==="CANCELLED" || !order.tracking || !order.total_due) return;
  db.prepare(`
    INSERT INTO ledger_entries(occurred_at, entry_type, direction, amount, customer, client_user_id, reference_type, reference_id, note)
    VALUES (?, 'ORDER_CHARGE', 'DEBIT', ?, ?, ?, 'TRACKING', ?, 'Auto from order total due')
    ON CONFLICT(entry_type, reference_type, reference_id) WHERE reference_id IS NOT NULL AND entry_type = 'ORDER_CHARGE'
    DO UPDATE SET occurred_at=excluded.occurred_at, amount=excluded.amount, customer=excluded.customer, client_user_id=excluded.client_user_id
  `).run(order.created_at || null, order.total_due, order.customer || null, order.client_user_id || null, order.tracking);
}

export function applyLatestSupplierCost(tracking: string) {
  const owner=findTrackingOwner(tracking);if(!owner)return false;
  matchSupplierCostsForOrder(owner.order_id);
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
  if(existing?.pricing_snapshot_json)throw new Error("Đơn đã đặt mua; giá và dữ liệu kiện đã khóa.");
  if(existing?.workflow_status==="CANCELLED")throw new Error("Đơn đã huỷ; không thể sửa hoặc tạo lại trên cùng record.");
  const clientUserId = input.client_user_id !== undefined && input.client_user_id !== null && input.client_user_id !== ""
    ? Number(input.client_user_id)
    : Number(existing?.client_user_id || 0) || null;

  const orderId = stringValue(input, "order_id", existing);
  const tracking = stringValue(input, "tracking", existing);
  if (!orderId && !tracking) throw new Error("Cần Order ID hoặc Tracking.");

  const customer = stringValue(input, "customer", existing);
  const requestedService=String(input.service??existing?.service??"").trim();
  const primarySetting=clientUserId&&requestedService
    ? db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND sub_service='' LIMIT 1").get(clientUserId,requestedService) as {is_enabled:number;discount_percent:number;default_sub_service:string;default_supplier:string}|undefined
    : undefined;
  const effectiveSubService=!existing&&!String(input.sub_service??"").trim()&&primarySetting?.default_sub_service
    ? primarySetting.default_sub_service
    : input.sub_service;
  const effectiveSupplier=!existing&&!String(input.supplier??"").trim()&&primarySetting?.default_supplier
    ? primarySetting.default_supplier
    : input.supplier;
  const enumValues = validateOrderEnums({
    service: input.service,
    sub_service: effectiveSubService,
    supplier: effectiveSupplier,
    country: input.country,
  }, existing);
  const service = enumValues.service;
  const subService = enumValues.sub_service;
  const item = stringValue(input, "item", existing);
  const recipient = stringValue(input, "recipient_name", existing);
  const measurement=(key:keyof OrderInput)=>input[key]!==undefined?nullableNum(input[key]):nullableNum(existing?.[String(key)]);
  const length=measurement("length"),width=measurement("width"),height=measurement("height");
  const dimensionCount=[length,width,height].filter(value=>Number(value||0)>0).length;
  if(dimensionCount>0&&dimensionCount<3)throw new Error("Hãy nhập đủ Dài, Rộng và Cao hoặc bỏ trống cả ba.");
  const calculatedVolume=dimensionCount===3?Number(length)*Number(width)*Number(height):null;
  const manualVolume=input.manual_volume!==undefined?nullableNum(input.manual_volume):input.volume!==undefined?nullableNum(input.volume):nullableNum(existing?.manual_volume);
  const volume=calculatedVolume||manualVolume||0;
  const weight=measurement("weight")||0;
  const cartonCount=measurement("carton_count");
  const dimensionalDivisor=Number(input.dimensional_divisor||existing?.dimensional_divisor||5000)||5000;
  if((!existing||input.weight!==undefined)&&weight<=0)throw new Error("Tổng khối lượng phải lớn hơn 0 kg.");
  if((!existing||input.carton_count!==undefined)&&(!Number.isInteger(cartonCount)||Number(cartonCount)<1))throw new Error("Số lượng carton phải là số nguyên từ 1 trở lên.");
  if(input.manual_volume!==undefined&&input.manual_volume!==null&&input.manual_volume!==""&&Number(manualVolume)<=0)throw new Error("Thể tích tổng phải lớn hơn 0.");
  if(input.dimensional_divisor!==undefined&&(!Number.isFinite(Number(input.dimensional_divisor))||Number(input.dimensional_divisor)<=0))throw new Error("Hệ số quy đổi thể tích phải lớn hơn 0.");
  for(const dimension of [length,width,height])if(dimension!==null&&dimension<0)throw new Error("Kích thước không được âm.");
  if(!existing){
    if(!item)throw new Error("Tên sản phẩm là bắt buộc.");
    if(!stringValue(input,"material",existing))throw new Error("Chất liệu là bắt buộc.");
    if(!cartonCount||cartonCount<1)throw new Error("Số lượng carton phải từ 1 trở lên.");
    if(!weight||weight<=0)throw new Error("Tổng khối lượng phải lớn hơn 0 kg.");
    if(!volume||volume<=0)throw new Error("Hãy nhập đủ kích thước hoặc thể tích tổng của lô hàng.");
  }
  const estNet=numericValue(input,"est_net_cost",existing);
  const supplier=enumValues.supplier;
  const setting=clientUserId?db.prepare(`SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1`).get(clientUserId,service,subService,subService) as {is_enabled:number;discount_percent:number}|undefined:undefined;
  const serviceChanged=!existing||String(existing.service||"").toLowerCase()!==service.toLowerCase();
  if(clientUserId&&serviceChanged&&!setting)throw new Error("Client này chưa được cấp quyền sử dụng dịch vụ đã chọn.");
  if(setting&&setting.is_enabled===0)throw new Error("Client này đang bị chặn sử dụng dịch vụ đã chọn.");
  const hasDiscount=input.discount!==undefined&&input.discount!==null&&input.discount!=="";
  const defaultDiscount=Number(setting?.discount_percent||0);
  const discount=hasDiscount?num(input.discount):(existing?numericValue(input,"discount",existing):defaultDiscount);
  if((hasDiscount||!existing)&&(discount<0||discount>100))throw new Error("Discount phải từ 0 đến 100%.");
  const discountNote=stringValue(input,"discount_note",existing);
  if(hasDiscount&&money(discount)!==money(defaultDiscount)&&!discountNote)throw new Error("Discount ngoại lệ bắt buộc phải có lý do.");

  const manualSurcharge = input.surcharge !== undefined && input.surcharge !== null && input.surcharge !== ""
    ? num(input.surcharge)
    : num(existing?.manual_surcharge);

  const autoPricing=false;

  const calc = pricing(service, subService, estNet, {
    base:numericValue(input,"base_cost",existing),
    retail:numericValue(input,"retail",existing),
    discount,
    salesPrice:numericValue(input,"sales_price",existing),
    surcharge: manualSurcharge,
    importTax: numericValue(input, "import_tax", existing),
    weight,
    volume,
    length:Number(length||0),
    dimensionalDivisor,
  });

  const payload = {
    client_user_id: clientUserId,
    created_at: existing
      ? (input.created_at ? normalizeDateInput(input.created_at, "Ngày tạo") : existing.created_at)
      : (input.created_at ? normalizeDateInput(input.created_at, "Ngày tạo") : new Date().toISOString()),
    sales: stringValue(input, "sales", existing),
    customer,
    supplier,
    service,
    sub_service: subService,
    label: stringValue(input, "label", existing),
    tracking: tracking || null,
    order_id: orderId || null,
    draft_key: draftKey([orderId, customer, service, subService, item, recipient]) || null,
    workflow_status: existing?String(existing.workflow_status||"PENDING_PURCHASE"):"PENDING_PURCHASE",
    est_net_cost: estNet,
    base_cost: calc.base,
    retail: calc.retail,
    discount,
    discount_note:discountNote,
    discount_source:money(discount)===money(defaultDiscount)?"DEFAULT":"MANUAL",
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
    internal_note:stringValue(input,"internal_note",existing),
    item,
    material: stringValue(input, "material", existing),
    declared_value: input.declared_value !== undefined ? nullableNum(input.declared_value) : nullableNum(existing?.declared_value),
    carton_count:cartonCount,
    length,width,height,
    manual_volume:manualVolume,
    calculated_volume:calculatedVolume,
    volume,
    dimensional_divisor:dimensionalDivisor,
    measurement_mode:"LOT",
    weight,
    chargeable_weight:calc.chargeable,
    recipient_name: recipient,
    address1: stringValue(input, "address1", existing),
    address2: stringValue(input, "address2", existing),
    city: stringValue(input, "city", existing),
    state: stringValue(input, "state", existing),
    zip: stringValue(input, "zip", existing),
    country: enumValues.country,
    phone: stringValue(input, "phone", existing),
    recipient_email: stringValue(input, "recipient_email", existing),
  };

  let id: number;
  if (existing) {
    db.prepare(`
      UPDATE orders SET
        client_user_id=@client_user_id,created_at=@created_at,sales=@sales,customer=@customer,supplier=@supplier,service=@service,sub_service=@sub_service,
        label=@label,tracking=@tracking,order_id=@order_id,draft_key=@draft_key,workflow_status=@workflow_status,
        est_net_cost=@est_net_cost,base_cost=@base_cost,retail=@retail,discount=@discount,discount_note=@discount_note,discount_source=@discount_source,sales_price=@sales_price,auto_pricing=@auto_pricing,
        manual_surcharge=@manual_surcharge,surcharge=@surcharge,import_tax=@import_tax,total_due=@total_due,gross_profit_base=@gross_profit_base,
        gross_profit_net=@gross_profit_net,gross_margin_pct=@gross_margin_pct,margin_status=@margin_status,note=@note,internal_note=@internal_note,item=@item,material=@material,declared_value=@declared_value,
        carton_count=@carton_count,length=@length,width=@width,height=@height,manual_volume=@manual_volume,calculated_volume=@calculated_volume,volume=@volume,dimensional_divisor=@dimensional_divisor,measurement_mode=@measurement_mode,weight=@weight,
        chargeable_weight=@chargeable_weight,recipient_name=@recipient_name,address1=@address1,address2=@address2,
        city=@city,state=@state,zip=@zip,country=@country,phone=@phone,recipient_email=@recipient_email,updated_at=CURRENT_TIMESTAMP
      WHERE id=@id
    `).run({ ...payload, id: existing.id });
    id = existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO orders(
        client_user_id,created_at,sales,customer,supplier,service,sub_service,label,tracking,order_id,draft_key,workflow_status,
        est_net_cost,base_cost,retail,discount,discount_note,discount_source,sales_price,auto_pricing,manual_surcharge,surcharge,import_tax,total_due,gross_profit_base,gross_profit_net,gross_margin_pct,margin_status,
        note,internal_note,item,material,declared_value,carton_count,length,width,height,manual_volume,calculated_volume,volume,dimensional_divisor,measurement_mode,weight,chargeable_weight,recipient_name,
        address1,address2,city,state,zip,country,phone,recipient_email,updated_at
      ) VALUES (
        @client_user_id,@created_at,@sales,@customer,@supplier,@service,@sub_service,@label,@tracking,@order_id,@draft_key,@workflow_status,
        @est_net_cost,@base_cost,@retail,@discount,@discount_note,@discount_source,@sales_price,@auto_pricing,@manual_surcharge,@surcharge,@import_tax,@total_due,@gross_profit_base,@gross_profit_net,@gross_margin_pct,@margin_status,
        @note,@internal_note,@item,@material,@declared_value,@carton_count,@length,@width,@height,@manual_volume,@calculated_volume,@volume,@dimensional_divisor,@measurement_mode,@weight,@chargeable_weight,@recipient_name,
        @address1,@address2,@city,@state,@zip,@country,@phone,@recipient_email,CURRENT_TIMESTAMP
      )
    `).run(payload);
    id = Number(result.lastInsertRowid);
  }


  const pricedRoute=routeFor(payload);
  if(pricedRoute&&activePricing(Number(pricedRoute.id))&&Number(cartonCount)===1){
    if(db.prepare("SELECT id FROM order_trackings WHERE order_id=? LIMIT 1").get(id)&&db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number>1").get(id))throw new Error("Carton đã có Tracking; cần Ops kiểm tra trước khi giảm carton.");
    db.prepare("DELETE FROM order_cartons WHERE order_id=? AND carton_number>1").run(id);
    db.prepare("UPDATE order_cartons SET weight=?,length=?,width=?,height=?,volume=?,chargeable_weight=? WHERE order_id=? AND carton_number=1").run(weight,length,width,height,volume,Math.max(weight,volume/5000),id);
    db.prepare("UPDATE order_items SET description=?,material=?,unit_manufacturing_value=? WHERE order_id=? AND sku=''").run(item,payload.material,payload.declared_value,id);
  }
  ensureOrderShipmentStructure(id);
  if(tracking&&!findTrackingOwner(tracking)){
    const carton=db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=1").get(id) as {id:number}|undefined;
    addOrderTracking({orderId:id,tracking,labelUrl:payload.label,lotNumber:1,cartonId:carton?.id||null,isPrimary:true});
  }
  db.prepare(`
    UPDATE orders
    SET system_order_code=COALESCE(NULLIF(system_order_code,''),'DMD-'||strftime('%Y%m%d',COALESCE(created_at,CURRENT_TIMESTAMP))||'-'||printf('%06d',id))
    WHERE id=?
  `).run(id);
  const route=routeFor(payload);
  if(route&&activePricing(Number(route.id)))refreshDraft(id);
  else matchSupplierCostsForOrder(id);
  return db.prepare("SELECT * FROM orders WHERE id=?").get(id);
}

export function addSupplierCost(input: SupplierCostInput) {
  const tracking = text(input.tracking);
  if (!tracking) throw new Error("Tracking là bắt buộc để link chi phí.");
  const normalizedTracking=normalizeTracking(tracking);
  if(input.source_key){
    const duplicate=db.prepare("SELECT id,matched_order_id,total_net_cost FROM supplier_costs WHERE source_key=?").get(input.source_key) as {id:number;matched_order_id:number|null;total_net_cost:number}|undefined;
    if(duplicate)return {id:duplicate.id,tracking,matched:Boolean(duplicate.matched_order_id),total_net_cost:duplicate.total_net_cost,duplicate:true,warning:"Dòng này đã được import trước đó nên không ghi nhận lại."};
  }
  const enumValues = validateSupplierCostEnums(input);
  const netPrice = num(input.net_price);
  const fee = num(input.fee);
  const exportCustoms = num(input.export_customs);
  const importCustoms = num(input.import_customs);
  const totalNet = money(num(input.total_net_cost) || netPrice + fee + exportCustoms + importCustoms);
  if (!totalNet) throw new Error("Cần Total Net Cost hoặc các thành phần chi phí.");

  const owner=findTrackingOwner(tracking);
  const extraSurcharge=money(num(input.extra_surcharge));const importTax=money(num(input.import_tax));
  const surchargeType=extraSurcharge?(text(input.surcharge_type)||"phụ phí bổ sung"):"";
  const result = db.prepare(`
    INSERT INTO supplier_costs(
      supplier,service,sub_service,tracking,normalized_tracking,matched_order_id,matched_order_tracking_id,occurred_at,item,destination,weight,net_price,fee,
      export_customs,import_customs,total_net_cost,extra_surcharge,import_tax,surcharge_type,note,batch_id,source_key
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    enumValues.supplier, enumValues.service, enumValues.sub_service, tracking,normalizedTracking,owner?.order_id||null,owner?.id||null, normalizeDateInput(input.occurred_at, "Ngày chi phí"),
    text(input.item), text(input.destination), num(input.weight), netPrice, fee, exportCustoms, importCustoms,
    totalNet,extraSurcharge,importTax,surchargeType,text(input.note), input.batch_id || null,input.source_key||null
  );

  const matched=Boolean(owner);
  if(owner)matchSupplierCostsForOrder(owner.order_id);
  return {
    id: Number(result.lastInsertRowid),
    tracking,
    matched,
    total_net_cost: totalNet,
    duplicate:false,
    warning: matched ? null : "Chưa có Order cùng Tracking; chi phí được giữ lại và sẽ tự link khi Tracking xuất hiện.",
  };
}

export function addLedgerEntry(input: LedgerInput) {
  if(text(input.reference_type).toUpperCase()==="ORDER_CANCELLATION")throw new Error("Khoản hoàn huỷ đơn chỉ được tạo qua chức năng Huỷ đơn.");
  const amount = money(num(input.amount));
  if (amount<=0) throw new Error("Số tiền phải lớn hơn 0.");
  const type = text(input.entry_type).toUpperCase();
  let direction = input.direction;
  if (!direction) {
    if (["PAYMENT", "REFUND", "ERROR_REFUND", "ERROR_PROCESSING", "ADJUSTMENT_CREDIT", "COMPENSATION", "MANUAL_CREDIT", "OFFSET", "SERVICE_SETTLEMENT"].includes(type)) direction = "CREDIT";
    else direction = "DEBIT";
  }
  const result = db.prepare(`
    INSERT INTO ledger_entries(
      client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,bill_url,note,batch_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    Number(input.client_user_id || 0) || null, normalizeDateInput(input.occurred_at, "Ngày giao dịch"), type, direction, amount, text(input.customer) || null,
    text(input.reference_type) || null, text(input.reference_id) || null, text(input.bill_url) || null,
    text(input.note) || null, input.batch_id || null
  );
  return db.prepare("SELECT * FROM ledger_entries WHERE id=?").get(result.lastInsertRowid);
}
