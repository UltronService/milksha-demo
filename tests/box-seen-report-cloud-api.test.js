'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('cloud-api boxSeenReport does not call markUploadHaltedFrom403', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'transport', 'cloud-api.js'), 'utf8');
  assert.match(src, /boxSeenReport/);
  const fnBlock = src.slice(src.indexOf('boxSeenReport:'), src.indexOf('boardAutoPair:'));
  assert.doesNotMatch(fnBlock, /markUploadHaltedFrom403/);
});

test('fake-cloud boxHeartbeat returns serverNowMs', async function () {
  const mod = await import('../tools/fake-cloud/dev-command-validation.mjs');
  assert.equal(typeof mod.validateBoxHeartbeatBody, 'function');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'fake-cloud', 'server.mjs'), 'utf8');
  assert.match(src, /serverNowMs/);
});

test('index.html loads box seen modules before cloud-runtime', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const contract = html.indexOf('js/board/box-seen-payload-contract.js');
  const boxId = html.indexOf('js/board/box-id.js');
  assert.ok(contract > 0 && boxId > contract);
  const runtime = html.indexOf('js/receiver/cloud-runtime.js');
  assert.ok(boxId > 0 && runtime > boxId);
  assert.match(html, /box-seen-reported-store\.js/);
  assert.match(html, /box-seen-report\.js/);
});
