'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OVERLAY_MS = 2500;

function loadQueue() {
  const sandbox = {
    Set: Set,
    setTimeout: function () {},
    clearTimeout: function () {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/ring-queue.js'), 'utf8'), sandbox);
  return sandbox.QMS.Receiver.createReadyRingQueue;
}

function makeFakeTimers() {
  let now = 0;
  const base = Date.now();
  const timers = [];
  const originalDateNow = Date.now;
  Date.now = function () {
    return base + now;
  };
  return {
    now: function () {
      return now;
    },
    restore: function () {
      Date.now = originalDateNow;
    },
    setTimeout: function (fn, ms) {
      const id = timers.length;
      timers.push({ fn: fn, at: now + ms, id: id, cancelled: false });
      return id;
    },
    clearTimeout: function (id) {
      for (let i = 0; i < timers.length; i += 1) {
        if (timers[i].id === id) {
          timers[i].cancelled = true;
        }
      }
    },
    advance: function (ms) {
      now += ms;
      let safety = 0;
      while (safety < 80) {
        safety += 1;
        const due = timers
          .filter(function (t) {
            return !t.cancelled && t.at <= now;
          })
          .sort(function (a, b) {
            return a.at - b.at;
          });
        if (due.length === 0) {
          break;
        }
        for (let i = 0; i < due.length; i += 1) {
          due[i].cancelled = true;
          due[i].fn();
        }
      }
    },
  };
}

test('twelve simultaneous rings play FIFO every 2.5s with gap 0', function () {
  const create = loadQueue();
  const clocks = makeFakeTimers();
  try {
    const played = [];
    const queue = create({
      overlayDurationMs: OVERLAY_MS,
      gapBetweenItemsMs: 0,
      setTimeout: clocks.setTimeout,
      clearTimeout: clocks.clearTimeout,
      onPlay: function (_id, number, onChimeEnded) {
        played.push({ number: number, at: clocks.now() });
        if (onChimeEnded) {
          onChimeEnded();
        }
      },
      onHideOverlay: function () {},
    });
    const ids = [];
    const ready = new Set();
    for (let i = 0; i < 12; i += 1) {
      const id = 'store:' + (9000 + i);
      ids.push(id);
      ready.add(id);
    }
    queue.syncReadyQueue(ready);
    queue.enqueueReadyIds(ids);
    assert.equal(played.length, 1);
    assert.equal(played[0].number, '9000');
    for (let step = 1; step < 12; step += 1) {
      clocks.advance(OVERLAY_MS);
      assert.equal(played.length, step + 1);
      assert.equal(played[step].number, String(9000 + step));
      assert.equal(played[step].at - played[step - 1].at, OVERLAY_MS);
    }
  } finally {
    clocks.restore();
  }
});

test('enqueue dedupes ids already queued', function () {
  const create = loadQueue();
  const clocks = makeFakeTimers();
  let plays = 0;
  const queue = create({
    overlayDurationMs: OVERLAY_MS,
    setTimeout: clocks.setTimeout,
    clearTimeout: clocks.clearTimeout,
    onPlay: function (_id, _number, onChimeEnded) {
      plays += 1;
      if (onChimeEnded) {
        onChimeEnded();
      }
    },
    onHideOverlay: function () {},
  });
  queue.syncReadyQueue(new Set(['store:1']));
  queue.enqueueReadyIds(['store:1', 'store:1']);
  assert.equal(plays, 1);
  assert.equal(queue.getQueueIds().length, 1);
});

test('removes id from queue when it leaves ready before turn', function () {
  const create = loadQueue();
  const clocks = makeFakeTimers();
  const played = [];
  const queue = create({
    overlayDurationMs: OVERLAY_MS,
    setTimeout: clocks.setTimeout,
    clearTimeout: clocks.clearTimeout,
    onPlay: function (_id, number, onChimeEnded) {
      played.push(number);
      if (onChimeEnded) {
        onChimeEnded();
      }
    },
    onHideOverlay: function () {},
  });
  queue.syncReadyQueue(new Set(['store:1', 'store:2']));
  queue.enqueueReadyIds(['store:1', 'store:2']);
  assert.equal(played[0], '1');
  queue.syncReadyQueue(new Set(['store:1']));
  clocks.advance(OVERLAY_MS);
  assert.deepEqual(played, ['1']);
});

test('autoplay blocked keeps full queue until gesture unlock plays one head', function () {
  const create = loadQueue();
  const clocks = makeFakeTimers();
  let playCalls = 0;
  const queue = create({
    overlayDurationMs: OVERLAY_MS,
    setTimeout: clocks.setTimeout,
    clearTimeout: clocks.clearTimeout,
    onPlay: function (_id, _number, onChimeEnded) {
      playCalls += 1;
      if (playCalls === 1) {
        queue.notifyAudioBlocked();
        return;
      }
      if (onChimeEnded) {
        onChimeEnded();
      }
    },
    onHideOverlay: function () {},
  });
  const ready = new Set(['store:1', 'store:2', 'store:3']);
  queue.syncReadyQueue(ready);
  queue.enqueueReadyIds(['store:1', 'store:2', 'store:3']);
  assert.equal(playCalls, 1);
  assert.equal(queue.getQueueIds().length, 3);
  assert.equal(queue.isAudioBlocked(), true);
  queue.unlockAudioFromGesture();
  assert.equal(playCalls, 2);
  clocks.advance(OVERLAY_MS);
  assert.equal(playCalls, 3);
  assert.equal(queue.getQueueIds().length, 2);
  clocks.advance(OVERLAY_MS);
  assert.equal(playCalls, 4);
  assert.equal(queue.getQueueIds().length, 1);
});
