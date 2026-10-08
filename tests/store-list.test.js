'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadStoreList() {
  const sandbox = { fetch: async function () { throw new Error('fetch not mocked'); } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/store-list.js'), 'utf8'), sandbox);
  return sandbox.QMS.Controller.StoreList;
}

test('sortStoresByStoreId ascending', function () {
  const S = loadStoreList();
  const sorted = S.sortStoresByStoreId([
    { storeId: 'zz-qa-store-b' },
    { storeId: 'c030020' },
    { storeId: 's120030' },
  ]);
  assert.deepEqual(sorted.map((s) => s.storeId), ['c030020', 's120030', 'zz-qa-store-b']);
});

test('filterStoresForPicker hides test stores except URL pin', function () {
  const S = loadStoreList();
  const rows = [
    { storeId: 'c030020', test: false },
    { storeId: 'zz-qa-store-a', test: true },
    { storeId: 'zz-qa-store-b', test: true },
  ];
  const hidden = S.filterStoresForPicker(rows, '');
  assert.equal(hidden.some((s) => s.storeId === 'zz-qa-store-a'), false);
  const pinned = S.filterStoresForPicker(rows, 'zz-qa-store-b');
  assert.equal(pinned.some((s) => s.storeId === 'zz-qa-store-b'), true);
  assert.equal(pinned.some((s) => s.storeId === 'zz-qa-store-a'), false);
});

test('mergePinnedStore keeps URL test store selectable', function () {
  const S = loadStoreList();
  const merged = S.mergePinnedStore([{ storeId: 'c030020', test: false }], 'zz-qa-store-a');
  assert.equal(merged.some((s) => s.storeId === 'zz-qa-store-a'), true);
});

test('formatStoreOptionMeta includes online/offline words', function () {
  const S = loadStoreList();
  const on = S.formatStoreOptionMeta({ storeId: 'c030020', name: '店', online: true });
  const off = S.formatStoreOptionMeta({ storeId: 'c030020', name: '店', online: false });
  assert.match(on.text, /online/);
  assert.match(off.text, /offline/);
  assert.equal(on.onlineClass, 'store-online');
  assert.equal(off.onlineClass, 'store-offline');
});

test('store id format validation', function () {
  const S = loadStoreList();
  assert.equal(S.isValidStoreIdFormat('c030020'), true);
  assert.equal(S.isValidStoreIdFormat('zz-qa-store-a'), true);
  assert.equal(S.isValidStoreIdFormat('a123456'), true);
  assert.equal(S.isValidStoreIdFormat('C030020'), false);
  assert.equal(S.isValidStoreIdFormat('zz-qa-UPPER'), false);
});

test('resolveStoreAccessUserMessage maps 403 codes', function () {
  const S = loadStoreList();
  assert.equal(
    S.resolveStoreAccessUserMessage({ status: 403, response: { code: 'store_id_invalid' } }),
    S.MSG_STORE_ID_INVALID,
  );
  assert.equal(
    S.resolveStoreAccessUserMessage({ status: 403, response: { code: 'store_not_allowed' } }),
    S.MSG_STORE_NOT_REGISTERED,
  );
  assert.equal(
    S.resolveStoreAccessUserMessage({ status: 403, response: { code: 'dev_store_registry_full' } }),
    S.MSG_REGISTRY_FULL,
  );
});

test('listStoresErrorLine does not clear menu semantics', function () {
  const S = loadStoreList();
  assert.match(S.listStoresErrorLine({ status: 401 }), /登入/);
  assert.match(S.listStoresErrorLine({ status: 403 }), /權限/);
  assert.match(S.listStoresErrorLine({ message: 'Failed to fetch' }), /網路/);
});
