'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function bootOfflineHarness(options) {
  const storage = {};
  let offlineVisible = false;
  let boardReads = 0;
  let heartbeatCalls = 0;
  const boardDoc = options.boardDoc;
  const failHeartbeat = options.failHeartbeat !== false;

  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
      addEventListener: function () {},
    },
    localStorage: storage,
    location: { search: '', reload: function () {} },
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
      boardReads += 1;
      if (typeof options.readBoard === 'function') {
        return options.readBoard(boardReads);
      }
      return boardDoc;
    },
    readDevice: async function () {
      return null;
    },
    cloudApi: {
      boxHeartbeat: async function () {
        heartbeatCalls += 1;
        if (failHeartbeat) {
          throw new Error('heartbeat_network_error');
        }
        return { ok: true };
      },
    },
  };

  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 'c030020',
    deviceId: 'stb-01',
    transport: transport,
    skipBootReceiverCache: true,
    skipInitialCloudKick: true,
    showCloudOfflineUi: true,
    milkshaRuntime: {
      applyPayload: function () {},
      setCloudOfflineVisible: function (visible) {
        offlineVisible = Boolean(visible);
      },
      setCloudPausedVisible: function () {},
    },
  });
  cloud.start();

  return {
    cloud: cloud,
    getOfflineVisible: function () {
      return offlineVisible;
    },
    getBoardReads: function () {
      return boardReads;
    },
    getHeartbeatCalls: function () {
      return heartbeatCalls;
    },
  };
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

test('B-N07: board sync clears offline even when heartbeat keeps failing', async function () {
  const h = bootOfflineHarness({ boardDoc: sampleBoard(2, '2701'), failHeartbeat: true });
  await h.cloud.triggerBoardPoll({ force: true });
  assert.equal(h.getOfflineVisible(), false, 'board apply should clear offline banner');
  assert.equal(h.cloud.isCloudReachable(), true);
  await h.cloud.sendHeartbeat();
  assert.equal(h.getOfflineVisible(), false, 'heartbeat failure must not re-show offline after board ok');
  assert.equal(h.cloud.isCloudReachable(), true);
});

test('B-N07: scheduleCloudResync does not force offline banner while board is reachable', async function () {
  const h = bootOfflineHarness({ boardDoc: sampleBoard(3, '2702'), failHeartbeat: false });
  await h.cloud.triggerBoardPoll({ force: true });
  assert.equal(h.getOfflineVisible(), false);
  await h.cloud.scheduleCloudResync('online');
  assert.equal(h.getOfflineVisible(), false, 'resync must not flash offline when cloud is reachable');
});

test('B-N07: poll failure shows offline; recovery poll clears it', async function () {
  let failBoard = true;
  const h = bootOfflineHarness({
    failHeartbeat: true,
    readBoard: function () {
      if (failBoard) {
        throw new Error('board_network_error');
      }
      return sampleBoard(4, '2703');
    },
  });
  await h.cloud.triggerBoardPoll({ force: true });
  assert.equal(h.getOfflineVisible(), true);
  failBoard = false;
  await h.cloud.triggerBoardPoll({ force: true });
  assert.equal(h.getOfflineVisible(), false);
});
