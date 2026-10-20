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
    'js/board/box-seen-payload-contract.js',
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

test('boxId stable after simulated STB page reopen (localStorage survives)', function () {
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    crypto: { getRandomValues: (a) => { a.fill(9); return a; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const first = Board.resolveBoxId();
  assert.equal(first.source, 'generated');
  const second = Board.resolveBoxId();
  assert.equal(second.source, 'storage');
  assert.equal(second.boxId, first.boxId);
});

test('reported ticket store caps at 500 per storeId and drops oldest', function () {
  const storage = makeStorage();
  const sandbox = { globalThis: {}, localStorage: storage, location: { search: '' } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const ticketStore = Board.createReportedTicketStore({
    storage: storage,
    storeId: 'zz-qa-store-a',
    maxEntries: 500,
  });
  for (let i = 0; i < 501; i += 1) {
    ticketStore.markReported(String(i).padStart(4, '0'), 'intake-' + i);
  }
  assert.equal(ticketStore.count(), 500);
  assert.equal(ticketStore.hasReported('0000', 'intake-0'), false);
  assert.equal(ticketStore.hasReported('0500', 'intake-500'), true);
});

test('STB reload does not re-report storeId+ticketNo+intakeLogId', async function () {
  const sends = [];
  const storage = makeStorage();
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    crypto: { getRandomValues: (a) => { a.fill(4); return a; } },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadBoxSeenStack(sandbox);
  const boxId = Board.resolveBoxId().boxId;
  const clock = Board.createBoxSeenClock({ now: () => 1000 });
  const mkReporter = () =>
    Board.createBoxSeenReporter({
      storeId: 'zz-qa-ci-store',
      boxId: Board.resolveBoxId().boxId,
      transport: 'poll',
      pageVersion: 'p1',
      clock: clock,
      cloudApi: {
        boxSeenReport: async (body) => {
          sends.push(body);
          return { ok: true };
        },
      },
      now: () => 2000,
      isOffline: () => false,
      minSendGapMs: 0,
    });
  const sessionA = mkReporter();
  sessionA.ingestTickets([
    { no: '1234', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'in-reload-1' },
  ]);
  sessionA.notePaintedItemIds(['store:1234']);
  await sessionA.flushSend();
  assert.equal(boxId, Board.resolveBoxId().boxId);
  const sessionB = mkReporter();
  sessionB.ingestTickets([
    { no: '1234', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'in-reload-1' },
  ]);
  sessionB.notePaintedItemIds(['store:1234']);
  await sessionB.flushSend();
  assert.equal(sends.length, 1);
  assert.equal(sends[0].boxId, boxId);
});
