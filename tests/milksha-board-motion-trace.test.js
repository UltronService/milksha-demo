'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadTraceModule(options) {
  const search = options?.search ?? '';
  const presetGlobal = options?.presetGlobal;
  const sandbox = {
    URLSearchParams,
    performance: { now: () => sandbox.__now ?? 0 },
    requestAnimationFrame(fn) {
      sandbox.__rafQueue = sandbox.__rafQueue || [];
      sandbox.__rafQueue.push(fn);
      return sandbox.__rafQueue.length;
    },
    cancelAnimationFrame() {},
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
  sandbox.QMS = {};
  if (presetGlobal !== undefined) {
    sandbox.__MILKSHA_MOTION_TRACE = presetGlobal;
  }
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-motion-trace.js'), 'utf8'),
    sandbox,
  );
  return sandbox;
}

test('motion trace OFF: no public global and isEnabled false', function () {
  const sb = loadTraceModule({ search: '' });
  assert.equal(sb.__milkshaMotionTrace, undefined);
  assert.equal(sb.QMS.MilkshaBoardMotionTrace.isEnabled(), false);
});

test('motion trace ON via URL: exposes get/clear and records frames on track', async function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  assert.ok(sb.__milkshaMotionTrace);
  assert.equal(sb.QMS.MilkshaBoardMotionTrace.isEnabled(), true);
  await sb.QMS.MilkshaBoardMotionTrace.trackZoneAnimation('new-order-fade-in', null, Promise.resolve());
  const sessions = sb.__milkshaMotionTrace.get();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].motionType, 'new-order-fade-in');
  assert.ok(sessions[0].frames.length >= 2);
  sb.__milkshaMotionTrace.clear();
  assert.equal(sb.__milkshaMotionTrace.get().length, 0);
});

test('analyze flags diagonal motion with zero tolerance', function () {
  const sb = loadTraceModule({ search: '?motionTrace=1' });
  const analyze = sb.__milkshaMotionTrace.analyzeFrames;
  const frames = [
    {
      t: 0,
      chips: [{ number: '1001', itemId: 'store:1001', zone: 'prep', slot: 0, rect: { left: 0, top: 0, right: 10, bottom: 10 }, opacity: 1 }],
    },
    {
      t: 16,
      chips: [{ number: '1001', itemId: 'store:1001', zone: 'prep', slot: 0, rect: { left: 2, top: 2, right: 12, bottom: 12 }, opacity: 1 }],
    },
  ];
  const result = analyze(frames, { layout: null });
  assert.ok(result.diagonalMotion.some((v) => v.number === '1001'));
});
