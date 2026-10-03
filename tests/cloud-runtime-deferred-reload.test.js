'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BOOT_MS = Date.parse('Sat, 03 Oct 2026 12:00:00 GMT');

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
    location: { reload: function () {} },
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

test('reload defers when heartbeat fails then runs after cloud is reachable', async function () {
  const { sandbox } = loadCloudRuntimeHarness();
  let reloadFired = false;
  sandbox.location.reload = function () {
    reloadFired = true;
  };
  const pending = {
    id: 'defer-reload-1',
    type: 'reload',
    issuedAt: BOOT_MS + 60_000,
    params: {},
  };
  let heartbeatCalls = 0;
  let deviceReads = 0;
  let cloudUp = false;
  const transport = {
    session: {
      ensureIdToken: async function () {},
      getBootServerTimeMs: function () { return BOOT_MS; },
    },
    cloudApi: {
      boxHeartbeat: async function () {
        heartbeatCalls += 1;
        if (!cloudUp) {
          throw new Error('network down');
        }
        return { ok: true };
      },
    },
    readBoard: async function () {
      if (!cloudUp) {
        throw new Error('board unreachable');
      }
      return { missing: true };
    },
    readDevice: async function () {
      deviceReads += 1;
      if (!cloudUp) {
        throw new Error('device unreachable');
      }
      return { data: { pendingCommand: pending } };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: { pushFromObject: function () { return { isOK: true }; } },
    enableTestPollHook: true,
    enableTestReloadSpy: true,
  });
  cloud.start();
  await cloud.pollDeviceForTests();
  assert.equal(reloadFired, false, 'reload must not run while cloud unreachable');
  cloudUp = true;
  await transport.cloudApi.boxHeartbeat({});
  await cloud.pollDeviceForTests();
  assert.equal(reloadFired, true, 'reload runs after cloud is reachable again');
  assert.ok(deviceReads >= 2);
});
