'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadConfig(search) {
  const sandbox = {
    URLSearchParams: URLSearchParams,
    globalThis: {},
  };
  sandbox.location = { search: search || '' };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.QMS = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoardAnimConfig;
}

test('anim config URL overrides clamp to bounds', function () {
  const cfg = loadConfig('?animScale=9&animHold=2&animIn=0.25');
  const c = cfg.getConfig();
  assert.equal(c.readyScale, 1.3);
  assert.equal(c.readyScaleHoldMs, 2000);
  assert.equal(c.readyScaleInMs, 250);
});

test('anim config accepts valid URL overrides', function () {
  const cfg = loadConfig('?animScale=1.2&animHold=2500&animIn=400');
  const c = cfg.getConfig();
  assert.equal(c.readyScale, 1.2);
  assert.equal(c.readyScaleHoldMs, 2500);
  assert.equal(c.readyScaleInMs, 400);
});
