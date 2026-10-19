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

test('normalizeStoreId lowercases and trims', function () {
  const S = loadStoreId();
  assert.equal(S.normalizeStoreId('  A17 '), 'a17');
  assert.equal(S.normalizeStoreId('C030020'), 'c030020');
});

test('accept letter+2 and letter+6 store ids', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('a17'), true);
  assert.equal(S.isValidStoreIdFormat('a00'), true);
  assert.equal(S.isValidStoreIdFormat('c030020'), true);
  assert.equal(S.isValidStoreIdFormat('x123456'), true);
  assert.equal(S.isValidStoreIdFormat('A17'), true);
});

test('accept zz-qa test store ids', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('zz-qa-store-a'), true);
  assert.equal(S.isValidStoreIdFormat('zz-qa-ci-store'), true);
  assert.equal(S.isValidStoreIdFormat('zz-deny-test'), true);
});

test('reject wrong digit counts and non-store shapes', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('abc'), false);
  assert.equal(S.isValidStoreIdFormat('a1'), false);
  assert.equal(S.isValidStoreIdFormat('a17x'), false);
  assert.equal(S.isValidStoreIdFormat('aa17'), false);
  assert.equal(S.isValidStoreIdFormat('17'), false);
});

test('a17 and a000017 are different ids (no padding equivalence)', function () {
  const S = loadStoreId();
  assert.equal(S.isValidStoreIdFormat('a17'), true);
  assert.equal(S.isValidStoreIdFormat('a000017'), true);
  assert.notEqual(S.normalizeStoreId('a17'), S.normalizeStoreId('a000017'));
});
