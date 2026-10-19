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
  sandbox.QMS = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'store-id.js'), 'utf8'), sandbox);
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

test('filterStoresForOperatorPicker keeps c030020, a17, and URL pin only', function () {
  const S = loadStoreList();
  const rows = [
    { storeId: 'c030020' },
    { storeId: 'a17' },
    { storeId: 's120030' },
    { storeId: 'zz-qa-ci-store', test: true },
  ];
  assert.deepEqual(S.filterStoresForOperatorPicker(rows, '').map((s) => s.storeId), ['c030020', 'a17']);
  const pinned = S.filterStoresForOperatorPicker(rows, 'zz-qa-ci-store');
  assert.equal(pinned.some((s) => s.storeId === 'zz-qa-ci-store'), true);
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
  assert.equal(S.isValidStoreIdFormat('zz-deny-test'), true);
  assert.equal(S.isValidStoreIdFormat('a123456'), true);
  assert.equal(S.isValidStoreIdFormat('C030020'), true);
  assert.equal(S.isValidStoreIdFormat('a1'), false);
});

test('letter+2 ids valid; single digit after letter invalid', function () {
  const S = loadStoreList();
  assert.equal(S.isValidStoreIdFormat('a17'), true);
  assert.equal(S.isValidStoreIdFormat('a18'), true);
  assert.equal(S.isValidStoreIdFormat('a1'), false);
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
