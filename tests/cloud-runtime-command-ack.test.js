'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function bootSandbox(overrides) {
  const storage = {};
  const heartbeats = [];
  let throwOnApply = false;
  const sandbox = {
    globalThis: {},
    window: {},
    document: { getElementById: () => null, addEventListener: () => {} },
    localStorage: storage,
    location: { search: '', reload: () => {} },
    Set: Set,
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
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
  for (const f of files) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox);
  }
  const transport = {
    session: { ensureIdToken: async () => 'tok', isAuthStopped: () => false, isUploadHalted: () => false },
    readBoard: overrides.readBoard,
    readDevice: overrides.readDevice,
    cloudApi: {
      boxHeartbeat: async (body) => {
        heartbeats.push(body);
        return { ok: true };
      },
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 'zz-qa-store-a',
    deviceId: 'stb-01',
    transport: transport,
    skipBootReceiverCache: true,
    skipInitialCloudKick: true,
    milkshaRuntime: {
      applyPayload: () => {
        if (throwOnApply) {
          throw new Error('apply_failed');
        }
      },
      setCloudOfflineVisible: () => {},
      setCloudPausedVisible: () => {},
    },
    showCloudOfflineUi: true,
  });
  cloud.start();
  return {
    cloud,
    heartbeats,
    armApplyThrow: () => {
      throwOnApply = true;
    },
  };
}

test('clear_now still acks when applyPayload throws', async () => {
  const cmd = {
    id: 'cmd-clear-1',
    type: 'clear_now',
    boardSeq: 5,
    issuedAtMs: Date.now(),
    params: {},
  };
  const { cloud, heartbeats, armApplyThrow } = bootSandbox({
    readBoard: async () => ({
      data: {
        seq: 5,
        storeId: 'zz-qa-store-a',
        businessDate: '2026-10-08',
        updatedAt: new Date().toISOString(),
        source: 'A',
        tickets: [{ no: '1', status: 'ready', updatedAt: new Date().toISOString() }],
      },
    }),
    readDevice: async () => ({
      data: { pendingCommand: cmd, boardSeq: 5 },
    }),
  });
  armApplyThrow();
  await cloud.triggerDevicePoll();
  const acked = heartbeats.some((h) => h.ackCommandId === 'cmd-clear-1');
  assert.equal(acked, true);
});
