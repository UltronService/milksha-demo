'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('fake-cloud api key uses rest-wake sync entrypoint', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller', 'controller-app.js'), 'utf8');
  assert.match(src, /fake-api-key-for-emulator/);
  assert.match(src, /startCloudRestWakeSync/);
  assert.match(src, /cloudSyncUsesRestWakeOnly\(config\)[\s\S]*startCloudRestWakeSync/);
});
