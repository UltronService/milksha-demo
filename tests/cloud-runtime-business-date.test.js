'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCloudRuntimeHarness() {
  const storage = {};
  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
    },
    localStorage: {
      getItem: function (k) {
        return storage[k] ?? null;
      },
      setItem: function (k, v) {
        storage[k] = String(v);
      },
      removeItem: function (k) {
        delete storage[k];
      },
    },
    Set: Set,
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    setInterval: function () {
      return 1;
    },
    clearInterval: function () {},
    setTimeout: function (fn) {
      fn();
      return 1;
    },
    clearTimeout: function () {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const files = [
    'js/board/today-board.js',
    'js/transport/board-seq.js',
    'js/receiver/validate-request.js',
    'js/receiver/chime-policy.js',
    'js/receiver/cloud-runtime.js',
  ];
  for (let i = 0; i < files.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, files[i]), 'utf8'), sandbox);
  }
  return { sandbox: sandbox, storage: storage };
}

test('cloud runtime applies board via box_clock when cloud omits businessDate', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness();
  const cacheKey = 'milksha:receiver-cache:s120030';
  const cachePayload = {
    seq: 3,
    numberContent: [{ source_type: 'From_Store_OK', number: '77' }],
    businessDate: '2026-10-02',
    savedAt: 1,
  };
  storage[cacheKey] = JSON.stringify(cachePayload);
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
    },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '',
          seq: 4,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '88', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 20);
  });
  assert.equal(pushCalls, 1);
  assert.equal(sandbox.QMS.Board.TodayBoard.hasSessionBusinessDate(), true);
});

test('cloud runtime applies board when HTTP Date is readable', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness();
  let pushCalls = 0;
  const demo = {
    pushFromObject: function () {
      pushCalls += 1;
      return { isOK: true };
    },
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
    },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '',
          seq: 2,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '55', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: 'Fri, 03 Oct 2026 10:00:00 GMT',
        httpDateReadable: true,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 20);
  });
  assert.equal(pushCalls, 1);
  assert.equal(sandbox.QMS.Board.TodayBoard.getSessionBusinessDate(), '2026-10-03');
});

test('first cloud batch after boot stays silent when stale cache cleared on roll', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness();
  const cacheKey = 'milksha:receiver-cache:s120030';
  storage[cacheKey] = JSON.stringify({
    seq: 1,
    numberContent: [{ source_type: 'From_Store_OK', number: '11' }],
    businessDate: '2026-10-01',
    savedAt: 1,
  });
  const ringIds = [];
  const demo = {
    pushFromObject: function (_req, opts) {
      if (opts && opts.newlyReadyIds) {
        ringIds.push(opts.newlyReadyIds.slice());
      }
      return { isOK: true };
    },
  };
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return {
        data: {
          storeId: 's120030',
          businessDate: '2026-10-03',
          seq: 2,
          updatedAt: '2026-10-03T00:00:00.000Z',
          source: 'A',
          tickets: [{ no: '22', status: 'ready', updatedAt: '2026-10-03T00:00:00.000Z' }],
        },
        updateTime: '2026-10-03T00:00:00.000Z',
        httpDate: '',
        httpDateReadable: false,
      };
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: demo,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  const flat = ringIds.flat();
  assert.equal(flat.length, 0);
});
