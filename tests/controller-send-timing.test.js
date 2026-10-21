'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STORE = { merchant_id: 'zz-qa-merchant', account: 'zz-qa-account' };
const TARGET = 'milkshazz-qa-account';

function loadSendTimingStack() {
  const sandbox = {
    console: console,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Error: Error,
    TextEncoder: TextEncoder,
    crypto: crypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const files = [
    'js/vendor/md5.min.js',
    'js/transport/milksha-md5.js',
    'js/transport/milksha-pos-sign.js',
    'js/transport/milksha-pos-wire.js',
    'js/transport/pos-sent-at-clock.js',
    'controller/controller-send-timing.js',
    'js/transport/dev-command-validation.js',
  ];
  for (const rel of files) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox);
  }
  return {
    SendTiming: sandbox.QMS.Controller.SendTiming,
    DevCmd: sandbox.QMS.Transport.DevCommandValidation,
    PosWire: sandbox.QMS.Transport.MilkshaPosWire,
  };
}

function loadControllerAppSource() {
  return fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
}

function preparingNc() {
  return [{ source_type: 'From_Store_Preparing', number: '2001' }];
}

function readyNc() {
  return [{ source_type: 'From_Store_OK', number: '1001' }];
}

test('1. preparing sends include sentAtMs', function () {
  const { SendTiming } = loadSendTimingStack();
  const sentAtMs = 1_700_000_000_123;
  const body = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: preparingNc(),
    sentAtMs,
  });
  assert.equal(body.sentAtMs, sentAtMs);
  assert.deepEqual(body.serviceSpecialData_Json.data.number_content, preparingNc());
});

test('2. ready (請取餐) sends include sentAtMs', function () {
  const { SendTiming } = loadSendTimingStack();
  const sentAtMs = 1_700_000_001_000;
  const body = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: readyNc(),
    sentAtMs,
  });
  assert.equal(body.sentAtMs, sentAtMs);
  assert.deepEqual(body.serviceSpecialData_Json.data.number_content, readyNc());
});

test('3. clear sends include sentAtMs', function () {
  const { SendTiming, DevCmd } = loadSendTimingStack();
  const sentAtMs = 1_700_000_002_500;
  const posClear = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: [],
    sentAtMs,
  });
  assert.equal(posClear.sentAtMs, sentAtMs);
  assert.deepEqual(posClear.serviceSpecialData_Json.data.number_content, []);

  const dev = DevCmd.buildDevCommandRequest({
    storeId: 'zz-qa-clear-store',
    deviceId: 'zz-qa-device',
    type: 'clear_now',
    params: {},
    sentAtMs,
  });
  assert.equal(dev.ok, true);
  assert.equal(dev.body.sentAtMs, sentAtMs);
});

test('4. sentAtMs equals moment of pressing send', function () {
  const { SendTiming } = loadSendTimingStack();
  const fixed = 1_765_432_100_456;
  const captured = SendTiming.readSendTimestampMs(function () {
    return fixed;
  });
  assert.equal(captured, fixed);
  const body = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: preparingNc(),
    sentAtMs: captured,
  });
  assert.equal(body.sentAtMs, fixed);
});

test("5. second send's sentAtMs >= first", function () {
  const { SendTiming } = loadSendTimingStack();
  let t = 1_700_000_000_000;
  const now = function () {
    return t;
  };
  const first = SendTiming.readSendTimestampMs(now);
  t += 50;
  const second = SendTiming.readSendTimestampMs(now);
  assert.ok(second >= first);
});

test('6. retry after failure uses a new sentAtMs', function () {
  const { SendTiming } = loadSendTimingStack();
  const attempt1 = SendTiming.readSendTimestampMs(function () {
    return 1_700_000_010_000;
  });
  const attempt2 = SendTiming.readSendTimestampMs(function () {
    return 1_700_000_010_500;
  });
  assert.notEqual(attempt2, attempt1);
  assert.ok(attempt2 > attempt1);
});

test('7. other fields and number content unchanged; controller-app wires send timing', function () {
  const { SendTiming } = loadSendTimingStack();
  const sentAtMs = 1_700_000_020_000;
  const body = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: preparingNc(),
    sentAtMs,
  });
  assert.equal(body.isEncrypt, false);
  assert.equal(body.merchant_id, STORE.merchant_id);
  assert.equal(body.account, STORE.account);
  assert.equal(body.serviceSpecialData_Json.target, TARGET);
  assert.deepEqual(body.serviceSpecialData_Json.data.number_content, preparingNc());
  assert.equal(body.serviceSpecialData_Json.data.newsTicker_content.length, 0);
  assert.equal(body.serviceSpecialData_Json.data.newsTickerSpeed, 0);
  const src = loadControllerAppSource();
  const html = fs.readFileSync(path.join(ROOT, 'controller', 'index.html'), 'utf8');
  assert.match(src, /readSendTimestampMs/);
  assert.match(src, /SendTiming\.buildPosReceiverDraft/);
  assert.match(html, /controller-send-timing\.js/);
});

test('13. over 10s skew: controller shows 裝置時鐘不準 from response flag', function () {
  const { SendTiming } = loadSendTimingStack();
  const msg = SendTiming.controllerClockWarningMessage({ posSentAtIgnored: true, isSuccess: true });
  assert.equal(msg, '裝置時鐘不準');
  const src = loadControllerAppSource();
  assert.match(src, /pos-clock-warning/);
});

test('14. in range: no controller clock warning', function () {
  const { SendTiming } = loadSendTimingStack();
  assert.equal(SendTiming.controllerClockWarningMessage({ isSuccess: true }), '');
  assert.equal(SendTiming.controllerClockWarningMessage({ posSentAtIgnored: false }), '');
});

test('15. with warning, send still succeeds (no block flag)', function () {
  const { SendTiming } = loadSendTimingStack();
  assert.equal(SendTiming.shouldBlockSendOnClockWarning({ posSentAtIgnored: true, isSuccess: true }), false);
});

test('16. after clock fine, warning message clears', function () {
  const { SendTiming } = loadSendTimingStack();
  const bad = SendTiming.controllerClockWarningMessage({ posSentAtIgnored: true });
  const good = SendTiming.controllerClockWarningMessage({ posSentAtIgnored: false, isSuccess: true });
  assert.equal(bad, '裝置時鐘不準');
  assert.equal(good, '');
});

test('pos wire preserves top-level sentAtMs', async function () {
  const { SendTiming, PosWire } = loadSendTimingStack();
  const draft = SendTiming.buildPosReceiverDraft({
    merchant_id: STORE.merchant_id,
    account: STORE.account,
    target: TARGET,
    numberContent: readyNc(),
    sentAtMs: 1_700_000_030_000,
  });
  const built = await PosWire.signPosWire(draft, 'zz-qa-test-secret', false);
  const parsed = JSON.parse(built.wireText);
  assert.equal(parsed.sentAtMs, 1_700_000_030_000);
});

test('applyPosClockWarningToElement toggles DOM visibility', function () {
  const { SendTiming } = loadSendTimingStack();
  const el = {
    hidden: true,
    textContent: '',
  };
  SendTiming.applyPosClockWarningToElement(el, { posSentAtIgnored: true, isSuccess: true });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, '裝置時鐘不準');
  SendTiming.applyPosClockWarningToElement(el, { posSentAtIgnored: false, isSuccess: true });
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
});

test('push_numbers devCommand carries sentAtMs', function () {
  const { DevCmd } = loadSendTimingStack();
  const sentAtMs = 1_700_000_040_000;
  const built = DevCmd.buildDevCommandRequest({
    storeId: 'zz-qa-push-store',
    deviceId: 'zz-qa-device',
    type: 'push_numbers',
    params: { ready: ['1001'], preparing: ['2001'] },
    sentAtMs,
  });
  assert.equal(built.ok, true);
  assert.equal(built.body.sentAtMs, sentAtMs);
});
