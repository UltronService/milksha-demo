'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCommandTime() {
  const sandbox = { globalThis: {}, QMS: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/receiver/device-command-time.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Receiver;
}

const Receiver = loadCommandTime();
const BOOT_MS = Date.parse('Sat, 03 Oct 2026 12:00:00 GMT');

test('commandServerTimeMs prefers issuedAtMs over issuedAt and createdAt', function () {
  assert.equal(
    Receiver.commandServerTimeMs({
      issuedAtMs: 1_700_000_000_999,
      issuedAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2019-01-01T00:00:00.000Z',
    }),
    1_700_000_000_999,
  );
  assert.equal(
    Receiver.commandServerTimeMs({ issuedAt: 1_700_000_000_123, createdAt: '2020-01-01T00:00:00.000Z' }),
    1_700_000_000_123,
  );
});

test('parseCommandTimeValue accepts numeric string and ISO', function () {
  assert.equal(Receiver.parseCommandTimeValue('1696334400123'), 1696334400123);
  const iso = '2026-10-03T12:00:01.000Z';
  assert.equal(Receiver.parseCommandTimeValue(iso), Date.parse(iso));
});

test('parseCommandTimeValue accepts Firestore timestamp shapes', function () {
  assert.equal(
    Receiver.parseCommandTimeValue({ timestampValue: '2026-10-03T12:00:01.000Z' }),
    Date.parse('2026-10-03T12:00:01.000Z'),
  );
  assert.equal(Receiver.parseCommandTimeValue({ seconds: 1696334400, nanos: 500000000 }), 1696334400500);
  assert.equal(Receiver.parseCommandTimeValue({ _seconds: 1696334400, _nanoseconds: 0 }), 1696334400000);
});

test('commandServerTimeMs returns null for missing or garbage', function () {
  assert.equal(Receiver.commandServerTimeMs({ type: 'reload' }), null);
  assert.equal(Receiver.commandServerTimeMs({ issuedAt: 'not-a-date' }), null);
  assert.equal(Receiver.commandServerTimeMs({ issuedAt: {} }), null);
});

test('shouldSkipReloadRebootByBootServerTime uses strict ms compare', function () {
  const skip = Receiver.shouldSkipReloadRebootByBootServerTime;
  assert.equal(skip({ type: 'reload', issuedAt: BOOT_MS - 5000 }, BOOT_MS), true);
  assert.equal(skip({ type: 'reload', issuedAt: BOOT_MS }, BOOT_MS), false);
  assert.equal(skip({ type: 'reload', issuedAt: BOOT_MS + 1 }, BOOT_MS), false);
  assert.equal(skip({ type: 'clear_now', issuedAt: BOOT_MS - 1 }, BOOT_MS), false);
});

test('shouldSkipReloadRebootByBootServerTime does not skip when time missing or unparseable', function () {
  const skip = Receiver.shouldSkipReloadRebootByBootServerTime;
  assert.equal(skip({ type: 'reload', id: 'x' }, BOOT_MS), false);
  assert.equal(skip({ type: 'reboot', issuedAt: 'garbage' }, BOOT_MS), false);
});
