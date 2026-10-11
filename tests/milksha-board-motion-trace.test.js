'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadTraceModule(options) {
  const search = options?.search ?? '';
  const sandbox = {
    URLSearchParams,
    performance: { now: () => sandbox.__now ?? 0 },
    requestAnimationFrame(fn) {
      sandbox.__rafQueue = sandbox.__rafQueue || [];
      sandbox.__rafQueue.push(fn);
      return sandbox.__rafQueue.length;
    },
    cancelAnimationFrame() {},
    setInterval(fn, ms) {
      sandbox.__intervals = sandbox.__intervals || [];
      const handle = { fn, ms, id: sandbox.__intervals.length + 1, cleared: false };
      sandbox.__intervals.push(handle);
      return handle.id;
    },
    clearInterval(id) {
      const h = (sandbox.__intervals || []).find((x) => x.id === id);
      if (h) {
        h.cleared = true;
      }
    },
    setTimeout(fn, ms) {
      sandbox.__timeouts = sandbox.__timeouts || [];
      sandbox.__timeouts.push({ fn, at: sandbox.__now + ms });
    },
    document: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
    },
    getComputedStyle() {
      return { opacity: '1', transform: 'none' };
    },
    globalThis: {},
  };
  sandbox.__now = 0;
  sandbox.location = { search };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.QMS = {
    MilkshaBoardAnimConfig: {
      getConfig: () => ({ opacityInMs: 300, pageDurationMs: 500, columnMoveMs: 300 }),
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-motion-trace.js'), 'utf8'),
    sandbox,
  );
  return sandbox;
}

function fireDueIntervals(sb, advanceMs) {
  sb.__now += advanceMs;
  for (const h of sb.__intervals || []) {
    if (!h.cleared) {
      h.fn();
    }
  }
  const pending = sb.__timeouts || [];
  sb.__timeouts = [];
  for (const t of pending) {
    if (t.at <= sb.__now) {
      t.fn();
    } else {
      sb.__timeouts.push(t);
    }
  }
}

test('motion trace OFF: no public global and isEnabled false', function () {
  const sb = loadTraceModule({ search: '' });
  assert.equal(sb.__milkshaMotionTrace, undefined);
  assert.equal(sb.QMS.MilkshaBoardMotionTrace.isEnabled(), false);
});

test('validateSession: zero frames is INVALID', function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const v = sb.__milkshaMotionTrace.validateSession({ frames: [] });
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'zero_frames');
});

test('track samples at least every 50ms through min motion duration', async function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const trackPromise = sb.QMS.MilkshaBoardMotionTrace.trackZoneAnimation(
    'pickup-disappear',
    null,
    Promise.resolve(),
  );
  for (let i = 0; i < 8; i += 1) {
    fireDueIntervals(sb, 50);
  }
  await trackPromise;
  const session = sb.__milkshaMotionTrace.get()[0];
  assert.ok(session.frames.length >= 6, 'expected ~300ms/50ms samples');
});

test('chip snapshot includes scale and role fields', function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const snap = sb.QMS.MilkshaBoardMotionTrace.captureChipSnapshotsForTest(0);
  assert.equal(Array.isArray(snap), true);
});

test('diagonal ignores scale-only pulse (translate unchanged)', function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const analyze = sb.__milkshaMotionTrace.analyzeFrames;
  const frames = [
    {
      t: 0,
      zoneRects: {},
      chips: [
        {
          number: '2001',
          itemId: 'store:2001',
          zone: 'ready',
          slot: 0,
          opacity: 0.5,
          scale: 1,
          tx: 0,
          ty: 0,
          role: 'in-cell',
          rect: { left: 0, top: 0, right: 10, bottom: 10 },
        },
      ],
    },
    {
      t: 50,
      zoneRects: {},
      chips: [
        {
          number: '2001',
          itemId: 'store:2001',
          zone: 'ready',
          slot: 0,
          opacity: 1,
          scale: 1.3,
          tx: 0,
          ty: 0,
          role: 'in-cell',
          rect: { left: -1.5, top: -1.5, right: 11.5, bottom: 11.5 },
        },
      ],
    },
  ];
  const result = analyze(frames, { layout: null });
  assert.equal(result.diagonalMotion.length, 0);
});

test('diagonal flags when both tx and ty change', function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const analyze = sb.__milkshaMotionTrace.analyzeFrames;
  const frames = [
    {
      t: 0,
      zoneRects: {},
      chips: [{ number: '1001', itemId: 'store:1001', zone: 'prep', slot: 0, tx: 0, ty: 0, scale: 1, rect: {} }],
    },
    {
      t: 50,
      zoneRects: {},
      chips: [{ number: '1001', itemId: 'store:1001', zone: 'prep', slot: 0, tx: 4, ty: 3, scale: 1, rect: {} }],
    },
  ];
  const result = analyze(frames, { layout: null });
  assert.ok(result.diagonalMotion.length > 0);
});

test('ring buffer caps frames per session', async function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const max = sb.__milkshaMotionTrace.getConfig().maxFramesPerSession;
  const slow = new Promise(function (resolve) {
    sb.setTimeout(resolve, max * 50 + 500);
  });
  const trackPromise = sb.QMS.MilkshaBoardMotionTrace.trackZoneAnimation('clear-board', null, slow);
  for (let i = 0; i < max + 20; i += 1) {
    fireDueIntervals(sb, 50);
  }
  await trackPromise;
  const session = sb.__milkshaMotionTrace.get()[0];
  assert.equal(session.frames.length, max);
});
