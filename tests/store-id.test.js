'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadStoreId() {
  const sandbox = { globalThis: {}, QMS: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'store-id.js'), 'utf8'), sandbox);
  return sandbox.QMS.StoreId;
}

test('store id format validation matches home board rules', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('c030020'), true);
  assert.equal(S.isValidStoreIdFormat('zz-qa-store-a'), true);
  assert.equal(S.isValidStoreIdFormat('zz-deny-test'), true);
  assert.equal(S.isValidStoreIdFormat('a123456'), true);
  assert.equal(S.isValidStoreIdFormat('C030020'), false);
  assert.equal(S.isValidStoreIdFormat('zz-qa-UPPER'), false);
  assert.equal(S.isValidStoreIdFormat('abc'), false);
  assert.equal(S.isValidStoreIdFormat('a1'), false);
  assert.equal(S.isValidStoreIdFormat('A170000'), false);
  assert.equal(S.isValidStoreIdFormat('a17x'), false);
});

test('literal test store a17 is valid; short a1 and a18 are not', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('a17'), true);
  assert.equal(S.isValidStoreIdFormat('a1'), false);
  assert.equal(S.isValidStoreIdFormat('a18'), false);
});
