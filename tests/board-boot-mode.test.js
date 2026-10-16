'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadResolveHomeBoardBootMode() {
  const sandbox = { QMS: { Receiver: {} } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'board-boot-mode.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Receiver.resolveHomeBoardBootMode;
}

const resolve = loadResolveHomeBoardBootMode();

test('?store=a17 defaults to cloud without mode param', function () {
  const params = new URLSearchParams('?store=a17');
  assert.equal(resolve(params, { prefersDefaultCloudMode: false }), 'cloud');
});

test('?mode=cloud&store=a17 stays cloud', function () {
  const params = new URLSearchParams('?mode=cloud&store=a17');
  assert.equal(resolve(params, { prefersDefaultCloudMode: false }), 'cloud');
});

test('?mode=local forces local even with store', function () {
  const params = new URLSearchParams('?mode=local&store=a17');
  assert.equal(resolve(params, { prefersDefaultCloudMode: true }), 'local');
});

test('no store and no mode follows prefersDefaultCloudMode', function () {
  assert.equal(resolve(new URLSearchParams(''), { prefersDefaultCloudMode: true }), 'cloud');
  assert.equal(resolve(new URLSearchParams(''), { prefersDefaultCloudMode: false }), 'local');
});
