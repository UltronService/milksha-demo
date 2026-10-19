'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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

test('item 1: no store param needs setup', function () {
  const H = loadHomeBoardStore();
  assert.equal(H.needsStoreSetup(''), true);
  assert.equal(H.needsStoreSetup('?mode=cloud'), true);
  const r1 = H.resolveStoreFromUrlParams('');
  assert.equal(r1.status, 'setup');
  assert.equal(r1.reason, 'missing');
});

test('item 2: empty store= needs setup', function () {
  const H = loadHomeBoardStore();
  assert.equal(H.needsStoreSetup('?store='), true);
  const r2 = H.resolveStoreFromUrlParams('?store=');
  assert.equal(r2.status, 'setup');
  assert.equal(r2.reason, 'empty');
});

test('item 3: whitespace-only store= needs setup', function () {
  const H = loadHomeBoardStore();
  assert.equal(H.needsStoreSetup('?store=%20%20'), true);
  const r3 = H.resolveStoreFromUrlParams('?store=%20%20');
  assert.equal(r3.status, 'setup');
  assert.equal(r3.reason, 'empty');
});

test('item 4: invalid store formats need setup', function () {
  const H = loadHomeBoardStore();
  for (const q of ['?store=abc', '?store=a1', '?store=A170000', '?store=a17x']) {
    assert.equal(H.needsStoreSetup(q), true, q);
    assert.equal(H.resolveStoreFromUrlParams(q).reason, 'invalid', q);
  }
});

test('item 5: zz-qa-store-a is ready', function () {
  const H = loadHomeBoardStore();
  assert.equal(H.needsStoreSetup('?store=zz-qa-store-a'), false);
  const r5 = H.resolveStoreFromUrlParams('?store=zz-qa-store-a');
  assert.equal(r5.status, 'ready');
  assert.equal(r5.storeId, 'zz-qa-store-a');
});

test('item 6: valid-format real stores URL decision only (no cloud)', function () {
  const H = loadHomeBoardStore();
  const rA17 = H.resolveStoreFromUrlParams('?store=a17');
  assert.equal(rA17.status, 'ready');
  assert.equal(rA17.storeId, 'a17');
  const rC = H.resolveStoreFromUrlParams('?store=c030020');
  assert.equal(rC.status, 'ready');
  assert.equal(rC.storeId, 'c030020');
});

test('setup message is 請設定店編號', function () {
  const H = loadHomeBoardStore();
  assert.equal(H.SETUP_MESSAGE, '請設定店編號');
});
