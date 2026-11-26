const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createServer} = require('node:net');
const Database = require('better-sqlite3');
const {chromium} = require(require.resolve('playwright', {
  paths: [process.env.DMD_BROWSER_NODE_MODULES || '/Users/quan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'],
}));

const [accessFile, output, mode] = process.argv.slice(2);
if (!accessFile || !output || !['before', 'after'].includes(mode)) {
  throw Error('Usage: e2e-gd1-synthetic-uat.cjs <test-access.json> <new output directory> before|after');
}
const access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));
assert.equal(path.basename(accessFile), 'test-access.json');
assert.equal(path.join(path.dirname(accessFile), 'test.db'), access.database);
fs.mkdirSync(output, {mode: 0o700});
const copy = path.resolve(output, 'browser-test.db');
const backup = path.resolve(output, 'restore.db');
const checks = {};
const account = name => ({username: access.accounts[name].username, password: access.password});
let server;
let browser;
let activePage;

async function verifyRestore() {
  const original = new Database(access.database, {readonly: true, fileMustExist: true});
  try {
    const fixture = original.prepare("SELECT id FROM users WHERE username='synthetic.admin' AND is_root_admin=1").get();
    assert.equal(fixture?.id, access.accounts.admin.id);
    await original.backup(backup);
    const restored = new Database(backup, {readonly: true, fileMustExist: true});
    try {
      assert.equal(restored.pragma('integrity_check', {simple: true}), 'ok');
      assert.deepEqual(restored.pragma('foreign_key_check'), []);
      const tables = original.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      const counts = {};
      for (const {name} of tables) {
        const sql = 'SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid';
        const rows = original.prepare(sql).all();
        assert.deepEqual(restored.prepare(sql).all(), rows, name);
        counts[name] = rows.length;
      }
      checks.restore = {integrity: 'ok', foreignKeys: 'ok', tables: counts};
    } finally {
      restored.close();
    }
    fs.copyFileSync(backup, copy, fs.constants.COPYFILE_EXCL);
  } finally {
    original.close();
  }
}

async function run() {
  await verifyRestore();
  const port = await new Promise((resolve, reject) => {
    const listener = createServer();
    listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const candidate = listener.address().port;
      listener.close(() => resolve(candidate));
    });
  });
  const base = 'http://127.0.0.1:' + port;
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: {...process.env, NODE_ENV: 'production', DMD_DB_PATH: copy},
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  for (let tries = 0; ; tries++) {
    if (await fetch(base + '/api/auth/status').then(r => r.ok, () => false)) break;
    assert.ok(tries < 60 && server.exitCode === null, 'TEST server did not start');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    headless: true, executablePath: process.env.DMD_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  async function login(name, viewport = {width: 1440, height: 1000}) {
    const context = await browser.newContext({viewport});
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(20000);
    await page.goto(base);
    const {username, password} = account(name);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/login'));
    await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
    const response = await loginResponse;
    assert.equal((await response.json()).user.role, access.accounts[name].role);
    await page.getByRole('heading', {name: 'Đăng nhập', exact: true}).waitFor({state: 'hidden'});
    return page;
  }
  async function get(page, url) {
    return page.evaluate(async endpoint => {
      const response = await fetch(endpoint);
      return {ok: response.ok, status: response.status, data: await response.json()};
    }, url);
  }
  const admin = await login('admin');
  const dashboard = await get(admin, '/api/admin-action-queue');
  checks.dashboardUnpriced = dashboard.data.unpriced.length;
  if (mode === 'after') assert.equal(checks.dashboardUnpriced, 0);
  await admin.getByRole('heading', {name: /Chưa chốt giá bán/}).waitFor();
  await admin.screenshot({path: path.join(output, 'admin-dashboard.png')});
  const start = performance.now();
  await admin.getByRole('button', {name: 'Orders', exact: true}).click();
  await admin.getByRole('button', {name: /Mua đơn hàng loạt/}).click();
  const bulk = admin.getByRole('button', {name: /Sẵn sàng mua/});
  await admin.getByText('TEST-BULK-001', {exact: true}).waitFor();
  const queueResponse = await get(admin, '/api/orders/tracking-queue');
  assert.ok(queueResponse.ok, 'ready queue HTTP ' + queueResponse.status);
  const ready = queueResponse.data;
  const issuesResponse = await get(admin, '/api/orders/tracking-queue?view=ISSUES');
  assert.ok(issuesResponse.ok, 'issue queue HTTP ' + issuesResponse.status);
  const issues = issuesResponse.data;
  const readyBulk = ready.rows.filter(row => row.client_order_id.startsWith('TEST-BULK-'));
  const issueBulk = issues.rows.filter(row => row.client_order_id.startsWith('TEST-BULK-'));
  checks.bulk = {
    clicksToOpen: 2, openMs: Math.round(performance.now() - start), displayed: await bulk.innerText(),
    readyOrders: new Set(readyBulk.map(row => row.order_pk)).size,
    issues: Object.fromEntries(issueBulk.map(row => [row.client_order_id, row.purchase_issue])),
    readyButHeld: readyBulk.some(row => row.client_order_id === 'TEST-BULK-086'),
    readyButUnfunded: readyBulk.some(row => row.client_order_id === 'TEST-BULK-096'),
    editableUsdInput: await admin.getByPlaceholder('USD', {exact: true}).count(),
  };
  await admin.screenshot({path: path.join(output, 'admin-bulk-1440.png')});
  await admin.setViewportSize({width: 390, height: 844});
  await admin.screenshot({path: path.join(output, 'admin-bulk-390.png')});
  checks.bulk.mobileDocumentWidth = await admin.evaluate(() => document.documentElement.scrollWidth);
  if (mode === 'after') {
    assert.equal(checks.bulk.readyOrders, 85);
    assert.equal(Object.keys(checks.bulk.issues).length, 15);
    assert.equal(checks.bulk.editableUsdInput, 0);
    assert.match(checks.bulk.issues['TEST-BULK-096'], /Thiếu sức mua|Debt/);
    assert.match(checks.bulk.issues['TEST-BULK-086'], /tạm dừng/);
    assert.match(checks.bulk.issues['TEST-BULK-091'], /phone/);
    assert.equal(readyBulk.filter(row => row.client_order_id === 'TEST-BULK-010').length, 2);
    assert.equal(await admin.getByRole('checkbox', {name: /Chọn Order TEST-BULK-010/}).count(), 1);
    await admin.setViewportSize({width: 1440, height: 1000});
    await admin.getByPlaceholder(/TRACKING-001/).fill('TEST-UAT-NEW\thttps://labels.test/new.pdf');
    await admin.getByRole('button', {name: 'Áp dụng vào sheet'}).click();
    const pasted = admin.locator('input[value="TEST-UAT-NEW"]');
    await pasted.waitFor();
    const filters = admin.locator('.bulkFilters');
    await filters.locator('select').nth(0).selectOption('Chuyên tuyến');
    await filters.locator('select').nth(1).selectOption('TEST Express');
    await pasted.waitFor({state: 'hidden'});
    await filters.locator('select').nth(1).selectOption('TEST Daily');
    await pasted.waitFor();
    await admin.route('**/api/orders/tracking-queue', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({status: 503, json: {error: 'TEST: dịch vụ tạm gián đoạn'}});
      } else await route.continue();
    });
    const save = admin.getByRole('button', {name: 'Lưu Tracking/Label'});
    await save.click();
    await admin.getByText(/TEST: dịch vụ tạm gián đoạn/).waitFor();
    assert.equal(await pasted.count(), 1);
    await admin.screenshot({path: path.join(output, 'admin-bulk-retry.png')});
    await admin.unroute('**/api/orders/tracking-queue');
    const posted = admin.waitForResponse(r => r.url().endsWith('/api/orders/tracking-queue') && r.request().method() === 'POST');
    await save.click();
    const postedResponse = await posted;
    const response = await postedResponse.json();
    assert.equal(postedResponse.status(), 200, JSON.stringify(response));
    assert.deepEqual(response, {saved: 1, orders: 1});
    const database = new Database(copy, {readonly: true});
    try {
      const orderId = readyBulk.find(row => row.client_order_id === 'TEST-BULK-001').order_pk;
      const charges = database.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='ORDER_CHARGE'").all(orderId);
      assert.deepEqual(charges, [{delta: '-200000.125'}]);
      assert.equal(database.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE order_id=?').get(orderId).n, 0);
      checks.bulk.savedVndCharge = charges[0].delta;
      checks.bulk.retryPreservedDraft = true;
    } finally { database.close(); }
  }
  if (mode === 'after') {
    await admin.goto(base);
    await admin.getByRole('button', {name: 'Orders', exact: true}).click();
    await admin.locator('summary').filter({hasText: /^Emergency Hold$/}).click();
    const held = admin.getByRole('button', {name: /TEST Hold.*5 Order đang Hold/});
    await held.waitFor();
    await held.scrollIntoViewIfNeeded();
    await admin.screenshot({path: path.join(output, 'admin-emergency.png')});
    await admin.locator('summary').filter({hasText: /^Pending Supplier Recovery$/}).click();
    const recovery = admin.getByRole('row').filter({hasText: 'TEST-TRACK-001'});
    await recovery.getByText(/Supplier Claim #1.*Đã quyết định/).waitFor();
    assert.ok(await recovery.getByText('20000.125', {exact: true}).isVisible());
    await recovery.scrollIntoViewIfNeeded();
    await admin.screenshot({path: path.join(output, 'admin-recovery.png')});
    checks.worklists = {heldOrders: 5, approvedRecovery: '20000.125'};
    await admin.getByRole('button', {name: /Đổi Tracking/}).click();
    const firstInput = admin.getByRole('group', {name: 'Dữ liệu thay Tracking'}).locator('input').first();
    async function pasteReplacement(oldTracking, newTracking) {
      await firstInput.evaluate((input, values) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', values.join('\t'));
        input.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData}));
      }, [oldTracking, newTracking, 'https://labels.test/replacement.pdf']);
    }
    const preview = admin.getByRole('button', {name: 'Kiểm tra dữ liệu', exact: true});
    const confirmReplacement = admin.getByRole('button', {name: 'Xác nhận thay thế', exact: true});
    await pasteReplacement('TEST-TRACK-003', 'TEST-REPLACE-003');
    await preview.click();
    await admin.getByText('TEST-ISSUED-003', {exact: true}).waitFor();
    assert.ok(await confirmReplacement.isEnabled());
    await pasteReplacement('TEST-TRACK-004', 'TEST-REPLACE-004');
    assert.ok(await confirmReplacement.isDisabled());
    await preview.click();
    await admin.getByText('TEST-ISSUED-004', {exact: true}).waitFor();
    await admin.screenshot({path: path.join(output, 'admin-tracking-repreview.png')});
    assert.ok(await confirmReplacement.isEnabled());
    await confirmReplacement.click();
    await admin.getByText('Đã đổi 1 Tracking/Label.', {exact: true}).waitFor();
    checks.trackingReplacement = {freshPreviewRequired: true, saved: 1};
    const finance = await login('finance');
    await finance.goto(base + '/vnd');
    await finance.getByLabel('Supplier VNĐ', {exact: true}).fill('TEST Carrier A');
    const supplierStart = performance.now();
    await finance.getByRole('button', {name: 'Tải queue Supplier'}).click();
    await finance.getByText(/Chờ review: 499; có lỗi:/).waitFor();
    checks.supplier = {rows: 500, exceptions: 30, loadedMs: Math.round(performance.now() - supplierStart)};
    const onlyErrors = finance.getByLabel('Chỉ hàng có lỗi', {exact: true});
    await onlyErrors.check();
    await finance.getByText(/TEST-UNMATCHED-001/).first().scrollIntoViewIfNeeded();
    assert.ok(await finance.getByText(/TEST-UNMATCHED-030/).first().isVisible());
    await finance.screenshot({path: path.join(output, 'finance-queue-1440.png')});
    await finance.setViewportSize({width: 390, height: 844});
    await finance.screenshot({path: path.join(output, 'finance-queue-390.png')});
    checks.supplier.mobileDocumentWidth = await finance.evaluate(() => document.documentElement.scrollWidth);
    checks.roles = ['ADMIN', 'FINANCE'];
    for (const name of ['bod', 'sales', 'client']) {
      const page = await login(name, {width: 390, height: 844});
      if (name !== 'bod') await page.getByRole('button', {name: 'Orders', exact: true}).click();
      const intended = name === 'bod' ? '/api/service-v1/reporting?month=' + new Date().toISOString().slice(0, 7) : '/api/orders';
      assert.ok((await get(page, intended)).ok, name);
      await page.screenshot({path: path.join(output, name + '-390.png')});
      checks.roles.push(access.accounts[name].role);
    }
  }
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2));
}

run().catch(async error => {
  console.error(error);
  fs.writeFileSync(path.join(output, 'partial-checks.json'), JSON.stringify(checks, null, 2));
  if (activePage) await activePage.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});
