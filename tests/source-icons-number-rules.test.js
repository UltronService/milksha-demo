'use strict';

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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'mockups', 'source-icons-data.js'), 'utf8'), sandbox);
  return { MB: sandbox.QMS.MilkshaBoard, mock: sandbox.MilkshaSourceIconMockup };
}

test('source-icons samples pass production normalizeBoardDisplayNumber', function () {
  const { MB, mock } = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  for (const row of mock.PREP_SAMPLES) {
    const n = MB.normalizeBoardDisplayNumber(row.number, row.source);
    assert.equal(n, row.number, 'prep ' + row.source + ' ' + row.number);
  }
  for (const row of mock.READY_SAMPLES) {
    const n = MB.normalizeBoardDisplayNumber(row.number, row.source);
    assert.equal(n, row.number, 'ready ' + row.source + ' ' + row.number);
  }
  const payload = mock.buildPayload();
  const parts = MB.partitionNumberContent(payload);
  assert.equal(parts.preparing.length, 10);
  assert.equal(parts.ready.length, 10);
});

test('production ready pulse scale defaults to 1.3 (請取餐 vs 準備中 motion spec)', function () {
  const { MB } = loadMilkshaBoard();
  assert.equal(MB.PAGE_SIZE, 10);
  assert.equal(MB.GRID_COLS, 2);
  assert.equal(MB.GRID_ROWS, 5);
});
