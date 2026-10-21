'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const CLOUD_MS = 1_765_100_000_000;
const STORE = 'zz-mock-sent-at-store';

function loadPosSign() {
  const sandbox = {
    globalThis: {},
    QMS: { Transport: {} },
    crypto: crypto,
    TextEncoder: TextEncoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/vendor/md5.min.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-md5.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-pos-sign.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.MilkshaPosSign;
}

function loadShim(cloudNowMs) {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
    get length() {
      return storage.size;
    },
    key: (i) => Array.from(storage.keys())[i] || null,
  };
  const sandbox = {
    globalThis: {},
    QMS: { Transport: {}, Board: {} },
    localStorage,
    __MILKSHA_TEST_CLOUD_NOW_MS: cloudNowMs,
    crypto: crypto,
    TextEncoder: TextEncoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const files = [
    'js/vendor/md5.min.js',
    'js/board/today-board.js',
    'js/transport/paths.js',
    'js/transport/milksha-md5.js',
    'js/transport/milksha-pos-sign.js',
    'js/transport/pos-receiver-validate.js',
    'js/transport/json-raw.js',
    'js/transport/pos-sent-at-clock.js',
    'js/transport/local-cloud-shim.js',
  ];
  for (const rel of files) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox);
  }
  return { create: sandbox.QMS.Transport.createLocalCloudShim, storage, sandbox };
}

async function sendReadyNumber(shimApi, PosSign, secret, sentAtMs) {
  const inner = {
    target: 'milksha' + STORE,
    data: { number_content: [{ source_type: 'From_Store_OK', number: '8801' }] },
  };
  const draft = {
    isEncrypt: false,
    serviceSpecialData_Json: inner,
    merchant_id: 'milksha',
    account: STORE,
    sentAtMs: sentAtMs,
  };
  const signed = await PosSign.signPosBody(draft, secret);
  return shimApi.posReceiver(signed);
}

test('local shim: ignored clock still writes board numbers', async function () {
  const PosSign = loadPosSign();
  const secret = 'fake-milksha-pos-sign-key-for-tests';
  const { create, storage } = loadShim(CLOUD_MS);
  const shim = create({
    storeId: STORE,
    boundTarget: 'milksha' + STORE,
    config: { posSignSecret: secret },
  });
  await shim.api.boxHeartbeat({
    storeId: STORE,
    deviceId: 'zz-mock-device',
    appVersion: 'test',
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
  });
  const deviceFast = CLOUD_MS + 10_001;
  const res = await sendReadyNumber(shim.api, PosSign, secret, deviceFast);
  assert.equal(res.isSuccess, true);
  assert.equal(res.posSentAtIgnored, true);
  const boardRaw = storage.get('milksha:local:board:' + STORE);
  assert.ok(boardRaw);
  const board = JSON.parse(boardRaw);
  const nums = (board.tickets || []).map((t) => t.no);
  assert.ok(nums.includes('8801'));
});
