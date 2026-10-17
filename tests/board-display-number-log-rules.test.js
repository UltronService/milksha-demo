'use strict';

/**
 * Cloud board display normalization (controller + board shared rules).
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

test('Uber Eats: 4–6 alnum, uppercase', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('c7458', 'uber'), 'C7458');
  assert.equal(MB.normalizeBoardDisplayNumber('AB12', 'uber'), 'AB12');
  assert.equal(MB.normalizeBoardDisplayNumber('abc', 'uber'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('ABCDEFG', 'uber'), null);
});

test('Udd: 4–6 alnum uppercase', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('1234', 'udd'), '1234');
  assert.equal(MB.normalizeBoardDisplayNumber('ab12', 'udd'), 'AB12');
  assert.equal(MB.normalizeBoardDisplayNumber('abc', 'udd'), null);
});

test('Udd partition drops short invalid, accepts AB12', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Udd_OK', number: 'abc' },
    { source_type: 'From_Udd_Preparing', number: 'AB12' },
  ]);
  assert.equal(parts.ready.length, 0);
  assert.equal(parts.preparing.length, 1);
  assert.equal(parts.preparing[0].number, 'AB12');
});

test('foodpanda: 4–6 digits, hash stripped', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('#6405', 'fp'), '6405');
  assert.equal(MB.normalizeBoardDisplayNumber('6405', 'fp'), '6405');
  assert.equal(MB.normalizeBoardDisplayNumber('#640', 'fp'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('#1234567', 'fp'), null);
});

test('你訂 point: 3–4 digits with leading zeros', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('888', 'point'), '888');
  assert.equal(MB.normalizeBoardDisplayNumber('091', 'point'), '091');
  assert.equal(MB.normalizeBoardDisplayNumber('0912', 'point'), '0912');
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
  point: /^\d{3,4}$/,
  fp: /^\d{4,6}$/,
  uber: /^[0-9A-Z]{4,6}$/,
  udd: /^[0-9A-Z]{4,6}$/,
};

test('~1000 simulated numbers per source pass cloud display rules', function () {
  const MB = loadMilkshaBoard();
  const alnumPool = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const rng = mulberry32(20261017);
  const perSource = 1000;

  for (let i = 0; i < perSource; i += 1) {
    const storeNo = String(Math.floor(rng() * 10000)).padStart(4, '0');
    assert.equal(MB.normalizeBoardDisplayNumber(storeNo, 'store'), storeNo);
    assert.match(storeNo, CLOUD_SOURCE_PATTERNS.store);

    const pointLen = rng() < 0.5 ? 3 : 4;
    const pointNo = String(Math.floor(rng() * Math.pow(10, pointLen))).padStart(pointLen, '0');
    assert.equal(MB.normalizeBoardDisplayNumber(pointNo, 'point'), pointNo);
    assert.match(pointNo, CLOUD_SOURCE_PATTERNS.point);

    let uber = '';
    const uberLen = 4 + Math.floor(rng() * 3);
    for (let h = 0; h < uberLen; h += 1) {
      uber += alnumPool.charAt(Math.floor(rng() * alnumPool.length));
    }
    const uberNorm = MB.normalizeBoardDisplayNumber(uber.toLowerCase(), 'uber');
    assert.match(uberNorm, CLOUD_SOURCE_PATTERNS.uber);

    let udd = '';
    const uddLen = 4 + Math.floor(rng() * 3);
    for (let u = 0; u < uddLen; u += 1) {
      udd += alnumPool.charAt(Math.floor(rng() * alnumPool.length));
    }
    const uddNorm = MB.normalizeBoardDisplayNumber(udd.toLowerCase(), 'udd');
    assert.match(uddNorm, CLOUD_SOURCE_PATTERNS.udd);

    const fpLen = 4 + Math.floor(rng() * 3);
    const fpNo = String(Math.floor(rng() * Math.pow(10, fpLen))).padStart(fpLen, '0');
    const fpNorm = MB.normalizeBoardDisplayNumber('#' + fpNo, 'fp');
    assert.match(fpNorm, CLOUD_SOURCE_PATTERNS.fp);
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
