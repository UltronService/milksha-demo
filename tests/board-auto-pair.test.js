'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAutoPair() {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl, crypto: { randomUUID: () => 'test-machine-uuid' } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.AutoPair;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
}

test('buildBoardBindRequest has brand store machine only', function () {
  const AP = loadAutoPair();
  const built = AP.buildBoardBindRequest({
    brandId: 'milksha',
    storeId: 'zz-qa-store-a',
    machineId: 'm-1',
    clientIp: '1.2.3.4',
  });
  assert.equal(built.ok, true);
  assert.equal(built.body.brandId, 'milksha');
  assert.equal(built.body.storeId, 'zz-qa-store-a');
  assert.equal(built.body.machineId, 'm-1');
  assert.equal(built.body.clientIp, undefined);
});

test('shouldSendBoardBind is false after bind record saved', function () {
  const AP = loadAutoPair();
  const local = memoryStorage();
  assert.equal(AP.shouldSendBoardBind(local, 'milksha', 'zz-qa-store-a'), true);
  AP.writeBindRecord(local, {
    brandId: 'milksha',
    storeId: 'zz-qa-store-a',
    machineId: 'm-1',
    storeName: 'QA A',
    storeNumber: 'zz-qa-store-a',
  });
  assert.equal(AP.shouldSendBoardBind(local, 'milksha', 'zz-qa-store-a'), false);
});

test('formatBindHintText uses Taipei clock without seconds', function () {
  const AP = loadAutoPair();
  const utc = new Date('2026-10-17T06:30:45.000Z');
  const line = AP.formatBindHintText({
    storeName: '測試門市',
    storeNumber: 's120030',
    now: utc,
  });
  assert.match(line, /^已綁定：測試門市s120030 2026-10-17 \d{2}:\d{2}$/);
  assert.doesNotMatch(line, /:\d{2}:\d{2}/);
});

test('formatBindHintText omits time before 2026', function () {
  const AP = loadAutoPair();
  const utc = new Date('2025-06-15T04:00:00.000Z');
  const line = AP.formatBindHintText({
    storeName: '舊機',
    storeNumber: 's120030',
    now: utc,
  });
  assert.equal(line, '已綁定：舊機s120030');
});

test('hint session reload keeps visible; new session hides', function () {
  const AP = loadAutoPair();
  const local = memoryStorage();
  const session = memoryStorage();
  AP.markBindHintSessionActive(local, session);
  assert.equal(AP.shouldShowBindHint(local, session), true);
  const session2 = memoryStorage();
  assert.equal(AP.shouldShowBindHint(local, session2), false);
});

test('formatBindHintText rolls Taipei calendar date after 23:59', function () {
  const AP = loadAutoPair();
  const beforeMidnight = new Date('2026-10-17T15:59:30.000Z');
  const afterMidnight = new Date('2026-10-17T16:00:30.000Z');
  const lineBefore = AP.formatBindHintText({
    storeName: '夜',
    storeNumber: 's1',
    now: beforeMidnight,
  });
  const lineAfter = AP.formatBindHintText({
    storeName: '夜',
    storeNumber: 's1',
    now: afterMidnight,
  });
  assert.match(lineBefore, /2026-10-17 23:59$/);
  assert.match(lineAfter, /2026-10-18 00:00$/);
});

test('msUntilNextTaipeiMinute aligns before minute rollover', function () {
  const AP = loadAutoPair();
  const at59 = new Date('2026-10-17T06:29:59.500Z');
  const wait = AP.msUntilNextTaipeiMinute(at59);
  assert.ok(wait > 0 && wait <= 1500);
});

test('home board index wires auto-pair scripts', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /board-auto-pair\.js\?v=/);
  assert.match(html, /board-bind-api\.js\?v=/);
});
