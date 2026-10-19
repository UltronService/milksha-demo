'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadChimePolicy() {
  const sandbox = { Set: Set };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/receiver/chime-policy.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Receiver.createBoardChimePolicy;
}

function newlyReadyIds(prev, next) {
  const out = [];
  next.forEach(function (id) {
    if (!prev.has(id)) {
      out.push(id);
    }
  });
  return out;
}

function makePolicy(bd) {
  const create = loadChimePolicy();
  let businessDate = bd;
  const policy = create({
    getBusinessDate: function () {
      return businessDate;
    },
    newlyReadyIds: newlyReadyIds,
  });
  return {
    policy: policy,
    setBusinessDate: function (next) {
      businessDate = next;
    },
  };
}

function bootSilent(policy, readyIds) {
  policy.pickRingIds(new Set(), new Set(readyIds));
}

test('v2-1 preparing then ready: one chime on newly ready', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, []);
  let prev = new Set();
  let next = new Set(['store:1001']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['store:1001']);
});

test('v2-2 number appears directly in ready: one chime', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, []);
  assert.deepEqual(policy.pickRingIds(new Set(), new Set(['store:42'])), ['store:42']);
});

test('v2-3 removed from ready then re-enters: chimes again', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, []);
  let prev = new Set(['store:55']);
  let next = new Set(['store:55', 'store:56']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['store:56']);
  prev = new Set(['store:55']);
  next = new Set(['store:55', 'store:56']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['store:56']);
});

test('v2-4 same number twice same business day rechimes when re-enters ready', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:9999']);
  let prev = new Set(['store:9999']);
  let next = new Set(['store:9999', 'store:0001']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['store:0001']);
  prev = new Set(['store:9999', 'store:0001']);
  next = new Set(['store:9999']);
  assert.deepEqual(policy.pickRingIds(prev, next), []);
  prev = new Set(['store:9999']);
  next = new Set(['store:9999', 'store:0001']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['store:0001']);
});

test('v2-5 store and udd same digits: each source chimes', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:77']);
  const prev = new Set(['store:77']);
  const next = new Set(['store:77', 'udd:77']);
  assert.deepEqual(policy.pickRingIds(prev, next), ['udd:77']);
});

test('v2-6 ready number unchanged list resend: no chime', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:1', 'store:2']);
  const ready = new Set(['store:1', 'store:2']);
  assert.deepEqual(policy.pickRingIds(ready, ready), []);
});

test('v2-7 first payload after boot is silent', function () {
  const { policy } = makePolicy('2026-10-02');
  const ringIds = policy.pickRingIds(new Set(), new Set(['store:1001']));
  assert.equal(ringIds.length, 0);
});

test('v2-8 max three chimes per payload via milksha splitPopQueue', function () {
  const sandbox = { Set: Set };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  const ids = ['a:1', 'a:2', 'a:3', 'a:4'];
  const split = sandbox.QMS.MilkshaBoard.splitPopQueue(ids);
  assert.deepEqual(split.popIds, ['a:1', 'a:2', 'a:3']);
  assert.deepEqual(split.silentFreshIds, ['a:4']);
});

test('v2-9 sound disabled: muted audio does not play', async function () {
  const played = [];
  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    setInterval: setInterval,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Promise: Promise,
    Set: Set,
    URLSearchParams: URLSearchParams,
    requestAnimationFrame: function (fn) {
      fn();
    },
    addEventListener: function () {},
    innerWidth: 1920,
    innerHeight: 1080,
    __milkshaSoundLog: [],
  };
  const root = { className: '', innerHTML: '', style: { setProperty: function () {} } };
  const dom = { 'board-root': root };
  sandbox.document = {
    getElementById: function (id) {
      if (id === 'board-root') {
        return root;
      }
      if (!dom[id]) {
        dom[id] = {
          innerHTML: '',
          style: {},
          classList: { toggle: function () {} },
          querySelector: function () {
            return null;
          },
          querySelectorAll: function () {
            return [];
          },
        };
      }
      return dom[id];
    },
    addEventListener: function () {},
    visibilityState: 'visible',
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  for (const file of [
    'js/board/landscape-art-layout.js',
    'js/board/source-icons-layout.js',
    'js/board/milksha-board-anim-config.js',
    'js/board/milksha-board-anim.js',
    'js/board/today-board.js',
    'js/transport/board-seq.js',
    'js/receiver/chime-policy.js',
    'js/milksha-board.js',
  ]) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  sandbox.QMS.createAudioManager = function (opts) {
    let muted = Boolean(opts && opts.muted);
    return {
      setBrandAudio: function () {},
      setMuted: function (next) {
        muted = next === true;
      },
      unlock: function () {},
      playDingDong: function () {
        if (muted) {
          return Promise.resolve();
        }
        played.push('ding');
        return Promise.resolve();
      },
    };
  };
  const runtime = sandbox.QMS.bootMilkshaBoard(
    {
      displayName: '迷客夏',
      audio: { dingDong: true, mutedDefault: true },
      copy: { pickupHint: '請取餐' },
      assets: {},
    },
    { document: sandbox.document, window: sandbox },
  );
  runtime.applyPayload([{ source_type: 'From_Store_OK', number: '9001' }]);
  runtime.applyPayload([
    { source_type: 'From_Store_OK', number: '9001' },
    { source_type: 'From_Store_OK', number: '9002' },
  ]);
  await Promise.resolve();
  assert.equal(played.length, 0);
  if (typeof runtime.destroy === 'function') {
    runtime.destroy();
  }
});

test('v2-10 chimes queue without overlap via ring queue', function () {
  const sandbox = {
    Set: Set,
    setTimeout: function () {},
    clearTimeout: function () {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/ring-queue.js'), 'utf8'), sandbox);
  const create = sandbox.QMS.Receiver.createReadyRingQueue;
  let now = 0;
  const base = Date.now();
  const originalDateNow = Date.now;
  Date.now = function () {
    return base + now;
  };
  const timers = [];
  const clocks = {
    setTimeout: function (fn, ms) {
      const id = timers.length;
      timers.push({ fn: fn, at: now + ms, cancelled: false });
      return id;
    },
    clearTimeout: function (id) {
      if (timers[id]) {
        timers[id].cancelled = true;
      }
    },
    advance: function (ms) {
      now += ms;
      for (let i = 0; i < timers.length; i += 1) {
        const t = timers[i];
        if (!t.cancelled && t.at <= now) {
          t.cancelled = true;
          t.fn();
        }
      }
    },
  };
  sandbox.performance = { now: function () {
    return base + now;
  } };
  const played = [];
  const ready = new Set(['a:1', 'a:2', 'a:3']);
  const queue = create({
    overlayDurationMs: 10,
    gapBetweenItemsMs: 0,
    setTimeout: clocks.setTimeout,
    clearTimeout: clocks.clearTimeout,
    onPlay: function (_id, number, onChimeEnded) {
      played.push(number);
      if (onChimeEnded) {
        onChimeEnded();
      }
    },
  });
  queue.syncReadyQueue(ready);
  queue.enqueueReadyIds(['a:1', 'a:2', 'a:3']);
  assert.equal(played.length, 1);
  clocks.advance(10);
  assert.equal(played.length, 2);
  clocks.advance(10);
  assert.equal(played.length, 3);
  Date.now = originalDateNow;
});

test('v2-11 chime picks do not depend on business date changes', function () {
  const { policy, setBusinessDate } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:9']);
  setBusinessDate('2026-10-03');
  assert.deepEqual(
    policy.pickRingIds(new Set(['store:9']), new Set(['store:9', 'store:10'])),
    ['store:10'],
  );
});

test('v2-12 across midnight still-present ready does not chime; leave and re-enter does', function () {
  const { policy, setBusinessDate } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:5']);
  const steady = new Set(['store:5']);
  setBusinessDate('2026-10-03');
  policy.onBusinessDateRoll();
  assert.deepEqual(policy.pickRingIds(steady, steady), []);
  assert.deepEqual(
    policy.pickRingIds(new Set(['store:5']), new Set(['store:5', 'store:6'])),
    ['store:6'],
  );
  assert.deepEqual(policy.pickRingIds(new Set(['store:5', 'store:6']), new Set(['store:5'])), []);
  assert.deepEqual(
    policy.pickRingIds(new Set(['store:5']), new Set(['store:5', 'store:6'])),
    ['store:6'],
  );
});

test('v2-14 transport mode switch keeps ready baseline without rechime', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:1', 'store:2']);
  const baseline = new Set(['store:1', 'store:2']);
  assert.deepEqual(policy.pickRingIds(baseline, baseline), []);
  assert.deepEqual(policy.pickRingIds(baseline, new Set(['store:1', 'store:2', 'store:3'])), ['store:3']);
});

test('v2-15 ready occupancy memory pruned when numbers leave ready', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, []);
  let prev = new Set();
  for (let i = 0; i < 1000; i += 1) {
    const id = 'store:' + String(i).padStart(4, '0');
    const next = new Set([id]);
    policy.pickRingIds(prev, next);
    prev = next;
  }
  const current = new Set(['store:0999']);
  assert.equal(policy.getReadyOccupancyCount(), 1);
  policy.pickRingIds(current, new Set());
  assert.equal(policy.getReadyOccupancyCount(), 0);
});

test('v2-16 after board clear full list resend chimes as new entries', function () {
  const { policy } = makePolicy('2026-10-02');
  bootSilent(policy, ['store:1', 'store:2']);
  policy.onBoardCleared();
  assert.deepEqual(
    policy.pickRingIds(new Set(), new Set(['store:1', 'store:2', 'store:3'])),
    ['store:1', 'store:2', 'store:3'],
  );
});
