'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

const BACKEND_ITEM_TIME_KEYS = [
  'firstDataAtLocalMs',
  'firstPaintAtLocalMs',
  'firstDataAtCorrectedMs',
  'firstPaintAtCorrectedMs',
];

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

function loadReporterStack(sandbox) {
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

test('contract module lists backend #45 item time field names (with At)', function () {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'box-seen-payload-contract.js'), 'utf8'),
    sandbox,
  );
  assert.deepEqual(
    Array.from(sandbox.QMS.Board.BOX_SEEN_ITEM_TIME_FIELD_NAMES),
    BACKEND_ITEM_TIME_KEYS,
  );
});

test('boxSeenReport sent item keys use backend time field names exactly', async function () {
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
  const Board = loadReporterStack(sandbox);
  const clock = Board.createBoxSeenClock({ now: () => 10000 });
  clock.noteHeartbeat({ serverNowMs: 9000 });
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'payloadKeys1',
    transport: 'poll',
    pageVersion: 'p1',
    clock: clock,
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push(body);
        return { ok: true };
      },
    },
    now: () => 20000,
    isOffline: () => false,
    minSendGapMs: 0,
  });
  rt.ingestTickets([
    { no: '1001', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'in-1' },
  ]);
  rt.notePaintedItemIds(['store:1001']);
  await rt.flushSend();
  assert.equal(sends.length, 1);
  const item = sends[0].items[0];
  for (const key of BACKEND_ITEM_TIME_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(item, key), 'missing ' + key);
  }
  for (const bad of ['firstDataLocalMs', 'firstPaintLocalMs', 'firstDataCorrectedMs', 'firstPaintCorrectedMs']) {
    assert.equal(Object.prototype.hasOwnProperty.call(item, bad), false, 'must not use renamed ' + bad);
  }
  assert.equal(item.firstDataAtLocalMs, 20000);
  assert.equal(item.firstPaintAtLocalMs, 20000);
  assert.equal(item.firstDataAtCorrectedMs, 19000);
  assert.equal(item.firstPaintAtCorrectedMs, 19000);
});
