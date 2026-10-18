'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * PR #101 diag: documents why live cloud board-online can stay offline on branch
 * without relaxing product behavior (structural regression guard).
 */
test('realtime cloud sync skips REST pollDevice while listeners are active', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.match(
    src,
    /async function pollDevice\(\)[\s\S]*cloudSyncMode === 'realtime'[\s\S]*cloudRealtimeSync\.isActive\(\)[\s\S]*return;/,
  );
});

test('board online UI requires deviceOnline from applyDeviceDocument not REST when realtime active', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.match(src, /function applyDeviceDocument\(dev\)/);
  assert.match(src, /deviceOnline = age < heartbeatTimeoutMs\(\)/);
  assert.match(src, /data-board-online/);
});
