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
  const code = fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'milksha-board.js' });
  return sandbox.QMS.MilkshaBoard;
}

function loadTodayBoard() {
  const sandbox = { globalThis: {}, Intl: Intl, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard;
}

test('partition mirrors POS list including ready to preparing', function () {
  const MB = loadMilkshaBoard();
  const readyOnly = MB.partitionNumberContent([
    { source_type: 'From_Store_OK', number: '0042' },
  ]);
  assert.equal(JSON.stringify(readyOnly.ready.map((r) => r.number)), '["0042"]');
  assert.equal(readyOnly.preparing.length, 0);

  const backToPrep = MB.partitionNumberContent([
    { source_type: 'From_Store_Preparing', number: '0042' },
  ]);
  assert.equal(backToPrep.ready.length, 0);
  assert.equal(JSON.stringify(backToPrep.preparing.map((r) => r.number)), '["0042"]');
});

test('removed number reappearing in POS list is treated as present', function () {
  const MB = loadMilkshaBoard();
  const empty = MB.partitionNumberContent([]);
  assert.equal(MB.isBoardFullyEmpty(empty.ready, empty.preparing), true);

  const again = MB.partitionNumberContent([{ source_type: 'From_Store_OK', number: '9001' }]);
  assert.equal(JSON.stringify(again.ready.map((r) => r.number)), '["9001"]');
  assert.equal(MB.isBoardFullyEmpty(again.ready, again.preparing), false);
});

test('today_board tickets round-trip preserves status from POS rows', function () {
  const TB = loadTodayBoard();
  const nc = [
    { source_type: 'From_Store_Preparing', number: '11' },
    { source_type: 'From_Store_OK', number: '22' },
  ];
  const tickets = TB.numberContentToTickets(nc);
  assert.equal(
    JSON.stringify(tickets.map((t) => t.no + ':' + t.status)),
    '["11:preparing","22:ready"]',
  );
  const back = TB.ticketsToNumberContent(tickets);
  assert.equal(JSON.stringify(back), JSON.stringify(nc));
});
