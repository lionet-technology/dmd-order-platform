const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const dbPath = process.env.DMD_VERIFY_DB || `/tmp/dmd-rbac-smoke-${process.pid}.db`;
process.env.DMD_DB_PATH = dbPath;
process.env.NODE_ENV = "test";
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(root, "src", request.slice(2));
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"), path.join(target, "index.tsx")]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}
require.extensions[".ts"] = compileTypeScript;
require.extensions[".tsx"] = compileTypeScript;

const { NextRequest } = require("next/server");
const setupRoute = require(path.join(root, "src/app/api/auth/setup/route.ts"));
const loginRoute = require(path.join(root, "src/app/api/auth/login/route.ts"));
const usersRoute = require(path.join(root, "src/app/api/users/route.ts"));
const userRoute = require(path.join(root, "src/app/api/users/[id]/route.ts"));
const ordersRoute = require(path.join(root, "src/app/api/orders/route.ts"));
const clientServicesRoute = require(path.join(root, "src/app/api/client-services/route.ts"));
const ledgerRoute = require(path.join(root, "src/app/api/ledger/route.ts"));
const summaryRoute = require(path.join(root, "src/app/api/summary/route.ts"));
const { db } = require(path.join(root, "src/lib/db.ts"));
db.prepare("INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,sort_order) VALUES ('SUB_SERVICE','T11','ePacket',10)").run(); // Explicit legacy fixture; T11 is no longer a default route.

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function request(url, method = "GET", body, cookie) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseJson(response) {
  let body = null;
  try { body = await response.json(); } catch {}
  return { status: response.status, body, response };
}

function sessionCookie(response) {
  const raw = response.headers.get("set-cookie") || "";
  const cookie = raw.split(";")[0];
  if (!cookie.startsWith("dmd_session=")) throw new Error("Session cookie missing");
  return cookie;
}

async function login(username, password) {
  const result = await responseJson(await loginRoute.POST(request("http://local/api/auth/login", "POST", { username, password })));
  assert(result.status === 200, `login ${username} should succeed`);
  return sessionCookie(result.response);
}

async function get(handler, url, cookie) {
  return responseJson(await handler(request(url, "GET", undefined, cookie)));
}

async function post(handler, url, body, cookie) {
  return responseJson(await handler(request(url, "POST", body, cookie)));
}

async function main() {
  const password = "TestPass123!";

  const setup = await responseJson(await setupRoute.POST(request("http://local/api/auth/setup", "POST", {
    display_name: "Root Admin",
    username: "rootadmin",
    password,
  })));
  assert(setup.status === 201, "initial admin setup should succeed");
  const adminCookie = sessionCookie(setup.response);

  const salesA = (await post(usersRoute.POST, "http://local/api/users", {
    display_name: "Sales A", username: "sales.a", password, role: "SALES",
  }, adminCookie));
  const salesB = (await post(usersRoute.POST, "http://local/api/users", {
    display_name: "Sales B", username: "sales.b", password, role: "SALES",
  }, adminCookie));
  assert(salesA.status === 201 && salesB.status === 201, "admin should create Sales accounts");

  const clientA = (await post(usersRoute.POST, "http://local/api/users", {
    display_name: "Client A", username: "client.a", password, role: "CLIENT", sales_user_id: salesA.body.id,
  }, adminCookie));
  const clientB = (await post(usersRoute.POST, "http://local/api/users", {
    display_name: "Client B", username: "client.b", password, role: "CLIENT", sales_user_id: salesB.body.id,
  }, adminCookie));
  assert(clientA.status === 201 && clientB.status === 201, "admin should create Clients with Sales owners");
  const serviceAccess = await post(clientServicesRoute.POST, "http://local/api/client-services", {
    client_user_id: clientA.body.id,
    service: "ePacket",
    sub_service: "",
    is_enabled: true,
    discount_percent: 0,
  }, adminCookie);
  assert(serviceAccess.status === 200, "admin should enable a Service before Sales creates the Client Order");

  const invalidClient = await post(usersRoute.POST, "http://local/api/users", {
    display_name: "No Owner", username: "no.owner", password, role: "CLIENT",
  }, adminCookie);
  assert(invalidClient.status === 400, "Client without Sales owner must be rejected");

  const salesACookie = await login("sales.a", password);
  const salesBCookie = await login("sales.b", password);
  const clientACookie = await login("client.a", password);
  const clientBCookie = await login("client.b", password);

  const salesAClients = await get(usersRoute.GET, "http://local/api/users", salesACookie);
  assert(salesAClients.status === 200 && salesAClients.body.length === 1 && salesAClients.body[0].id === clientA.body.id,
    "Sales A should only list owned Clients");

  db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','T11','KILOSHIP')").run();
  const orderA = await post(ordersRoute.POST, "http://local/api/orders", {
    client_user_id: clientA.body.id,
    created_at: "30/09/2026",
    order_id: "ORDER-A-001",
    service: "ePacket",
    sub_service: "T11",
    country: "US",
    item: "Smoke item",
    material: "Cotton",
    carton_count: 2,
    weight: 12,
    length: 50,
    width: 40,
    height: 30,
    declared_value: 80,
  }, salesACookie);
  assert(orderA.status === 201 && orderA.body.client_user_id === clientA.body.id && orderA.body.sales_user_id === salesA.body.id,
    "Sales A should create an Order for Client A with ownership stamped server-side");

  const crossOrder = await post(ordersRoute.POST, "http://local/api/orders", {
    client_user_id: clientB.body.id,
    created_at: "30/09/2026",
    order_id: "ORDER-X-001",
    service: "ePacket",
    country: "US",
  }, salesACookie);
  assert(crossOrder.status === 403, "Sales A must not create Orders for Client B");

  const clientAOrders = await get(ordersRoute.GET, "http://local/api/orders?page=1&pageSize=20", clientACookie);
  const clientBOrders = await get(ordersRoute.GET, "http://local/api/orders?page=1&pageSize=20", clientBCookie);
  assert(clientAOrders.body.total === 1 && clientBOrders.body.total === 0, "Clients should only see their own Orders");

  const clientWriteOrder = await post(ordersRoute.POST, "http://local/api/orders", {
    client_user_id: clientA.body.id, order_id: "CLIENT-WRITE", service: "ePacket", country: "US",
  }, clientACookie);
  assert(clientWriteOrder.status === 403, "Client must be read-only for Orders");

  const payment = await post(ledgerRoute.POST, "http://local/api/ledger", {
    client_user_id: clientA.body.id,
    occurred_at: "30/09/2026",
    entry_type: "PAYMENT", request_key: "fixture-payment-"+Date.now(),
    amount: 125,
    reference_type: "SMOKE",
    reference_id: "PAY-A-001",
  }, salesACookie);
  assert(payment.status === 201 && payment.body.client_user_id === clientA.body.id,
    "Sales A should create a Balance entry for Client A");

  const crossLedger = await post(ledgerRoute.POST, "http://local/api/ledger", {
    client_user_id: clientA.body.id,
    occurred_at: "30/09/2026",
    entry_type: "PAYMENT", request_key: "fixture-payment-"+Date.now(),
    amount: 20,
  }, salesBCookie);
  assert(crossLedger.status === 403, "Sales B must not write Client A Balance");

  const clientALedger = await get(ledgerRoute.GET, "http://local/api/ledger?page=1&pageSize=20", clientACookie);
  const clientBLedger = await get(ledgerRoute.GET, "http://local/api/ledger?page=1&pageSize=20", clientBCookie);
  assert(clientALedger.body.total === 1 && clientBLedger.body.total === 0, "Clients should only see their own Balance Ledger");

  const clientWriteLedger = await post(ledgerRoute.POST, "http://local/api/ledger", {
    client_user_id: clientA.body.id, occurred_at: "30/09/2026", entry_type: "PAYMENT", request_key: "fixture-payment-"+Date.now(), amount: 1,
  }, clientACookie);
  assert(clientWriteLedger.status === 403, "Client must be read-only for Balance Ledger");

  const clientSummary = await get(summaryRoute.GET, "http://local/api/summary", clientACookie);
  assert(clientSummary.body.orders === 1 && clientSummary.body.ledger === 125,
    "Client summary should be scoped to its own Orders and Balance");

  const reassign = await responseJson(await userRoute.PATCH(
    request(`http://local/api/users/${clientA.body.id}`, "PATCH", { sales_user_id: salesB.body.id }, adminCookie),
    { params: Promise.resolve({ id: String(clientA.body.id) }) },
  ));
  assert(reassign.status === 200 && reassign.body.sales_user_id === salesB.body.id, "admin should reassign Client A to Sales B");

  const salesAOrdersAfter = await get(ordersRoute.GET, "http://local/api/orders?page=1&pageSize=20", salesACookie);
  const salesBOrdersAfter = await get(ordersRoute.GET, "http://local/api/orders?page=1&pageSize=20", salesBCookie);
  const salesALedgerAfter = await get(ledgerRoute.GET, "http://local/api/ledger?page=1&pageSize=20", salesACookie);
  const salesBLedgerAfter = await get(ledgerRoute.GET, "http://local/api/ledger?page=1&pageSize=20", salesBCookie);
  assert(salesAOrdersAfter.body.total === 0 && salesBOrdersAfter.body.total === 1,
    "Order visibility should follow Client reassignment immediately");
  assert(salesALedgerAfter.body.total === 0 && salesBLedgerAfter.body.total === 1,
    "Balance visibility should follow Client reassignment immediately");

  const adminUsers = await get(usersRoute.GET, "http://local/api/users", adminCookie);
  assert(adminUsers.status === 200 && adminUsers.body.filter((user) => user.role === "CLIENT").length === 2,
    "Admin should see all Client accounts");

  console.log(`RBAC smoke PASS (${checks} assertions)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    try { db.close(); } catch {}
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
  });
