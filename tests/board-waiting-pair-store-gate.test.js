'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  loadPr108StoreModules,
  PR108_STORE_ID_PATH,
  PR108_HOME_BOARD_STORE_PATH,
} = require('./helpers/load-pr108-store-modules.js');
const { loadUrlBindSyncModule } = require('./helpers/load-waiting-pair-module.js');

const BIND_KEY = 'milksha:board-bind-record';

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
  };
}

test('item 16: missing or invalid URL uses 請設定店編號 (PR #108 HomeBoardStore)', function () {
  assert.ok(fs.existsSync(PR108_STORE_ID_PATH), 'merge PR #108: js/store-id.js');
  assert.ok(fs.existsSync(PR108_HOME_BOARD_STORE_PATH), 'merge PR #108: home-board-store.js');
  const pr108 = loadPr108StoreModules();
  assert.ok(pr108);
  const H = pr108.HomeBoardStore;
  assert.equal(H.SETUP_MESSAGE, '請設定店編號');
  assert.equal(H.needsStoreSetup(''), true);
  assert.equal(H.needsStoreSetup('?store=s0305769'), true);
  assert.equal(H.resolveStoreFromUrlParams('?store=s0305769').reason, 'invalid');
});

test('item 20: URL store s999998 clears stale bind record a17 before pair', function () {
  const Sync = loadUrlBindSyncModule();
  const storage = memoryStorage({
    [BIND_KEY]: JSON.stringify({
      storeId: 'a17',
      storeNumber: 'a17',
      storeName: 'stale',
      deviceId: 'dev-old',
    }),
  });
  const decision = Sync.reconcileBindRecordWithUrlStore(storage, {
    urlStoreId: 's999998',
    urlStoreDisplay: 's999998',
  });
  assert.equal(decision.clearedStaleRecord, true);
  assert.equal(storage.getItem(BIND_KEY), null);
  assert.equal(decision.pairStoreNumber, 's999998');
  assert.equal(decision.usedUrlStoreOnly, true);
});

test('item 20: blank URL store clears bind record and needs setup', function () {
  const Sync = loadUrlBindSyncModule();
  const storage = memoryStorage({
    [BIND_KEY]: JSON.stringify({ storeId: 'a17', storeNumber: 'a17' }),
  });
  const decision = Sync.reconcileBindRecordWithUrlStore(storage, {
    urlStoreId: '',
    urlStoreDisplay: '',
    needsSetup: true,
  });
  assert.equal(decision.clearedStaleRecord, true);
  assert.equal(storage.getItem(BIND_KEY), null);
  assert.equal(decision.needsSetup, true);
});
