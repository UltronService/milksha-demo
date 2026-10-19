'use strict';

/**
 * Cloud board display normalization (controller + board shared rules, v2).
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
    Intl: Intl,
    requestAnimationFrame: function (fn) {
      fn();
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

test('store: arbitrary string preserved up to 6 units', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('8888', 'store'), '8888');
  assert.equal(MB.normalizeBoardDisplayNumber('123', 'store'), '123');
  assert.equal(MB.normalizeBoardDisplayNumber('1234567', 'store'), '123456');
});

test('Uber Eats: case preserved', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('c7458', 'uber'), 'c7458');
  assert.equal(MB.normalizeBoardDisplayNumber('AB12C', 'uber'), 'AB12C');
  assert.equal(MB.normalizeBoardDisplayNumber('AB12G', 'uber'), 'AB12G');
});

test('Udd: accepts any string', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('1234', 'udd'), '1234');
  assert.equal(MB.normalizeBoardDisplayNumber('ab12', 'udd'), 'ab12');
  assert.equal(MB.normalizeBoardDisplayNumber('abc', 'abc'), null);
});

test('Udd partition keeps arbitrary strings', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Udd_OK', number: 'abc' },
    { source_type: 'From_Udd_Preparing', number: '1234' },
  ]);
  assert.equal(parts.ready.length, 1);
  assert.equal(parts.preparing.length, 1);
  assert.equal(parts.ready[0].number, 'abc');
});

test('foodpanda: hash preserved', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('#6405', 'fp'), '#6405');
  assert.equal(MB.normalizeBoardDisplayNumber('6405', 'fp'), '6405');
  assert.equal(MB.normalizeBoardDisplayNumber('#640', 'fp'), '#640');
});

test('迷客夏 point: leading zeros preserved', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('888', 'point'), '888');
  assert.equal(MB.normalizeBoardDisplayNumber('091', 'point'), '091');
  assert.equal(MB.normalizeBoardDisplayNumber('0912', 'point'), '0912');
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

test('~1000 simulated strings per source pass display truncation', function () {
  const MB = loadMilkshaBoard();
  const rng = mulberry32(20261019);
  const perSource = 200;

  for (let i = 0; i < perSource; i += 1) {
    const storeNo = 'S' + String(Math.floor(rng() * 1e8));
    const storeNorm = MB.normalizeBoardDisplayNumber(storeNo, 'store');
    assert.ok(storeNorm.length <= 6);

    const pointNo = 'P' + String(Math.floor(rng() * 1e6));
    assert.ok(MB.normalizeBoardDisplayNumber(pointNo, 'point').length <= 6);

    const uber = 'U' + String(Math.floor(rng() * 1e8));
    assert.ok(MB.normalizeBoardDisplayNumber(uber, 'uber').length <= 6);

    const uddNo = 'D' + String(Math.floor(rng() * 1e6));
    assert.ok(MB.normalizeBoardDisplayNumber(uddNo, 'udd').length <= 6);

    const fpNo = '#' + String(Math.floor(rng() * 1e8));
    assert.ok(MB.normalizeBoardDisplayNumber(fpNo, 'fp').length <= 6);
  }
});

test('duplicate is same source + trimmed original (case sensitive)', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_UberEat_OK', number: 'DDDDD' },
    { source_type: 'From_UberEat_OK', number: 'ddddd' },
    { source_type: 'From_Store_OK', number: '8888' },
    { source_type: 'From_UberEat_OK', number: 'BBBBB' },
  ]);
  assert.equal(parts.ready.length, 4);
});

test('widest stress payload stays inside cream bands @ 70px', async function () {
  const { runCreamColumnBoundsCheck, buildWorstCaseStressPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildWorstCaseStressPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});
