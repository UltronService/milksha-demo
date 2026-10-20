'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STORE_ID = 'zz-qa-ci-store';
const MAX = 500;

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
    get length() {
      return map.size;
    },
  };
}

function loadReportedStore(sandbox, storage) {
  sandbox.QMS = sandbox.QMS || {};
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'box-seen-reported-store.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Board.createReportedTicketStore({
    storage: storage,
    storeId: STORE_ID,
    maxEntries: MAX,
  });
}

function ticketNo(i) {
  return String(i).padStart(4, '0');
}

function intakeId(i) {
  return 'intake-' + i;
}

function sandboxWithStorage(storage) {
  const sandbox = { globalThis: {}, localStorage: storage, location: { search: '' } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

test('cap500: 499 reported then +1 yields 500 with none dropped', function () {
  const storage = makeStorage();
  const store = loadReportedStore(sandboxWithStorage(storage), storage);
  for (let i = 0; i < 499; i += 1) {
    store.markReported(ticketNo(i), intakeId(i));
  }
  assert.equal(store.count(), 499);
  store.markReported(ticketNo(499), intakeId(499));
  assert.equal(store.count(), 500);
  assert.equal(store.hasReported(ticketNo(0), intakeId(0)), true);
  assert.equal(store.hasReported(ticketNo(499), intakeId(499)), true);
});

test('cap500: at 500 reported +1 stays 500 and drops oldest only', function () {
  const storage = makeStorage();
  const store = loadReportedStore(sandboxWithStorage(storage), storage);
  for (let i = 0; i < 500; i += 1) {
    store.markReported(ticketNo(i), intakeId(i));
  }
  store.markReported(ticketNo(500), intakeId(500));
  assert.equal(store.count(), 500);
  assert.equal(store.hasReported(ticketNo(0), intakeId(0)), false);
  assert.equal(store.hasReported(ticketNo(1), intakeId(1)), true);
  assert.equal(store.hasReported(ticketNo(500), intakeId(500)), true);
});

test('cap500: bulk 501 marks retain newest 500 only', function () {
  const storage = makeStorage();
  const store = loadReportedStore(sandboxWithStorage(storage), storage);
  for (let i = 0; i < 501; i += 1) {
    store.markReported(ticketNo(i), intakeId(i));
  }
  assert.equal(store.count(), 500);
  assert.equal(store.hasReported(ticketNo(0), intakeId(0)), false);
  assert.equal(store.hasReported(ticketNo(500), intakeId(500)), true);
});

test('cap500: after trim reload keeps 500; evicted ticket may report again', function () {
  const storage = makeStorage();
  const sandbox = sandboxWithStorage(storage);
  const first = loadReportedStore(sandbox, storage);
  for (let i = 0; i < 501; i += 1) {
    first.markReported(ticketNo(i), intakeId(i));
  }
  const reloaded = loadReportedStore(sandboxWithStorage(storage), storage);
  assert.equal(reloaded.count(), 500);
  assert.equal(reloaded.hasReported(ticketNo(0), intakeId(0)), false);
  assert.equal(reloaded.hasReported(ticketNo(500), intakeId(500)), true);

  assert.equal(
    reloaded.hasReported(ticketNo(0), intakeId(0)),
    false,
    'evicted oldest is not in store after reload — may report again on reopen',
  );
});
