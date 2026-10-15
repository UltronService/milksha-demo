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
  return sandbox.QMS.MilkshaBoard;
}

function loadTodayBoard() {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Board.TodayBoard;
}

/** QA live2 shape: today_board.tickets[] with sourceType verbatim from cloud */
const QA_LIVE2_TICKETS = [
  { no: '1234', status: 'ready', updatedAt: '2026-10-13T10:00:00.000Z' },
  {
    no: '12340',
    status: 'ready',
    sourceType: 'From_UberEats_OK',
    updatedAt: '2026-10-13T10:00:01.000Z',
  },
];

test('QA live2: unrecognized sourceType shows 3–6 alnum code A1B', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_CustomPartner_OK', number: 'A1B' },
  ]);
  assert.equal(parts.ready.length, 1);
  assert.equal(parts.ready[0].number, 'A1B');
});

test('QA live2: store 1234 without sourceType and UberEats 12340 both on board', function () {
  const TB = loadTodayBoard();
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const nc = TB.ticketsToNumberContent(QA_LIVE2_TICKETS);
  assert.equal(nc.length, 2);
  const parts = MB.partitionNumberContent(nc);
  assert.equal(parts.ready.length, 2);
  assert.ok(parts.ready.some((r) => r.sourceKey === 'store' && r.number === '1234'));
  assert.ok(parts.ready.some((r) => r.sourceKey === 'uber' && r.number === '12340'));
});
