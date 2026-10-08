'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

test('isRealtimeQueryDisabled when realtime=0', function () {
  const storage = {};
  const sandbox = {
    globalThis: {},
    window: {},
    document: { getElementById: function () { return null; } },
    localStorage: storage,
    location: { search: '?realtime=0', reload: function () {} },
    Set: Set,
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: function (fn) { fn(); return 1; },
    clearTimeout: function () {},
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
  const boot = sandbox.QMS.Receiver.bootReceiverCloud;
  assert.equal(typeof boot, 'function');
});
