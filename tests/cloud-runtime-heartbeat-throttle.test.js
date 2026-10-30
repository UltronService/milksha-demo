'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HEARTBEAT_MS = 15000;

async function flushAsyncWork(rounds) {
  const n = rounds || 30;
  for (let i = 0; i < n; i += 1) {
    await new Promise(function (resolve) {
      setImmediate(resolve);
    });
  }
}

function sampleBoard(seq, no) {
  return {
    data: {
      storeId: 'c030020',
      businessDate: '2026-10-15',
      seq: seq,
      updatedAt: '2026-10-15T08:00:00.000Z',
      source: 'A',
      tickets: [{ no: String(no), status: 'ready', updatedAt: '2026-10-15T08:00:00.000Z' }],
    },
    updateTime: '2026-10-15T08:00:00.000Z',
    httpDate: '',
    httpDateReadable: false,
  };
}

function bootTimedHarness(options) {
  const storage = {};
  let heartbeatCalls = 0;
  const boardDoc = options.boardDoc;
  const failBoard = options.failBoard === true;

  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      visibilityState: 'visible',
      getElementById: function () {
        return null;
      },
      addEventListener: function () {},
      removeEventListener: function () {},
    },
    localStorage: storage,
    location: { search: '', reload: function () {} },
    Set: Set,
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    setInterval: setInterval,
    clearInterval: clearInterval,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    addEventListener: function () {},
    removeEventListener: function () {},
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

  const transport = {
    session: {
      ensureIdToken: async function () {
        return 'tok';
      },
      isAuthStopped: function () {
        return false;
      },
      isUploadHalted: function () {
        return false;
      },
    },
    readBoard: async function () {
      if (failBoard) {
        throw new Error('board_network_error');
      }
      if (typeof options.readBoard === 'function') {
        return options.readBoard();
      }
      return boardDoc;
    },
    readDevice: async function () {
      return null;
    },
    cloudApi: {
      boxHeartbeat: async function () {
        heartbeatCalls += 1;
        return { ok: true };
      },
    },
  };

  let cloudRef = null;
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 'c030020',
    deviceId: 'stb-01',
    transport: transport,
    skipBootReceiverCache: true,
    skipInitialCloudKick: true,
    enableTestPollHook: true,
    showCloudOfflineUi: true,
    heartbeatIntervalMs: HEARTBEAT_MS,
    onCloudResync: function () {
      if (!cloudRef) {
        return Promise.resolve();
      }
      return cloudRef.triggerBoardPoll({ force: true });
    },
    milkshaRuntime: {
      applyPayload: function () {},
      setCloudOfflineVisible: function () {},
      setCloudPausedVisible: function () {},
    },
  });
  cloudRef = cloud;

  return {
    cloud: cloud,
    getHeartbeatCalls: function () {
      return heartbeatCalls;
    },
  };
}

test('boxHeartbeat throttle: persistent board read failure keeps heartbeats within 4 per 60s', async function (t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 0 });
  t.after(function () {
    t.mock.timers.reset();
  });

  const h = bootTimedHarness({ failBoard: true });
  h.cloud.start();
  await h.cloud.triggerBoardPoll({ force: true });
  await flushAsyncWork(10);
  for (let sec = 0; sec < 60; sec += 1) {
    t.mock.timers.tick(1000);
    await flushAsyncWork(5);
  }

  assert.ok(
    h.getHeartbeatCalls() <= 4,
    'expected at most 4 boxHeartbeat calls in 60s, got ' + h.getHeartbeatCalls(),
  );
});

test('boxHeartbeat throttle: healthy board stays within 5 heartbeats per 60s', async function (t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 0 });
  t.after(function () {
    t.mock.timers.reset();
  });

  const h = bootTimedHarness({ failBoard: false, boardDoc: sampleBoard(2, '2701') });
  h.cloud.start();
  await h.cloud.triggerBoardPoll({ force: true });
  await flushAsyncWork(10);
  for (let sec = 0; sec < 60; sec += 1) {
    t.mock.timers.tick(1000);
    await flushAsyncWork(5);
  }

  assert.ok(
    h.getHeartbeatCalls() <= 5,
    'expected at most 5 boxHeartbeat calls in 60s, got ' + h.getHeartbeatCalls(),
  );
});
