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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard;
}

test('business date before 03:00 Taipei uses previous calendar day', function () {
  const TB = loadTodayBoard();
  const d = new Date('2026-10-02T18:59:00.000Z');
  assert.equal(TB.taipeiCalendarDate(d), '2026-10-03');
  assert.equal(TB.taipeiBusinessDate(d), '2026-10-02');
});

test('business date at 03:00 Taipei rolls forward', function () {
  const TB = loadTodayBoard();
  const d = new Date('2026-10-02T19:00:00.000Z');
  assert.equal(TB.taipeiBusinessDate(d), '2026-10-03');
});

test('isCurrentBusinessDate rejects yesterday board', function () {
  const TB = loadTodayBoard();
  const morning = new Date('2026-10-03T01:00:00.000Z');
  assert.equal(TB.isCurrentBusinessDate('2026-10-02', morning), false);
  assert.equal(TB.isCurrentBusinessDate('2026-10-03', morning), true);
});
