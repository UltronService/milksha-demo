'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeStorage() {
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
    key(i) {
      return [...map.keys()][i] || null;
    },
  };
}

function loadBoxSeenStack(sandbox) {
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.QMS = sandbox.QMS || {};
  const files = [
    'js/board/box-id.js',
    'js/board/box-seen-reported-store.js',
    'js/board/box-seen-clock.js',
    'js/board/box-seen-report.js',
  ];
  for (const f of files) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox);
  }
  return sandbox.QMS.Board;
}

test('resolveBoxId: URL boxId overrides localStorage', function () {
  const storage = makeStorage();
  storage.setItem('milksha:boxId', 'storedBoxId12');
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '?boxId=urlOverrideBoxId99' },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = 7; return a; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  assert.equal(Board.resolveBoxId().boxId, 'urlOverrideBoxId99');
});

test('resolveBoxId: reuses valid localStorage id', function () {
  const id = 'Aa1_-'.repeat(2) + 'abcd12';
  assert.ok(id.length >= 8 && id.length <= 64);
  const storage = makeStorage();
  storage.setItem('milksha:boxId', id);
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = 1; return a; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  assert.equal(Board.resolveBoxId().boxId, id);
});

test('resolveBoxId: generates 8-64 char id when missing', function () {
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    crypto: {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 17) % 256;
        return arr;
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const r = Board.resolveBoxId();
  assert.match(r.boxId, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(storage.getItem('milksha:boxId'), r.boxId);
});

test('resolveBoxId: rejects invalid URL override', function () {
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '?boxId=short' },
    crypto: { getRandomValues: (a) => { a.fill(3); return a; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const r = Board.resolveBoxId();
  assert.notEqual(r.boxId, 'short');
  assert.match(r.boxId, /^[A-Za-z0-9_-]{8,64}$/);
});

test('box seen clock: offset from serverNowMs, resync clears on failure', function () {
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ resyncIntervalMs: 600000, now: () => 5000 });
  clock.noteHeartbeat({ serverNowMs: 4000 });
  assert.equal(clock.getState().clockSynced, true);
  assert.equal(clock.getState().clockOffsetMs, 1000);
  assert.equal(clock.toCorrectedLocalMs(9000), 8000);
  clock.noteHeartbeat({});
  assert.equal(clock.getState().clockSynced, false);
  assert.equal(clock.getState().clockOffsetMs, null);
  assert.equal(clock.toCorrectedLocalMs(9000), null);
});

test('box seen report payload uses fixed field names', async function () {
  const sends = [];
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 10000 });
  clock.noteHeartbeat({ serverNowMs: 9000 });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'boxReporter01',
    transport: 'realtime',
    pageVersion: 'v-test',
    clock: clock,
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push(body);
        return { ok: true };
      },
    },
    now: () => 20000,
    isOffline: () => false,
  });
  rt.ingestTickets([
    { no: '1001', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'in-1' },
    { no: '2002', status: 'ready', sourceType: 'From_Store_OK' },
  ]);
  rt.notePaintedItemIds(['store:1001']);
  await rt.flushSend();
  assert.equal(sends.length, 1);
  const p = sends[0];
  assert.equal(p.storeId, 'zz-qa-store-a');
  assert.equal(p.boxId, 'boxReporter01');
  assert.equal(p.transport, 'realtime');
  assert.equal(p.pageVersion, 'v-test');
  assert.equal(p.clockSynced, true);
  assert.equal(p.clockOffsetMs, 1000);
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].ticketNo, '1001');
  assert.equal(p.items[0].intakeLogId, 'in-1');
  assert.equal(p.items[0].firstDataAtLocalMs, 20000);
  assert.equal(p.items[0].firstPaintAtLocalMs, 20000);
  assert.equal(p.items[0].firstDataAtCorrectedMs, 19000);
  assert.equal(p.items[0].firstPaintAtCorrectedMs, 19000);
});

test('reports each ticket once per board (persists in localStorage)', async function () {
  const sends = [];
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 1000 });
  const mk = () =>
    Board.createBoxSeenReporter({
      storeId: 'zz-qa-ci-store',
      boxId: 'boxOnceOnly1',
      transport: 'poll',
      pageVersion: 'p1',
      clock: clock,
      cloudApi: {
        boxSeenReport: async (body) => {
          sends.push(body);
          return { ok: true };
        },
      },
      now: () => 5000,
      isOffline: () => false,
    });
  const a = mk();
  a.ingestTickets([{ no: '88', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'x1' }]);
  a.notePaintedItemIds(['store:88']);
  await a.flushSend();
  const b = mk();
  b.ingestTickets([{ no: '88', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'x1' }]);
  b.notePaintedItemIds(['store:88']);
  await b.flushSend();
  assert.equal(sends.length, 1);
});

test('batch send at most once per 2 seconds', async function () {
  const sends = [];
  let now = 0;
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: (fn, ms) => {
      now += ms;
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => now });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'batchBoxId1',
    transport: 'poll',
    pageVersion: 'p1',
    clock: clock,
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push({ at: now, n: body.items.length });
        return { ok: true };
      },
    },
    now: () => now,
    isOffline: () => false,
    minSendGapMs: 2000,
  });
  rt.ingestTickets([
    { no: '1', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'a' },
    { no: '2', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'b' },
  ]);
  rt.notePaintedItemIds(['store:1']);
  await rt.flushSend();
  now = 100;
  rt.notePaintedItemIds(['store:2']);
  await rt.flushSend();
  assert.equal(sends.length, 1);
  now = 2500;
  await rt.flushSend();
  assert.equal(sends.length, 2);
});

test('drops after 3 failed retries', async function () {
  let attempts = 0;
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 1 });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'retryBox01',
    transport: 'poll',
    pageVersion: 'p1',
    clock: clock,
    cloudApi: {
      boxSeenReport: async () => {
        attempts += 1;
        const err = new Error('fail');
        err.status = 500;
        throw err;
      },
    },
    now: () => 1,
    isOffline: () => false,
    minSendGapMs: 0,
    maxRetries: 3,
  });
  rt.ingestTickets([{ no: '9', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'z' }]);
  rt.notePaintedItemIds(['store:9']);
  await rt.flushSend();
  await rt.flushSend();
  await rt.flushSend();
  assert.equal(attempts, 3);
  assert.equal(rt.getQueueDepth(), 0);
});

test('queue max 200 drops oldest', function () {
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 0 });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'queueBox01',
    transport: 'poll',
    pageVersion: 'p1',
    clock: clock,
    cloudApi: { boxSeenReport: async () => ({ ok: true }) },
    now: () => 0,
    isOffline: () => false,
    maxQueue: 200,
  });
  for (let i = 0; i < 205; i += 1) {
    rt._enqueueTestItem({ ticketNo: String(i), intakeLogId: 'i' + i });
  }
  assert.equal(rt.getQueueDepth(), 200);
  const oldest = rt._peekQueueTicketNos();
  assert.ok(!oldest.includes('0'));
  assert.ok(!oldest.includes('4'));
  assert.ok(oldest.includes('204'));
});

test('offline suppresses send', async function () {
  const sends = [];
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 1 });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'offlineBox1',
    transport: 'poll',
    pageVersion: 'p1',
    clock: clock,
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push(body);
        return { ok: true };
      },
    },
    now: () => 1,
    isOffline: () => true,
  });
  rt.ingestTickets([{ no: '1', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'a' }]);
  rt.notePaintedItemIds(['store:1']);
  await rt.flushSend();
  assert.equal(sends.length, 0);
  assert.ok(rt.getQueueDepth() > 0);
});
