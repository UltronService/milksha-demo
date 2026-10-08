'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STORE = 'zz-qa-store-a';
const BD = '2026-10-08';

function loadCloudRuntimeHarness() {
  const storage = {};
  const sandbox = {
    globalThis: {},
    window: {},
    document: { getElementById: function () { return null; } },
    localStorage: {
      getItem: function (k) { return storage[k] ?? null; },
      setItem: function (k, v) { storage[k] = String(v); },
      removeItem: function (k) { delete storage[k]; },
    },
    Set: Set,
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function () {},
    location: { reload: function () {}, search: '' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const files = [
    'js/board/today-board.js',
    'js/transport/board-seq.js',
    'js/receiver/validate-request.js',
    'js/receiver/chime-policy.js',
    'js/receiver/device-command-time.js',
    'js/receiver/cloud-runtime.js',
  ];
  for (let i = 0; i < files.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, files[i]), 'utf8'), sandbox);
  }
  return { sandbox, storage };
}

function boardDoc(seq, tickets) {
  return {
    data: {
      storeId: STORE,
      businessDate: BD,
      seq,
      updatedAt: new Date().toISOString(),
      source: 'A',
      tickets: tickets || [],
    },
    updateTime: String(Date.now()),
    httpDate: 'Wed, 08 Oct 2026 03:00:00 GMT',
    httpDateReadable: true,
  };
}

function makeRuntime(boardReads) {
  const { sandbox } = loadCloudRuntimeHarness();
  const TodayBoard = sandbox.QMS.Board.TodayBoard;
  let readyCount = 0;
  let pending = null;
  let deviceData = { boardSeq: 0, pendingCommand: null };
  const transport = {
    session: { ensureIdToken: async function () {}, getBootServerTimeMs: function () { return Date.now(); } },
    cloudApi: { boxHeartbeat: async function () { return { ok: true }; } },
    readBoard: async function () {
      if (boardReads.length === 0) {
        return { missing: true };
      }
      const next = boardReads.shift();
      return next;
    },
    readDevice: async function () {
      return { data: { ...deviceData, pendingCommand: pending } };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: STORE,
    deviceId: 'stb-01',
    transport,
    milkshaRuntime: {
      applyPayload: function (list) {
        readyCount = list.filter(function (x) {
          return x.source_type === 'From_Store_OK';
        }).length;
      },
    },
    enableTestPollHook: true,
    skipBootReceiverCache: true,
  });
  cloud.start();
  TodayBoard.setSessionBusinessDate(BD);
  return {
    cloud,
    setPending: function (cmd, devBoardSeq) {
      pending = cmd;
      deviceData = { boardSeq: devBoardSeq, pendingCommand: cmd };
    },
    getReadyCount: function () {
      return readyCount;
    },
  };
}

test('clear then push: stale empty poll does not wipe; newer cloud list applies', async function () {
  const runtime = makeRuntime([
    boardDoc(4, []),
    boardDoc(6, [{ no: '12', status: 'ready' }]),
  ]);
  runtime.setPending(
    {
      id: 'cmd-clear-1',
      type: 'clear_now',
      params: {},
      boardSeq: 5,
    },
    5,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.cloud.getLocalSeq(), 5);
  assert.equal(runtime.getReadyCount(), 0);

  runtime.setPending(
    {
      id: 'cmd-push-1',
      type: 'push_numbers',
      params: { ready: ['12'], preparing: [] },
      boardSeq: 6,
    },
    6,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.cloud.getLocalSeq(), 6);
  assert.equal(runtime.getReadyCount(), 1);

  await runtime.cloud.triggerBoardPoll();
  assert.equal(runtime.getReadyCount(), 1, 'stale empty seq 4 must not clear display');
  await runtime.cloud.triggerBoardPoll();
  assert.equal(runtime.getReadyCount(), 1);
  assert.equal(runtime.cloud.getLocalSeq(), 6);
});

test('duplicate pending command is not applied twice', async function () {
  const runtime = makeRuntime([]);
  const cmd = {
    id: 'cmd-dup-1',
    type: 'push_numbers',
    params: { ready: ['9'], preparing: [] },
    boardSeq: 3,
  };
  runtime.setPending(cmd, 3);
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 1);
  assert.equal(runtime.cloud.getLocalSeq(), 3);
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 1, 'second poll must not push again');
  assert.equal(runtime.cloud.getLocalSeq(), 3);
});

test('push then clear_now empties the board', async function () {
  const runtime = makeRuntime([]);
  runtime.setPending(
    {
      id: 'cmd-push-clear-1',
      type: 'push_numbers',
      params: { ready: ['1'], preparing: [] },
      boardSeq: 4,
    },
    4,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 1);
  runtime.setPending(
    {
      id: 'cmd-push-clear-2',
      type: 'clear_now',
      params: {},
      boardSeq: 5,
    },
    5,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 0);
  assert.equal(runtime.cloud.getLocalSeq(), 5);
});

test('newer empty cloud board clears display (POS / remote clear)', async function () {
  const boardReads = [];
  const runtime = makeRuntime(boardReads);
  runtime.setPending(
    {
      id: 'cmd-pos-empty-1',
      type: 'push_numbers',
      params: { ready: ['2'], preparing: [] },
      boardSeq: 8,
    },
    8,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 1);
  boardReads.push(boardDoc(9, []));
  await runtime.cloud.triggerBoardPoll();
  assert.equal(runtime.getReadyCount(), 0);
  assert.equal(runtime.cloud.getLocalSeq(), 9);
});

test('fresh board poll with empty cloud shows empty', async function () {
  const runtime = makeRuntime([boardDoc(2, [])]);
  await runtime.cloud.triggerBoardPoll();
  assert.equal(runtime.getReadyCount(), 0);
  assert.equal(runtime.cloud.getLocalSeq(), 2);
});

test('missing board polls do not inflate localSeq; first small-seq board applies', async function () {
  const missing = {
    missing: true,
    httpDate: 'Wed, 08 Oct 2026 03:00:00 GMT',
    httpDateReadable: true,
  };
  let readCount = 0;
  const { sandbox } = loadCloudRuntimeHarness();
  const TodayBoard = sandbox.QMS.Board.TodayBoard;
  let readyCount = 0;
  const transport = {
    session: { ensureIdToken: async function () {}, getBootServerTimeMs: function () { return Date.now(); } },
    cloudApi: { boxHeartbeat: async function () { return { ok: true }; } },
    readBoard: async function () {
      readCount += 1;
      if (readCount <= 10) {
        return missing;
      }
      return boardDoc(1, [{ no: '88', status: 'ready' }]);
    },
    readDevice: async function () {
      return { data: { boardSeq: 0, pendingCommand: null } };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: STORE,
    deviceId: 'stb-01',
    transport,
    milkshaRuntime: {
      applyPayload: function (list) {
        readyCount = list.filter(function (x) {
          return x.source_type === 'From_Store_OK';
        }).length;
      },
    },
    enableTestPollHook: true,
    skipBootReceiverCache: true,
  });
  cloud.start();
  TodayBoard.setSessionBusinessDate(BD);
  for (let i = 0; i < 20; i += 1) {
    await cloud.triggerBoardPoll();
    if (readyCount === 0) {
      assert.equal(cloud.getLocalSeq(), 0, `while missing, poll ${i + 1} must not bump localSeq`);
    } else {
      break;
    }
  }
  assert.equal(cloud.getLocalSeq(), 1);
  assert.equal(readyCount, 1);
});

test('stale device.boardSeq below cloud seq does not regress local apply', async function () {
  const boardReads = [boardDoc(20, [])];
  const runtime = makeRuntime(boardReads);
  runtime.setPending(
    {
      id: 'cmd-stale-dev',
      type: 'push_numbers',
      params: { ready: ['55'], preparing: [] },
    },
    5,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.getReadyCount(), 1);
  assert.ok(runtime.cloud.getLocalSeq() >= 20);
});

test('device boardSeq used when pendingCommand omits boardSeq', async function () {
  const runtime = makeRuntime([]);
  runtime.setPending(
    {
      id: 'cmd-dev-seq',
      type: 'push_numbers',
      params: { ready: ['3'], preparing: [] },
    },
    8,
  );
  await runtime.cloud.pollDeviceForTests();
  assert.equal(runtime.cloud.getLocalSeq(), 8);
  assert.equal(runtime.getReadyCount(), 1);
});
