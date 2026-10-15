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

test('widest compliant stress payload stays inside cream bands @ 64px', async function () {
  const { runCreamColumnBoundsCheck, buildWorstCaseStressPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildWorstCaseStressPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});
