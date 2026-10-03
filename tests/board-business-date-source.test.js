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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard;
}

function loadChimePolicy(getBusinessDate) {
  const sandbox = { globalThis: {}, Set: Set };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/chime-policy.js'), 'utf8'), sandbox);
  return sandbox.QMS.Receiver.createBoardChimePolicy({
    getBusinessDate: getBusinessDate,
    newlyReadyIds: function (prev, next) {
      const out = [];
      next.forEach(function (id) {
        if (!prev.has(id)) {
          out.push(id);
        }
      });
      return out;
    },
  });
}

test('resolveSessionBusinessDate prefers board.businessDate', function () {
  const TB = loadTodayBoard();
  TB.clearSessionBusinessDate();
  const r = TB.resolveSessionBusinessDate({
    boardBusinessDate: '2026-10-03',
    httpDateHeader: 'Fri, 03 Oct 2026 01:00:00 GMT',
    httpDateReadable: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.businessDate, '2026-10-03');
  assert.equal(r.source, 'board');
});

test('resolveSessionBusinessDate uses HTTP Date when board field missing', function () {
  const TB = loadTodayBoard();
  const r = TB.resolveSessionBusinessDate({
    boardBusinessDate: '',
    httpDateHeader: 'Fri, 03 Oct 2026 01:00:00 GMT',
    httpDateReadable: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.businessDate, '2026-10-03');
  assert.equal(r.source, 'http_date');
});

test('HTTP Date before 03:00 Taipei rolls business day back', function () {
  const TB = loadTodayBoard();
  const r = TB.resolveSessionBusinessDate({
    boardBusinessDate: '',
    httpDateHeader: 'Thu, 02 Oct 2026 18:30:00 GMT',
    httpDateReadable: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.businessDate, '2026-10-02');
});

test('no board businessDate and unreadable HTTP Date falls back to box clock', function () {
  const TB = loadTodayBoard();
  TB.clearSessionBusinessDate();
  const r = TB.resolveSessionBusinessDate({
    boardBusinessDate: '',
    httpDateHeader: '',
    httpDateReadable: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'box_clock');
  assert.match(r.businessDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('isCurrentBusinessDate uses session not device clock', function () {
  const TB = loadTodayBoard();
  TB.clearSessionBusinessDate();
  TB.setSessionBusinessDate('2026-10-02');
  assert.equal(TB.isCurrentBusinessDate('2026-10-02'), true);
  assert.equal(TB.isCurrentBusinessDate('2026-10-03'), false);
});

test('chime policy does not ring without session business date', function () {
  const policy = loadChimePolicy(function () {
    return '';
  });
  const prev = new Set();
  const next = new Set(['store:1']);
  assert.equal(policy.pickRingIds(prev, next, {}).length, 0);
});
