'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');

function loadPosSign() {
  const sandbox = {
    globalThis: {},
    crypto: crypto,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/vendor/md5.min.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-md5.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-pos-sign.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.MilkshaPosSign;
}

function loadShim() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => {
      storage.set(k, v);
    },
    removeItem: (k) => {
      storage.delete(k);
    },
    get length() {
      return storage.size;
    },
    key: (i) => {
      const keys = Array.from(storage.keys());
      return keys[i] || null;
    },
  };
  const sandbox = {
    globalThis: {},
    localStorage,
    BroadcastChannel: undefined,
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
    'js/transport/dev-command-validation.js',
    'js/transport/json-raw.js',
    'js/transport/local-cloud-shim.js',
  ];
  for (let i = 0; i < files.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, files[i]), 'utf8'), sandbox);
  }
  return sandbox.QMS.Transport.createLocalCloudShim;
}

test('local posReceiver rejects wrong store target', async function () {
  const PosSign = loadPosSign();
  const create = loadShim();
  const secret = 'fake-milksha-pos-sign-key-for-tests';
  const shim = create({
    storeId: 's120030',
    boundTarget: 'milkshas120030',
    config: { posSignSecret: secret },
  });
  const inner = {
    target: 'wrong-target',
    data: { number_content: [{ source_type: 'From_Store_OK', number: '1' }] },
  };
  const draft = {
    isEncrypt: false,
    serviceSpecialData_Json: inner,
    merchant_id: 'milksha',
    account: 's120030',
  };
  const signed = await PosSign.signPosBody(draft, secret);
  const res = await shim.api.posReceiver(signed);
  assert.equal(res.isSuccess, false);
  assert.match(res.information, /找不到目標叫號機/);
});

test('local posReceiver accepts body without configured posSignSecret when device online', async function () {
  const PosSign = loadPosSign();
  const create = loadShim();
  const shim = create({
    storeId: 's120030',
    boundTarget: 'milkshas120030',
    config: {},
  });
  await shim.api.boxHeartbeat({
    storeId: 's120030',
    deviceId: 'stb-01',
    appVersion: 'test',
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
  });
  const inner = {
    target: 'milkshas120030',
    data: {
      number_content: [{ source_type: 'From_Store_OK', number: '9001' }],
    },
  };
  const draft = {
    isEncrypt: false,
    serviceSpecialData_Json: inner,
    merchant_id: 'milksha',
    account: 's120030',
  };
  const signed = await PosSign.signPosBody(draft, 'local-poc-unsigned');
  const res = await shim.api.posReceiver(signed);
  assert.equal(res.isSuccess, true);
  assert.match(res.information, /資料顯示成功/);
});

test('controller device stub does not count as online box for posReceiver', async function () {
  const PosSign = loadPosSign();
  const create = loadShim();
  const shim = create({
    storeId: 's120030',
    boundTarget: 'milkshas120030',
    config: {},
  });
  await shim.api.boxHeartbeat({
    storeId: 's120030',
    deviceId: 'stb-01',
    appVersion: 'controller-local-stub',
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
  });
  const inner = {
    target: 'milkshas120030',
    data: { number_content: [{ source_type: 'From_Store_OK', number: '9002' }] },
  };
  const draft = {
    isEncrypt: false,
    serviceSpecialData_Json: inner,
    merchant_id: 'milksha',
    account: 's120030',
  };
  const signed = await PosSign.signPosBody(draft, 'local-poc-unsigned');
  const res = await shim.api.posReceiver(signed);
  assert.equal(res.isSuccess, true);
  assert.match(res.information, /尚未連線/);
  assert.equal(res.boxOnline, false);
});
