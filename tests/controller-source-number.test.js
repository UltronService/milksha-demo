'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadControllerSendNumber() {
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
    Set: Set,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller', 'controller-send-number.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'push-numbers-params.js'), 'utf8'), sandbox);
  return {
    SendNumber: sandbox.QMS.Controller.SendNumber,
    PushNumbersParams: sandbox.QMS.Transport.PushNumbersParams,
  };
}

test('quick send source menu: 門市、迷點、Uber Eats、foodpanda、Udd; default 門市', function () {
  const { SendNumber } = loadControllerSendNumber();
  const labels = SendNumber.QUICK_SEND_SOURCE_OPTIONS.map(function (o) {
    return o.label;
  });
  assert.equal(JSON.stringify(labels), JSON.stringify(['門市', '迷點', 'Uber Eats', 'foodpanda', 'Udd']));
  assert.equal(SendNumber.DEFAULT_SOURCE_KEY, 'store');
  assert.equal(SendNumber.sourceOptionForKey('store').label, '門市');
});

test('store quick send accepts only four digits', function () {
  const { SendNumber } = loadControllerSendNumber();
  assert.equal(SendNumber.validateQuickSendNumber('store', '1234').ok, true);
  assert.equal(SendNumber.validateQuickSendNumber('store', '1234').normalized, '1234');
  assert.equal(SendNumber.validateQuickSendNumber('store', '123').ok, false);
  assert.equal(SendNumber.validateQuickSendNumber('store', '12345').ok, false);
});

test('point quick send: 3–4 digits preserves leading zero', function () {
  const { SendNumber } = loadControllerSendNumber();
  const ok = SendNumber.validateQuickSendNumber('point', '091');
  assert.equal(ok.ok, true);
  assert.equal(ok.normalized, '091');
  assert.equal(SendNumber.validateQuickSendNumber('point', '12').ok, false);
});

test('uber and udd: 4–6 alnum uppercased', function () {
  const { SendNumber } = loadControllerSendNumber();
  const uber = SendNumber.validateQuickSendNumber('uber', 'c7458');
  assert.equal(uber.ok, true);
  assert.equal(uber.normalized, 'C7458');
  const udd = SendNumber.validateQuickSendNumber('udd', 'ab12');
  assert.equal(udd.ok, true);
  assert.equal(udd.normalized, 'AB12');
  assert.equal(SendNumber.validateQuickSendNumber('uber', 'abc').ok, false);
});

test('foodpanda: 4–6 digits, strips hash', function () {
  const { SendNumber } = loadControllerSendNumber();
  assert.equal(SendNumber.validateQuickSendNumber('fp', '#6406').normalized, '6406');
  assert.equal(SendNumber.validateQuickSendNumber('fp', '6406').ok, true);
  assert.equal(SendNumber.validateQuickSendNumber('fp', '123').ok, false);
});

test('invalid quick send returns message and does not normalize', function () {
  const { SendNumber } = loadControllerSendNumber();
  const bad = SendNumber.validateQuickSendNumber('store', 'abcd');
  assert.equal(bad.ok, false);
  assert.match(bad.message, /4 位數字/);
});

test('cloud push_numbers params use no + sourceType cloud strings', function () {
  const { SendNumber, PushNumbersParams } = loadControllerSendNumber();
  const def = SendNumber.sourceOptionForKey;
  const params = PushNumbersParams.ticketsToPushNumbersParams(
    [
      { no: '1234', status: 'ready', sourceKey: 'store' },
      { no: 'C7458', status: 'ready', sourceKey: 'uber' },
      { no: '091', status: 'preparing', sourceKey: 'point' },
    ],
    function (key) {
      return def(key);
    },
  );
  assert.equal(JSON.stringify(params.ready), JSON.stringify([
    { no: '1234', sourceType: 'From_Store_OK' },
    { no: 'C7458', sourceType: 'From_UberEat_OK' },
  ]));
  assert.equal(JSON.stringify(params.preparing), JSON.stringify([{ no: '091', sourceType: 'From_milksha_point_Preparing' }]));
  const nc = PushNumbersParams.pushNumbersParamsToNumberContent(params);
  assert.equal(nc.length, 3);
  assert.equal(nc[1].source_type, 'From_UberEat_OK');
});

test('store-only ticket list maps to legacy string push_numbers (pre-backend deploy)', function () {
  const { SendNumber, PushNumbersParams } = loadControllerSendNumber();
  const def = SendNumber.sourceOptionForKey;
  const params = PushNumbersParams.ticketsToPushNumbersParams(
    [{ no: '2001', status: 'ready', sourceKey: 'store' }],
    function (key) {
      return def(key);
    },
  );
  assert.equal(JSON.stringify(params.ready), JSON.stringify([{ no: '2001', sourceType: 'From_Store_OK' }]));
  assert.equal(typeof params.ready[0].no, 'string');
});

test('push_numbers params round-trip legacy string entries as store', function () {
  const { PushNumbersParams } = loadControllerSendNumber();
  const nc = PushNumbersParams.pushNumbersParamsToNumberContent({
    ready: ['2001'],
    preparing: ['2002'],
  });
  assert.equal(JSON.stringify(nc), JSON.stringify([
    { source_type: 'From_Store_OK', number: '2001' },
    { source_type: 'From_Store_Preparing', number: '2002' },
  ]));
});
