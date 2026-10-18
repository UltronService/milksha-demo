'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('controller cloud path uses realtime sync (no 4s board/device REST poll)', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.equal(src.includes('startBoardOnlineFastProbe'), false);
  assert.equal(src.includes('boardOnlineFastProbeTimer'), false);
  assert.match(src, /startCloudRealtimeSync/);
  assert.match(src, /Controller\.RealtimeSync/);
  assert.equal(src.includes('startPolling('), false);
  assert.match(src, /if \(isCloudRealtimeMode\(mode\)\) \{[\s\S]*await startCloudRealtimeSync/);
});

test('local mode may still use 4s local polling for POC coordination', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.match(src, /function startLocalPolling/);
  assert.match(src, /startLocalPolling\(\)/);
});
