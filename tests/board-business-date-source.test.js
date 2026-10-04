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

test('no board businessDate and unreadable HTTP Date does not resolve session day', function () {
  const TB = loadTodayBoard();
  TB.clearSessionBusinessDate();
  const r = TB.resolveSessionBusinessDate({
    boardBusinessDate: '',
    httpDateHeader: '',
    httpDateReadable: false,
  });
  assert.equal(r.ok, false);
  assert.equal(TB.hasSessionBusinessDate(), false);
});

test('shouldShowBootCache allows today cache when clock is after cloud updatedAt', function () {
  const TB = loadTodayBoard();
  const cacheUpdatedAt = '2026-10-03T08:00:00.000Z';
  const now = new Date('2026-10-03T12:00:00.000Z');
  const boxBd = TB.taipeiBusinessDate(now);
  assert.equal(
    TB.shouldShowBootCache(
      { businessDate: boxBd, boardUpdatedAt: cacheUpdatedAt },
      now,
    ),
    true,
  );
});

test('shouldShowBootCache rejects clock before cache updatedAt (1970)', function () {
  const TB = loadTodayBoard();
  const cacheUpdatedAt = '2026-10-03T08:00:00.000Z';
  const now = new Date('1970-01-01T00:00:00.000Z');
  assert.equal(
    TB.shouldShowBootCache(
      { businessDate: '2026-10-03', boardUpdatedAt: cacheUpdatedAt },
      now,
    ),
    false,
  );
});

test('shouldShowBootCache rejects firmware clock before cloud write (2021)', function () {
  const TB = loadTodayBoard();
  const cacheUpdatedAt = '2026-10-03T08:00:00.000Z';
  const now = new Date('2021-06-01T12:00:00.000Z');
  assert.equal(
    TB.shouldShowBootCache(
      { businessDate: '2026-10-03', boardUpdatedAt: cacheUpdatedAt },
      now,
    ),
    false,
  );
});

test('shouldShowBootCache rejects different business day without mutating cache', function () {
  const TB = loadTodayBoard();
  const cacheUpdatedAt = '2026-10-02T08:00:00.000Z';
  const now = new Date('2026-10-03T12:00:00.000Z');
  const boxBd = TB.taipeiBusinessDate(now);
  assert.notEqual(boxBd, '2026-10-02');
  assert.equal(
    TB.shouldShowBootCache(
      { businessDate: '2026-10-02', boardUpdatedAt: cacheUpdatedAt },
      now,
    ),
    false,
  );
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
