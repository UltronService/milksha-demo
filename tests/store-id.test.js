'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

/** @type {import('../scripts/store-id-lib.mjs')} */
let storeIdLib;

before(async function () {
  storeIdLib = await import('../scripts/store-id-lib.mjs');
});

function normalizeStoreId(id) {
  return storeIdLib.normalizeStoreId(id);
}

function isValidStoreIdFormat(id) {
  return storeIdLib.isValidStoreIdFormat(id);
}

test('normalizeStoreId lowercases and trims', function () {
  assert.equal(normalizeStoreId('  A17 '), 'a17');
  assert.equal(normalizeStoreId('C030020'), 'c030020');
});

test('accept letter+2 and letter+6 store ids', function () {
  assert.equal(isValidStoreIdFormat('a17'), true);
  assert.equal(isValidStoreIdFormat('a00'), true);
  assert.equal(isValidStoreIdFormat('a07'), true);
  assert.equal(isValidStoreIdFormat('x99'), true);
  assert.equal(isValidStoreIdFormat('c030020'), true);
  assert.equal(isValidStoreIdFormat('x123456'), true);
  assert.equal(isValidStoreIdFormat('A17'), true);
  assert.equal(normalizeStoreId('A17'), 'a17');
});

test('accept zz-qa test store ids', function () {
  assert.equal(isValidStoreIdFormat('zz-qa-store-a'), true);
  assert.equal(isValidStoreIdFormat('zz-qa-ci-store'), true);
  assert.equal(isValidStoreIdFormat('zz-deny-test'), true);
});

test('reject wrong digit counts after letter', function () {
  assert.equal(isValidStoreIdFormat('a1'), false);
  assert.equal(isValidStoreIdFormat('a123'), false);
  assert.equal(isValidStoreIdFormat('a1234'), false);
  assert.equal(isValidStoreIdFormat('a12345'), false);
  assert.equal(isValidStoreIdFormat('a1234567'), false);
});

test('reject non-store-id shapes', function () {
  assert.equal(isValidStoreIdFormat('17'), false);
  assert.equal(isValidStoreIdFormat('aa17'), false);
  assert.equal(isValidStoreIdFormat('017'), false);
  assert.equal(isValidStoreIdFormat('030020'), false);
  assert.equal(isValidStoreIdFormat(''), false);
});

test('a17 and a000017 are different ids (no padding equivalence)', function () {
  assert.equal(isValidStoreIdFormat('a17'), true);
  assert.equal(isValidStoreIdFormat('a000017'), true);
  assert.notEqual(normalizeStoreId('a17'), normalizeStoreId('a000017'));
});
