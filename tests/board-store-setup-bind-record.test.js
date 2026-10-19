'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    snapshot() {
      return new Map(map);
    },
  };
}

function loadHomeBoardStore() {
  const sandbox = { globalThis: {}, QMS: {}, URLSearchParams };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'store-id.js'), 'utf8'), sandbox);
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'home-board-store.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Receiver.HomeBoardStore;
}

const BIND_KEY = 'milksha:board-bind-record';

test('items 9–11: bind record ignored for setup URLs and left unchanged', function () {
  const H = loadHomeBoardStore();
  const record = JSON.stringify({
    storeId: 'zz-qa-store-a',
    storeNumber: 'zz-qa-store-a',
    storeName: 'QA',
    deviceId: 'dev-1',
    brandId: 'zz-qa',
  });
  const storage = memoryStorage({ [BIND_KEY]: record });
  const before = storage.snapshot().get(BIND_KEY);

  assert.equal(H.needsStoreSetup(''), true);
  assert.equal(H.needsStoreSetup('?store=abc'), true);
  assert.equal(storage.snapshot().get(BIND_KEY), before);

  assert.equal(H.needsStoreSetup('?store=zz-qa-store-a'), false);
  assert.equal(storage.snapshot().get(BIND_KEY), before);
});
