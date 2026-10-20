'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('cloud-runtime ingests tickets and forwards heartbeat clock without touching apply', function () {
  const rt = fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'cloud-runtime.js'), 'utf8');
  assert.match(rt, /boxSeenBundle\.reporter\.ingestTickets/);
  assert.match(rt, /boxSeenBundle\.clock\.noteHeartbeat/);
  assert.doesNotMatch(rt.slice(rt.indexOf('ingestTickets'), rt.indexOf('ingestTickets') + 400), /applyNumberContent/);
});

test('cloud-boot wires box seen on home milksha board', function () {
  const boot = fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'cloud-boot.js'), 'utf8');
  assert.match(boot, /attachBoxSeenToBoard/);
  assert.match(boot, /boxSeen: boxSeenBundle/);
  assert.match(boot, /_boxSeenPaintCallback/);
});
