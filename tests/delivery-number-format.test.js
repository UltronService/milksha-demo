'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const { CLOUD_DELIVERY_SAMPLE_TICKETS } = require('./fixtures/today-board-cloud-tickets.js');

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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

function loadTodayBoard() {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/board/today-board.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Board.TodayBoard;
}

test('store source accepts only four-digit strings', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('7112', 'store'), '7112');
  assert.equal(MB.normalizeBoardDisplayNumber('123', 'store'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('12345', 'store'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('12ab', 'store'), null);
});

test('milksha point: exactly 3 digits', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('091', 'point'), '091');
  assert.equal(MB.normalizeBoardDisplayNumber('578', 'point'), '578');
  assert.equal(MB.normalizeBoardDisplayNumber('0912', 'point'), null);
});

test('foodpanda requires hash and 4 digits on display', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  assert.equal(MB.normalizeBoardDisplayNumber('#6406', 'fp'), '#6406');
  assert.equal(MB.normalizeBoardDisplayNumber('6406', 'fp'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('#12345', 'fp'), null);
});

test('uber: 5 hex uppercase', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('c7458', 'uber'), 'C7458');
});

test('same digits on different sources both appear when each is valid for its source', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Store_OK', number: '1234' },
    { source_type: 'From_UberEat_OK', number: '1234A' },
  ]);
  assert.equal(parts.ready.length, 2);
  assert.ok(parts.ready.some((r) => r.sourceKey === 'store' && r.number === '1234'));
  assert.ok(parts.ready.some((r) => r.sourceKey === 'uber' && r.number === '1234A'));
});

test('invalid uber hex is dropped', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  assert.equal(MB.normalizeBoardDisplayNumber('ABCDEFG', 'uber'), null);
  const parts = MB.partitionNumberContent([
    { source_type: 'From_UberEat_OK', number: 'ABCDEFG' },
  ]);
  assert.equal(parts.ready.length, 0);
});

test('ticket without sourceType maps to store POS source_type', function () {
  const TB = loadTodayBoard();
  const nc = TB.ticketsToNumberContent([
    {
      no: '7112',
      status: 'ready',
      updatedAt: '2026-10-12T22:00:00.000Z',
    },
  ]);
  assert.equal(nc.length, 1);
  assert.equal(nc[0].source_type, 'From_Store_OK');
  assert.equal(nc[0].number, '7112');
});

test('cloud-shaped delivery sample tickets partition to four ready numbers', function () {
  const TB = loadTodayBoard();
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const nc = TB.ticketsToNumberContent(CLOUD_DELIVERY_SAMPLE_TICKETS);
  assert.equal(nc.length, 4);
  const parts = MB.partitionNumberContent(nc);
  assert.equal(parts.ready.length, 4);
  const nums = parts.ready.map((r) => r.number).sort();
  assert.equal(nums.join(','), '#6406,578,7112,C7458');
});
