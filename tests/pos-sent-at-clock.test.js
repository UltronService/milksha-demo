'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CLOUD = 1_765_000_000_000;

function loadPosSentAtClock() {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/pos-sent-at-clock.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.PosSentAtClock;
}

test('device clock slow: exactly 10000 ms skew is in range', function () {
  const Clock = loadPosSentAtClock();
  const device = CLOUD - 10_000;
  assert.equal(Clock.isWithinPosSentAtSkew(device, CLOUD), true);
  const evalSlow = Clock.evaluatePosSentAtClock(device, CLOUD);
  assert.equal(evalSlow.posSentAtIgnored, false);
  assert.equal(evalSlow.posSentAtMs, device);
});

test('device clock slow: 10001 ms skew is ignored', function () {
  const Clock = loadPosSentAtClock();
  const device = CLOUD - 10_001;
  assert.equal(Clock.isWithinPosSentAtSkew(device, CLOUD), false);
  const evalSlow = Clock.evaluatePosSentAtClock(device, CLOUD);
  assert.equal(evalSlow.posSentAtIgnored, true);
  assert.equal(evalSlow.posSentAtMs, null);
});

test('device clock fast: exactly 10000 ms skew is in range', function () {
  const Clock = loadPosSentAtClock();
  const device = CLOUD + 10_000;
  assert.equal(Clock.isWithinPosSentAtSkew(device, CLOUD), true);
  const evalFast = Clock.evaluatePosSentAtClock(device, CLOUD);
  assert.equal(evalFast.posSentAtIgnored, false);
  assert.equal(evalFast.posSentAtMs, device);
});

test('device clock fast: 10001 ms skew is ignored', function () {
  const Clock = loadPosSentAtClock();
  const device = CLOUD + 10_001;
  assert.equal(Clock.isWithinPosSentAtSkew(device, CLOUD), false);
  const evalFast = Clock.evaluatePosSentAtClock(device, CLOUD);
  assert.equal(evalFast.posSentAtIgnored, true);
  assert.equal(evalFast.posSentAtMs, null);
});
