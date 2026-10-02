const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
process.env.DMD_DB_PATH = process.env.DMD_DB_PATH || path.join(root, "data", "dmd-finance-ops.db");
process.env.NODE_ENV = "production";

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(root, "src", request.slice(2));
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const { db } = require(path.join(root, "src/lib/db.ts"));
const { createUser, hashPassword } = require(path.join(root, "src/lib/auth.ts"));
const { upsertOrder, addSupplierCost } = require(path.join(root, "src/lib/finance.ts"));
const {
  addOrderTracking,
  updateOrderTracking,
  replaceOrderTracking,
  normalizeTracking,
} = require(path.join(root, "src/lib/order-operations.ts"));
const { logOrderEvent } = require(path.join(root, "src/lib/order-audit.ts"));

const DEMO_PASSWORD = "Demo12345!";

function ensureUser({ username, displayName, role, salesUserId, adminId }) {
  const existing = db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(username);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET display_name=?,password_hash=?,role=?,sales_user_id=?,active=1,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(displayName, hashPassword(DEMO_PASSWORD), role, salesUserId || null, existing.id);
    return db.prepare("SELECT * FROM users WHERE id=?").get(existing.id);
  }
  return createUser({
    username,
    display_name: displayName,
    password: DEMO_PASSWORD,
    role,
    sales_user_id: salesUserId || null,
    created_by_user_id: adminId,
  });
}

function ensureOrder(spec, sales, client, admin) {
  const existing = db.prepare("SELECT * FROM orders WHERE order_id=?").get(spec.order_id);
  const saved = upsertOrder({
    id: existing?.id,
    client_user_id: client.id,
    created_at: spec.created_at,
    order_id: spec.order_id,
    sales: sales.display_name,
    customer: client.display_name,
    supplier: spec.supplier,
    service: spec.service,
    sub_service: spec.sub_service,
    item: spec.item,
    material: spec.material,
    declared_value: spec.declared_value,
    carton_count: spec.carton_count,
    length: spec.length,
    width: spec.width,
    height: spec.height,
    manual_volume: spec.manual_volume,
    weight: spec.weight,
    dimensional_divisor: 5000,
    est_net_cost: spec.est_net_cost,
    base_cost: spec.base_cost,
    retail: spec.retail,
    discount: spec.discount,
    discount_note: spec.discount_note,
    sales_price: spec.sales_price,
    recipient_name: spec.recipient_name,
    address1: spec.address1,
    city: spec.city,
    state: spec.state,
    zip: spec.zip,
    country: spec.country,
    phone: spec.phone,
    note: existing ? undefined : spec.note,
    internal_note: existing ? undefined : spec.internal_note,
  });
  db.prepare(`
    UPDATE orders
    SET sales_user_id=?,client_user_id=?,created_by_user_id=COALESCE(created_by_user_id,?),
        updated_by_user_id=?,workflow_status=?,purchase_completed_at=?,expected_lot_count=?
    WHERE id=?
  `).run(
    sales.id,
    client.id,
    admin.id,
    admin.id,
    spec.workflow_status,
    spec.workflow_status === "PURCHASED" ? "2026-09-29 09:30:00" : null,
    spec.expected_lot_count || 1,
    saved.id
  );
  return db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id);
}

function ensureTracking(orderId, tracking, options = {}) {
  const normalized = normalizeTracking(tracking);
  const existing = db.prepare("SELECT * FROM order_trackings WHERE normalized_tracking=?").get(normalized);
  if (existing) {
    if (existing.order_id !== orderId) throw new Error(`Tracking ${tracking} đang thuộc Order khác.`);
    return existing;
  }
  return addOrderTracking({
    orderId,
    tracking,
    labelUrl: options.labelUrl,
    lotNumber: options.lotNumber || 1,
    actorId: options.actorId,
    isPrimary: Boolean(options.isPrimary),
    costMatchType: options.costMatchType || "UNKNOWN",
  });
}

function addDemoCost(input) {
  return addSupplierCost(input);
}

function main() {
  const admin = db.prepare("SELECT * FROM users WHERE role='ADMIN' AND active=1 ORDER BY is_root_admin DESC,id LIMIT 1").get();
  if (!admin) throw new Error("Cần ít nhất một Admin đang hoạt động trước khi nạp demo.");

  const sales = ensureUser({
    username: "demo.sales",
    displayName: "DEMO Sales Hà Nội",
    role: "SALES",
    adminId: admin.id,
  });
  const client = ensureUser({
    username: "demo.client",
    displayName: "DEMO Client Ecom",
    role: "CLIENT",
    salesUserId: sales.id,
    adminId: admin.id,
  });

  db.prepare("DELETE FROM client_service_settings WHERE client_user_id=?").run(client.id);
  const insertSetting = db.prepare(`
    INSERT INTO client_service_settings(
      client_user_id,service,sub_service,is_enabled,discount_percent,updated_by_user_id
    ) VALUES (?,?,?,?,?,?)
  `);
  insertSetting.run(client.id, "ePacket", "", 1, 7, admin.id);
  insertSetting.run(client.id, "UPS", "", 0, 0, admin.id);

  const specs = [
    {
      order_id: "DEMO-001",
      created_at: "27/09/2026",
      workflow_status: "PENDING_PURCHASE",
      expected_lot_count: 1,
      supplier: "",
      service: "ePacket",
      sub_service: "T11",
      item: "Áo thun in theo yêu cầu",
      material: "Cotton 100%",
      carton_count: 3,
      length: 60,
      width: 40,
      height: 35,
      weight: 14,
      declared_value: 320,
      est_net_cost: 38,
      base_cost: 48,
      retail: 65,
      sales_price: 60.45,
      recipient_name: "Olivia Martin",
      address1: "221B Demo Street",
      city: "Portland",
      state: "OR",
      zip: "97205",
      country: "US",
      phone: "+1 503 555 0101",
      note: "Đơn demo đang chờ Admin mua đơn; thể tích được tính tự động từ Dài × Rộng × Cao.",
      internal_note: "Kiểm tra lại SLA với supplier trước khi mua.",
    },
    {
      order_id: "DEMO-002",
      created_at: "28/09/2026",
      workflow_status: "PENDING_PURCHASE",
      expected_lot_count: 1,
      supplier: "",
      service: "ePacket",
      sub_service: "Standard",
      item: "Bộ phụ kiện trang trí",
      material: "Nhựa ABS và kim loại",
      carton_count: 5,
      manual_volume: 125000,
      weight: 18,
      declared_value: 540,
      est_net_cost: 62,
      base_cost: 75,
      retail: 96,
      discount: 12,
      discount_note: "Ưu đãi ngoại lệ cho chiến dịch ra mắt sản phẩm",
      sales_price: 84.48,
      recipient_name: "Ethan Wilson",
      address1: "85 Market Avenue",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "US",
      phone: "+1 512 555 0102",
      note: "Đơn demo nhập thể tích tổng thủ công, không nhập kích thước.",
      internal_note: "Discount ngoại lệ đã được trưởng nhóm duyệt.",
    },
    {
      order_id: "DEMO-003",
      created_at: "29/09/2026",
      workflow_status: "PURCHASED",
      expected_lot_count: 2,
      supplier: "KILOSHIP",
      service: "ePacket",
      sub_service: "T11",
      item: "Giày sneaker",
      material: "Da PU, cao su",
      carton_count: 8,
      length: 80,
      width: 60,
      height: 55,
      weight: 41,
      declared_value: 960,
      est_net_cost: 90,
      base_cost: 110,
      retail: 145,
      sales_price: 134.85,
      recipient_name: "Sophia Davis",
      address1: "17 Ocean Drive",
      city: "Miami",
      state: "FL",
      zip: "33101",
      country: "US",
      phone: "+1 305 555 0103",
      note: "Một Order chia thành 2 lô và 3 Tracking; đang chờ file Net Cost True.",
      internal_note: "Tracking phụ của lô 1 không có dòng chi phí riêng; gộp vào Tracking chính.",
    },
    {
      order_id: "DEMO-004",
      created_at: "30/09/2026",
      workflow_status: "PURCHASED",
      expected_lot_count: 2,
      supplier: "KILOSHIP",
      service: "ePacket",
      sub_service: "T11",
      item: "Túi tote in logo",
      material: "Canvas",
      carton_count: 6,
      length: 75,
      width: 55,
      height: 48,
      weight: 33,
      declared_value: 780,
      est_net_cost: 92,
      base_cost: 115,
      retail: 150,
      discount: 5,
      discount_note: "Giá ưu đãi riêng cho khách VIP",
      sales_price: 142.5,
      recipient_name: "Noah Thompson",
      address1: "640 Pine Street",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      country: "US",
      phone: "+1 206 555 0104",
      note: "Đơn demo đã đối soát đủ Net Cost True, thuế nhập khẩu và phụ phí.",
      internal_note: "Supplier đổi label lô 1 do sai tuyến khai thác; đã xác nhận không tính phí hai lần.",
    },
  ];

  const orders = Object.fromEntries(
    specs.map((spec) => [spec.order_id, ensureOrder(spec, sales, client, admin)])
  );

  const d3a = ensureTracking(orders["DEMO-003"].id, "DEMO3-LOT1-MAIN", {
    labelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    lotNumber: 1,
    actorId: admin.id,
    isPrimary: true,
    costMatchType: "DIRECT",
  });
  const d3b = ensureTracking(orders["DEMO-003"].id, "DEMO3-LOT1-AUX", {
    labelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    lotNumber: 1,
    actorId: admin.id,
  });
  ensureTracking(orders["DEMO-003"].id, "DEMO3-LOT2-MAIN", {
    labelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    lotNumber: 2,
    actorId: admin.id,
    costMatchType: "DIRECT",
  });
  updateOrderTracking({
    orderId: orders["DEMO-003"].id,
    id: d3b.id,
    costMatchType: "INCLUDED_IN_PARENT",
    costParentTrackingId: d3a.id,
  });
  db.prepare("UPDATE order_trackings SET shipment_status=?,etd_at=?,delivered_at=?,status_updated_at=CURRENT_TIMESTAMP,status_updated_by_user_id=? WHERE id=?")
    .run("IN_TRANSIT","2026-09-27",null,admin.id,d3a.id);
  db.prepare("UPDATE order_trackings SET shipment_status=?,etd_at=?,delivered_at=?,status_updated_at=CURRENT_TIMESTAMP,status_updated_by_user_id=? WHERE id=?")
    .run("ALERT","2026-09-28",null,admin.id,d3b.id);
  const d3lot2=db.prepare("SELECT * FROM order_trackings WHERE normalized_tracking=?").get(normalizeTracking("DEMO3-LOT2-MAIN"));
  db.prepare("UPDATE order_trackings SET shipment_status=?,etd_at=?,delivered_at=?,status_updated_at=CURRENT_TIMESTAMP,status_updated_by_user_id=? WHERE id=?")
    .run("RECEIVED","2026-09-30",null,admin.id,d3lot2.id);

  const d4old = ensureTracking(orders["DEMO-004"].id, "DEMO4-OLD-LOT1", {
    labelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    lotNumber: 1,
    actorId: admin.id,
    isPrimary: true,
    costMatchType: "DIRECT",
  });
  ensureTracking(orders["DEMO-004"].id, "DEMO4-LOT2-MAIN", {
    labelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    lotNumber: 2,
    actorId: admin.id,
    costMatchType: "DIRECT",
  });
  let d4new = db.prepare("SELECT * FROM order_trackings WHERE normalized_tracking=?").get(
    normalizeTracking("DEMO4-NEW-LOT1")
  );
  if (!d4new && d4old.status === "ACTIVE") {
    d4new = replaceOrderTracking({
      orderId: orders["DEMO-004"].id,
      oldTrackingId: d4old.id,
      newTracking: "DEMO4-NEW-LOT1",
      newLabelUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      reason: "Supplier phát hành lại label do đổi tuyến khai thác",
      actorId: admin.id,
    });
  }

  const d4active=db.prepare("SELECT * FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id").all(orders["DEMO-004"].id);
  for(const tracking of d4active){
    db.prepare("UPDATE order_trackings SET shipment_status='DELIVERED',etd_at='2026-09-25',delivered_at='2026-09-30',status_updated_at=CURRENT_TIMESTAMP,status_updated_by_user_id=? WHERE id=?").run(admin.id,tracking.id);
  }

  addDemoCost({
    supplier: "KILOSHIP",
    service: "ePacket",
    sub_service: "T11",
    tracking: "DEMO4-OLD-LOT1",
    occurred_at: "30/09/2026",
    item: "Túi tote in logo - lô 1",
    destination: "US",
    weight: 18,
    total_net_cost: 55,
    extra_surcharge: 8.5,
    import_tax: 12.25,
    note: "Phụ phí điều chỉnh địa chỉ và thuế nhập khẩu lô 1",
    source_key: "DEMO-COST-004-LOT1",
  });
  addDemoCost({
    supplier: "KILOSHIP",
    service: "ePacket",
    sub_service: "T11",
    tracking: "DEMO4-LOT2-MAIN",
    occurred_at: "30/09/2026",
    item: "Túi tote in logo - lô 2",
    destination: "US",
    weight: 15,
    total_net_cost: 37,
    note: "Net Cost True lô 2",
    source_key: "DEMO-COST-004-LOT2",
  });

  for(const order of Object.values(orders))db.prepare("DELETE FROM order_events WHERE order_id=? AND source='DEMO_SEED'").run(order.id);
  logOrderEvent({orderId:orders["DEMO-003"].id,eventType:"TRACKINGS_UPDATED",summary:"Admin đã trả Tracking/Label cho nhiều carton và phân bổ 2 lô.",actorId:admin.id,source:"DEMO_SEED"});
  logOrderEvent({orderId:orders["DEMO-003"].id,eventType:"SHIPMENT_STATUS_UPDATED",summary:"DEMO3-LOT1-AUX được chuyển sang Alert để theo dõi.",actorId:admin.id,source:"DEMO_SEED"});
  logOrderEvent({orderId:orders["DEMO-004"].id,eventType:"TRACKING_REPLACED",summary:"Đổi Tracking DEMO4-OLD-LOT1 → DEMO4-NEW-LOT1. Lý do: Supplier phát hành lại label do đổi tuyến khai thác",actorId:admin.id,source:"DEMO_SEED"});
  logOrderEvent({orderId:orders["DEMO-004"].id,eventType:"SUPPLIER_COST_IMPORTED",summary:"Đã nhập Net Cost True, phụ phí và thuế nhập khẩu theo Tracking.",actorId:admin.id,visibility:"ADMIN",source:"DEMO_SEED"});
  logOrderEvent({orderId:orders["DEMO-004"].id,eventType:"SHIPMENT_STATUS_UPDATED",summary:"Các Tracking của Order đã Delivered.",actorId:admin.id,source:"DEMO_SEED"});

  const summary = db.prepare(`
    SELECT o.order_id,o.workflow_status,o.item,o.carton_count,o.weight,o.volume,
           o.chargeable_weight,o.discount,o.sales_price,o.true_net_cost,
           o.extra_surcharge,o.extra_import_tax,o.total_due,
           COUNT(ot.id) tracking_count
    FROM orders o
    LEFT JOIN order_trackings ot ON ot.order_id=o.id
    WHERE o.order_id LIKE 'DEMO-%'
    GROUP BY o.id
    ORDER BY o.order_id
  `).all();

  console.log(JSON.stringify({
    credentials: {
      sales: { username: sales.username, password: DEMO_PASSWORD },
      client: { username: client.username, password: DEMO_PASSWORD },
    },
    orders: summary,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  try { db.close(); } catch {}
}
