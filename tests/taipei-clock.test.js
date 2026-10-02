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

test('formatTaipeiClockHM uses Asia/Taipei when process TZ is UTC', function () {
  const prev = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const TB = loadTodayBoard();
    const utcDate = new Date('2026-10-02T10:49:00.000Z');
    const clock = TB.formatTaipeiClockHM(utcDate);
    const hm = TB.taipeiHourMinute(utcDate);
    assert.equal(hm.hour, 18);
    assert.equal(hm.minute, 49);
    assert.equal(clock, '18:49');
    assert.equal(TB.taipeiBusinessDate(utcDate), '2026-10-02');
  } finally {
    if (prev === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = prev;
    }
  }
});
