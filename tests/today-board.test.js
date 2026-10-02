'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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

test('tickets round-trip to number_content', function () {
  const TB = loadTodayBoard();
  const tickets = [
    { no: '1001', status: 'preparing', updatedAt: '2026-10-02T00:00:00.000Z' },
    { no: '1002', status: 'ready', updatedAt: '2026-10-02T00:00:01.000Z' },
  ];
  const nc = TB.ticketsToNumberContent(tickets);
  assert.equal(nc.length, 2);
  assert.equal(nc[0].number, '1001');
  assert.equal(nc[1].source_type, 'From_Store_OK');
  const back = TB.numberContentToTickets(nc);
  assert.equal(back[0].no, '1001');
  assert.equal(back[1].status, 'ready');
});

test('normalizeTodayBoard rejects bad seq', function () {
  const TB = loadTodayBoard();
  const bad = TB.normalizeTodayBoard({ seq: 'x', tickets: [] });
  assert.equal(bad.ok, false);
});
