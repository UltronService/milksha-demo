'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function bootSimulateOfflineHarness() {
  let offlineVisible = false;
  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
      addEventListener: function () {},
    },
    localStorage: {},
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
      return {
        data: {
          storeId: 'c030020',
          businessDate: '2026-10-15',
          seq: 1,
          updatedAt: '2026-10-15T08:00:00.000Z',
          tickets: [],
        },
      };
    },
    readDevice: async function () {
      return null;
    },
    cloudApi: {
      boxHeartbeat: async function () {
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
    enableTestPollHook: true,
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
  };
}

test('simulate_offline dev command shows guest offline banner', async function () {
  const h = bootSimulateOfflineHarness();
  assert.equal(h.getOfflineVisible(), false);
  await h.cloud.runDevCommandForTests({ type: 'simulate_offline', params: {} });
  assert.equal(h.cloud.isSimulatedOffline(), true);
  assert.equal(h.getOfflineVisible(), true, 'board must show 離線 when simulate_offline is active');
  await h.cloud.runDevCommandForTests({ type: 'restore', params: {} });
  assert.equal(h.cloud.isSimulatedOffline(), false);
  assert.equal(h.getOfflineVisible(), false);
});
