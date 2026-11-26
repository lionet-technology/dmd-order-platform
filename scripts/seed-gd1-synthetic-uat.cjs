// The test harness creates a new private temporary database on every invocation.
const {temp} = require('./service-v1-test-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {db} = require('../src/lib/db.ts');
const {createUser} = require('../src/lib/auth.ts');
const {upsertOrder} = require('../src/lib/finance.ts');
const {saveOrderShipmentStructure} = require('../src/lib/order-shipments.ts');
const {addOrderTracking} = require('../src/lib/order-operations.ts');
const {startSubServiceEmergencyHold} = require('../src/lib/emergency-hold.ts');
const {vndAction, vndRequest} = require('../src/lib/vnd-operational.ts');
const {vndSupplierAction, vndSupplierView} = require('../src/lib/vnd-supplier.ts');
const {supplierRecoveryWorklist} = require('../src/lib/vnd-supplier-recovery-worklist.ts');
const {vndBusinessReport} = require('../src/lib/vnd-reporting.ts');
const {vndDay} = require('../src/lib/vnd-debt.ts');

const supplier = 'TEST Carrier A';
const password = 'Test!' + randomBytes(18).toString('base64url');
const credentials = {};
let sequence = 0;
function user(name, role, extra = {}) {
  const username = 'synthetic.' + name;
  const account = createUser({username, role, display_name: 'TEST ' + name, password, ...extra});
  credentials[name] = {username, role, id: account.id};
  return account;
}

const started = Date.now();
try {
  const admin = user('admin', 'ADMIN', {is_root_admin: true});
  const finance = user('finance', 'FINANCE');
  user('bod', 'BOD');
  const sales = user('sales', 'SALES');
  const client = user('client', 'CLIENT', {sales_user_id: sales.id});
  const low = user('low-funds', 'CLIENT', {sales_user_id: sales.id});
  const act = (actor, owner, action, body = {}) => vndAction(actor, {
    action, client_id: owner.id, reason: 'Synthetic UAT', request_key: 'synthetic-' + ++sequence, ...body,
  });
  const supplierAct = (action, body) => vndSupplierAction(finance, {
    supplier, action, reason: 'Synthetic UAT', request_key: 'synthetic-' + ++sequence, ...body,
  });
  const enumValue = db.prepare('INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,active) VALUES (?,?,?,1)');
  enumValue.run('SERVICE', 'Chuyên tuyến', '');
  enumValue.run('SUPPLIER', supplier, '');
  enumValue.run('COUNTRY', 'US', '');
  const route = db.prepare('INSERT INTO service_route_configs(service,sub_service,supplier,active,client_self_purchase,max_cartons_per_order) VALUES (?,?,?,1,1,4)');
  const allow = db.prepare('INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled) VALUES (?,?,?,1)');
  const routes = {};
  for (const sub of ['TEST Daily', 'TEST Express', 'TEST Hold']) {
    enumValue.run('SUB_SERVICE', sub, 'Chuyên tuyến');
    routes[sub] = Number(route.run('Chuyên tuyến', sub, supplier).lastInsertRowid);
    for (const account of [client, low]) allow.run(account.id, 'Chuyên tuyến', sub);
  }
  for (const account of [client, low]) act(admin, account, 'activate', {credit_limit: '0'});
  act(admin, client, 'post', {kind: 'PAYMENT', delta: '450000000.125'});
  const tag = index => String(index).padStart(3, '0');
  function order(code, sub, owner, cartonCount = 1, valid = true) {
    const result = upsertOrder({
      client_user_id: owner.id, order_id: code, service: 'Chuyên tuyến', sub_service: sub, supplier,
      country: 'US', carton_count: cartonCount, weight: 2.5, length: 20, width: 16, height: 12,
      item: 'Synthetic textile sample', material: 'Cotton', recipient_name: 'TEST Recipient',
      address1: '100 TEST Avenue', city: 'New York', state: 'NY', zip: '10001',
      phone: valid ? '2125550100' : '',
    });
    if (cartonCount > 1) {
      saveOrderShipmentStructure(result.id, {cartons: Array.from({length: cartonCount}, (_, i) => ({
        carton_number: i + 1, lot_number: i + 1, weight: 1.25, length: 20, width: 16, height: 12,
        items: [{description: 'Synthetic textile sample', material: 'Cotton', quantity: 1}],
      }))});
    }
    return result;
  }
  function reserve(orderId, owner) {
    act(owner, owner, 'request', {order_id: orderId});
    act(admin, owner, 'offer', {
      order_id: orderId, expected_revision: vndRequest(orderId).revision,
      amount: '200000.125', net_vnd: '110000.02', base_vnd: '150000.075',
    });
    act(owner, owner, 'consent', {order_id: orderId, expected_revision: vndRequest(orderId).revision});
    return vndRequest(orderId).status;
  }

  for (let i = 1; i <= 100; i++) {
    const owner = i > 95 ? low : client;
    const sub = i > 85 && i <= 90 ? 'TEST Hold' : i % 2 ? 'TEST Daily' : 'TEST Express';
    const item = order('TEST-BULK-' + tag(i), sub, owner, i % 10 === 0 ? 2 : 1, i <= 90 || i > 95);
    if (i > 90 && i <= 95) {
      assert.throws(() => reserve(item.id, owner), /Thiếu thông tin bắt buộc/);
    } else {
      assert.equal(reserve(item.id, owner), i > 95 ? 'AWAITING_FUNDS' : 'RESERVED');
    }
  }
  startSubServiceEmergencyHold(admin, routes['TEST Hold'], 'TEST carrier service interruption');

  const invoice = [];
  const issuedIds = [];
  const carton = db.prepare('SELECT id FROM order_cartons WHERE order_id=?');
  const historyRequest = db.prepare(`INSERT INTO vnd_purchase_requests
    (order_id,client_id,status,offer,charged_offer,confirmed_at,request_actor_id)
    VALUES (?,?,'CHARGED','200000.125','200000.125',CURRENT_TIMESTAMP,?)`);
  const historyOrder = db.prepare(`UPDATE orders SET workflow_status='PURCHASED', service_purchased_at=CURRENT_TIMESTAMP,
    purchase_completed_at=CURRENT_TIMESTAMP WHERE id=?`);
  const historyQuote = db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json,manual_offer) VALUES (?,?,1)");
  const historyCharge = db.prepare(`INSERT INTO vnd_ledger
    (client_id,order_id,kind,delta,reason,actor_id,request_key)
    VALUES (?,?,'ORDER_CHARGE','-200000.125','Synthetic issued Order',?,?)`);
  for (let i = 1; i <= 470; i++) {
    const item = order('TEST-ISSUED-' + tag(i), 'TEST Daily', client);
    issuedIds.push(item.id);
    if (i === 1) {
      assert.equal(reserve(item.id, client), 'RESERVED');
    } else {
      // Opening history at volume. The first issued Order and the UAT save exercise the live charge path.
      historyRequest.run(item.id, client.id, admin.id);
      historyOrder.run(item.id);
      historyQuote.run(item.id, JSON.stringify({source: 'MANUAL_CUSTOM', selling_vnd: '200000.125',
        net_vnd: '110000.02', base_vnd: '150000.075', lots: []}));
      historyCharge.run(client.id, item.id, admin.id, 'vnd-charge:' + item.id);
    }
    const tracking = 'TEST-TRACK-' + tag(i);
    addOrderTracking({orderId: item.id, cartonId: carton.get(item.id).id, tracking,
      labelUrl: 'https://labels.test/' + tracking + '.pdf', actorId: admin.id});
    assert.equal(vndRequest(item.id).status, 'CHARGED');
    invoice.push({tracking, amount: '110000.02', reference: 'TEST-INVOICE-' + tag(i)});
  }
  for (let i = 1; i <= 30; i++) invoice.push({
    tracking: 'TEST-NO-MATCH-' + tag(i), amount: '110000.02', reference: 'TEST-UNMATCHED-' + tag(i),
  });

  let actual = supplierAct('import', {items: invoice.slice(0, 200)});
  const sample = actual.import_rows.find(row => row.data.tracking === 'TEST-TRACK-001');
  assert.ok(sample?.lot_id, 'first Supplier row matches issued Lot');
  supplierAct('review_import', {decision: 'accept', items: [
    {id: sample.id, token: sample.token, expected_approved_cost_id: 0},
  ]});
  supplierAct('import', {items: invoice.slice(200, 400)});
  actual = supplierAct('import', {items: invoice.slice(400)});
  assert.equal(actual.import_rows.length, 500);
  assert.equal(actual.import_rows.filter(row => row.lot_id == null).length, 30);

  const claimOrder = issuedIds[0];
  for (const [action, amount] of [['surcharge', '12000.25'], ['tax', '7500.01']]) {
    act(admin, client, action, {order_id: claimOrder, amount});
  }
  act(client, client, 'claim_create', {order_ids: [claimOrder], category: 'SHIPPING_ISSUE', evidence: 'TEST damaged carton'});
  const claim = db.prepare('SELECT MAX(id) id FROM vnd_claims').get().id;
  act(admin, client, 'claim_complete', {claim_id: claim, amount: '35000.15', evidence: 'Synthetic refund approval', expected_revision: 0});
  act(finance, client, 'refund_balance', {amount: '35000.15'});
  const profit = () => vndBusinessReport(vndDay().slice(0, 7)).order_profitability.find(row => row.order_id === claimOrder);
  assert.equal(profit().gp_net, '74500.215');
  const source = supplierRecoveryWorklist(admin).find(row => row.client_claim_id === claim);
  const {lot_id, epoch} = source.attempts[0];
  vndSupplierAction(admin, {supplier, action: 'claim_group_recovery',
    reason: 'Synthetic linked recovery', evidence: 'TEST carrier credit', reference: 'TEST-RECOVERY-GROUP',
    request_key: 'synthetic-' + ++sequence, amount: '35000.15',
    sources: [{client_claim_id: claim, decision_id: source.decision_id, order_id: claimOrder, lot_id, epoch}],
  });
  const recovery = vndSupplierView(finance, supplier).claims[0];
  const approved = supplierAct('claim_approve', {claim_id: recovery.id, expected_decision_id: recovery.decision_id,
    amount: '20000.125', evidence: 'TEST credit approval', reference: 'TEST-RECOVERY-APPROVAL'});
  assert.equal(profit().gp_net, '94500.34');
  const settled = supplierAct('claim_settle', {claim_id: recovery.id, expected_decision_id: approved.claims[0].decision_id,
    amount: '5000.01', settlement: 'OFFSET', reference: 'TEST-RECOVERY-OFFSET', evidence: 'TEST payable offset'});
  assert.equal(settled.receivable, '15000.115');
  assert.equal(profit().gp_net, '94500.34');
  act(admin, low, 'post', {kind: 'ADJUSTMENT', delta: '-100000.125'});
  assert.equal(db.pragma('integrity_check', {simple: true}), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  fs.writeFileSync(path.join(temp, 'test-access.json'),
    JSON.stringify({database: process.env.DMD_DB_PATH, accounts: credentials, password}, null, 2), {mode: 0o600});
  console.log(JSON.stringify({database: process.env.DMD_DB_PATH, accessFile: path.join(temp, 'test-access.json'),
    orders: 570, bulk: {ready: 85, invalid: 5, insufficientFunds: 5, held: 5},
    supplierRows: 500, unmatchedSupplierRows: 30, supplierBatches: 3, claim, recovery: recovery.id, gpNet: profit().gp_net, elapsedMs: Date.now() - started}, null, 2));
} finally {
  db.close();
}
