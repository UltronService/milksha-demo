'use strict';

/**
 * Approved production log display rules (replaces legacy 3–6 / optional # rules).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadMilkshaBoard() {
  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    setInterval: setInterval,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Promise: Promise,
    Error: Error,
    Set: Set,
    requestAnimationFrame: function (fn) {
      fn();
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

test('store: exactly 4 digits', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('8888', 'store'), '8888');
  assert.equal(MB.normalizeBoardDisplayNumber('123', 'store'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('12345', 'store'), null);
});

test('Uber Eats: exactly 5 hex digits, uppercase', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('ddddd', 'uber'), 'DDDDD');
  assert.equal(MB.normalizeBoardDisplayNumber('A2C9E', 'uber'), 'A2C9E');
  assert.equal(MB.normalizeBoardDisplayNumber('BFBEF', 'uber'), 'BFBEF');
  assert.equal(MB.normalizeBoardDisplayNumber('GGGGG', 'uber'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('A2C9', 'uber'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('A2C9EF', 'uber'), null);
});

test('Udd: same as Uber Eats — exactly 5 hex, uppercase normalize', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('bfbef', 'udd'), 'BFBEF');
  assert.equal(MB.normalizeBoardDisplayNumber('BFBEF', 'udd'), 'BFBEF');
  assert.equal(MB.normalizeBoardDisplayNumber('AB12', 'udd'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('GGGGG', 'udd'), null);
});

test('Udd partition drops AB12 and keeps lowercase hex normalized', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Udd_OK', number: 'AB12' },
    { source_type: 'From_Udd_Preparing', number: 'bfbef' },
  ]);
  assert.equal(parts.ready.length, 0);
  assert.equal(parts.preparing.length, 1);
  assert.equal(parts.preparing[0].number, 'BFBEF');
  assert.equal(parts.preparing[0].sourceKey, 'udd');
});

test('foodpanda: hash + exactly 4 digits only', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('#6405', 'fp'), '#6405');
  assert.equal(MB.normalizeBoardDisplayNumber('#8888', 'fp'), '#8888');
  assert.equal(MB.normalizeBoardDisplayNumber('6405', 'fp'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('#640', 'fp'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('#64055', 'fp'), null);
});

test('你訂 point: exactly 3 digits with leading zeros', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('888', 'point'), '888');
  assert.equal(MB.normalizeBoardDisplayNumber('091', 'point'), '091');
  assert.equal(MB.normalizeBoardDisplayNumber('578', 'point'), '578');
  assert.equal(MB.normalizeBoardDisplayNumber('8888', 'point'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('88', 'point'), null);
});

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOUD_SOURCE_PATTERNS = {
  store: /^\d{4}$/,
  point: /^\d{3}$/,
  fp: /^#\d{4}$/,
  uber: /^[0-9A-F]{5}$/,
  udd: /^[0-9A-F]{5}$/,
};

test('~1000 simulated numbers per source pass cloud display rules', function () {
  const MB = loadMilkshaBoard();
  const hexPool = '0123456789ABCDEF';
  const rng = mulberry32(20261015);
  const perSource = 1000;

  for (let i = 0; i < perSource; i += 1) {
    const storeNo = String(Math.floor(rng() * 10000)).padStart(4, '0');
    assert.equal(MB.normalizeBoardDisplayNumber(storeNo, 'store'), storeNo);
    assert.match(storeNo, CLOUD_SOURCE_PATTERNS.store);

    const pointNo = String(Math.floor(rng() * 1000)).padStart(3, '0');
    assert.equal(MB.normalizeBoardDisplayNumber(pointNo, 'point'), pointNo);
    assert.match(pointNo, CLOUD_SOURCE_PATTERNS.point);

    let uber = '';
    for (let h = 0; h < 5; h += 1) {
      uber += hexPool.charAt(Math.floor(rng() * hexPool.length));
    }
    const uberNorm = MB.normalizeBoardDisplayNumber(uber.toLowerCase(), 'uber');
    assert.match(uberNorm, CLOUD_SOURCE_PATTERNS.uber);

    let udd = '';
    for (let h = 0; h < 5; h += 1) {
      udd += hexPool.charAt(Math.floor(rng() * hexPool.length));
    }
    const uddNorm = MB.normalizeBoardDisplayNumber(udd.toLowerCase(), 'udd');
    assert.match(uddNorm, CLOUD_SOURCE_PATTERNS.udd);

    const fpNo = '#' + String(Math.floor(rng() * 10000)).padStart(4, '0');
    assert.equal(MB.normalizeBoardDisplayNumber(fpNo, 'fp'), fpNo);
    assert.match(fpNo, CLOUD_SOURCE_PATTERNS.fp);
  }
});

test('duplicate is same source + normalized number only', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_UberEat_OK', number: 'DDDDD' },
    { source_type: 'From_UberEat_OK', number: 'ddddd' },
    { source_type: 'From_Store_OK', number: '8888' },
    { source_type: 'From_UberEat_OK', number: 'BBBBB' },
  ]);
  assert.equal(parts.ready.length, 3);
  assert.ok(parts.ready.some((r) => r.id === 'uber:DDDDD'));
  assert.ok(parts.ready.some((r) => r.id === 'store:8888'));
  assert.ok(parts.ready.some((r) => r.id === 'uber:BBBBB'));
});

test('widest compliant stress payload stays inside cream bands @ 70px', async function () {
  const { runCreamColumnBoundsCheck, buildWorstCaseStressPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildWorstCaseStressPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});
