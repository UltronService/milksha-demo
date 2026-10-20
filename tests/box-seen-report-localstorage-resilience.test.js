'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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

test('corrupt reported-store JSON does not crash reporter; can still send', async function () {
  const sends = [];
  const storage = {
    _m: new Map([['milksha:box-seen-reported:v2:zz-qa-store-a', '{not-json}']]),
    getItem(k) {
      return this._m.has(k) ? this._m.get(k) : null;
    },
    setItem(k, v) {
      this._m.set(k, String(v));
    },
    removeItem(k) {
      this._m.delete(k);
    },
    key(i) {
      return [...this._m.keys()][i] || null;
    },
    get length() {
      return this._m.size;
    },
  };
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    crypto: { getRandomValues: (a) => { a.fill(2); return a; } },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadReporterStack(sandbox);
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-store-a',
    boxId: 'resilient01',
    transport: 'poll',
    pageVersion: 'p1',
    clock: Board.createBoxSeenClock({ now: () => 1 }),
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push(body);
        return { ok: true };
      },
    },
    now: () => 2,
    isOffline: () => false,
    minSendGapMs: 0,
  });
  rt.ingestTickets([
    { no: '42', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'ok-1' },
  ]);
  rt.notePaintedItemIds(['store:42']);
  await rt.flushSend();
  assert.equal(sends.length, 1);
});

test('full localStorage on save still allows report send', async function () {
  const sends = [];
  let quota = false;
  const storage = {
    _m: new Map(),
    getItem(k) {
      return this._m.has(k) ? this._m.get(k) : null;
    },
    setItem(k, v) {
      if (quota && String(k).indexOf('box-seen-reported') >= 0) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      this._m.set(k, String(v));
    },
    removeItem(k) {
      this._m.delete(k);
    },
    key(i) {
      return [...this._m.keys()][i] || null;
    },
    get length() {
      return this._m.size;
    },
  };
  const sandbox = {
    globalThis: {},
    localStorage: storage,
    location: { search: '' },
    Date: Date,
    crypto: { getRandomValues: (a) => { a.fill(1); return a; } },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const Board = loadReporterStack(sandbox);
  quota = true;
  const rt = Board.createBoxSeenReporter({
    storeId: 'zz-qa-ci-store',
    boxId: 'resilient02',
    transport: 'poll',
    pageVersion: 'p1',
    clock: Board.createBoxSeenClock({ now: () => 1 }),
    cloudApi: {
      boxSeenReport: async (body) => {
        sends.push(body);
        return { ok: true };
      },
    },
    now: () => 2,
    isOffline: () => false,
    minSendGapMs: 0,
  });
  rt.ingestTickets([
    { no: '99', status: 'ready', sourceType: 'From_Store_OK', firstIntakeLogId: 'ok-2' },
  ]);
  rt.notePaintedItemIds(['store:99']);
  await rt.flushSend();
  assert.equal(sends.length, 1);
});
