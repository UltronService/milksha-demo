'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadPosReceiveLogFormat() {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'tools', 'pos-receive-log-format.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Tools.PosReceiveLogFormat;
}

test('formatIpForDisplay returns trimmed full IP', function () {
  const F = loadPosReceiveLogFormat();
  assert.equal(F.formatIpForDisplay('  203.69.12.34  '), '203.69.12.34');
  assert.equal(F.formatIpForDisplay(''), '');
});

test('formatReceiveDelaySecondsFromMs converts ms to seconds with 3 decimals', function () {
  const F = loadPosReceiveLogFormat();
  assert.equal(F.formatReceiveDelaySecondsFromMs(0), '0.000');
  assert.equal(F.formatReceiveDelaySecondsFromMs(1500), '1.500');
  assert.equal(F.formatReceiveDelaySecondsFromMs(1234), '1.234');
  assert.equal(F.formatReceiveDelaySecondsFromMs(1), '0.001');
});

test('formatReceiveDelaySecondsFromMs handles null and non-finite', function () {
  const F = loadPosReceiveLogFormat();
  assert.equal(F.formatReceiveDelaySecondsFromMs(null), '');
  assert.equal(F.formatReceiveDelaySecondsFromMs(undefined), '');
  assert.equal(F.formatReceiveDelaySecondsFromMs(Number.NaN), '');
});

test('formatReceiveDelayCell adds clock note when delay is negative', function () {
  const F = loadPosReceiveLogFormat();
  assert.equal(F.formatReceiveDelayCell(500), '0.500');
  assert.equal(F.formatReceiveDelayCell(-250), '-0.250 兩邊時鐘不同');
});
