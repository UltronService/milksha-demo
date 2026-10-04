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

test('skipped stale reload acks via heartbeat without reloading', async function () {
  const { sandbox } = loadCloudRuntimeHarness();
  const heartbeats = [];
  const pending = {
    id: 'stale-reload-ack',
    type: 'reload',
    issuedAt: BOOT_MS - 60_000,
    params: {},
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
      getBootServerTimeMs: function () { return BOOT_MS; },
    },
    cloudApi: {
      boxHeartbeat: async function (body) {
        heartbeats.push(body);
        return { ok: true };
      },
    },
    readBoard: async function () {
      return { missing: true };
    },
    readDevice: async function () {
      return { data: { pendingCommand: pending } };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: { pushFromObject: function () { return { isOK: true }; } },
    enableTestPollHook: true,
  });
  cloud.start();
  await cloud.pollDeviceForTests();
  assert.equal(
    heartbeats.some(function (h) {
      return h.ackCommandId === 'stale-reload-ack';
    }),
    true,
  );
});

test('skipped already-handled reload id still acks', async function () {
  const { sandbox, storage } = loadCloudRuntimeHarness();
  storage['milksha:lastHandledCmd:s120030:stb-01'] = 'dup-reload';
  const heartbeats = [];
  const pending = {
    id: 'dup-reload',
    type: 'reload',
    issuedAt: BOOT_MS + 5000,
    params: {},
  };
  const transport = {
    session: {
      ensureIdToken: async function () {},
      getBootServerTimeMs: function () { return BOOT_MS; },
    },
    cloudApi: {
      boxHeartbeat: async function (body) {
        heartbeats.push(body);
        return { ok: true };
      },
    },
    readBoard: async function () {
      return { missing: true };
    },
    readDevice: async function () {
      return { data: { pendingCommand: pending } };
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: 's120030',
    deviceId: 'stb-01',
    transport: transport,
    receiverDemo: { pushFromObject: function () { return { isOK: true }; } },
    enableTestPollHook: true,
  });
  cloud.start();
  await cloud.pollDeviceForTests();
  assert.equal(heartbeats.some((h) => h.ackCommandId === 'dup-reload'), true);
});
