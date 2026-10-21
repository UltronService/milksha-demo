'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('applyUrlDeviceParamFromQuery sets fld-device from ?device= before cloud pin', function () {
  const src = readUtf8('controller/controller-app.js');
  assert.match(src, /function applyUrlDeviceParamFromQuery\(params\)/);
  const applyIdx = src.indexOf('applyUrlDeviceParamFromQuery(params)');
  const pinIdx = src.indexOf('pinCloudDeviceDefaults();');
  assert.ok(applyIdx > 0 && pinIdx > applyIdx, 'applyUrlDeviceParamFromQuery must run before pinCloudDeviceDefaults');
});

test('applyUrlDeviceParamFromQuery updates fld-device and localStorage', function () {
  const html = readUtf8('controller/index.html');
  const appSrc = readUtf8('controller/controller-app.js');
  const storage = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  const devInput = { value: 'stb-01' };
  const sandbox = {
    document: {
      getElementById(id) {
        if (id === 'fld-device') return devInput;
        return null;
      },
    },
    localStorage: storage,
    location: { search: '?device=qa-pc-01' },
    window: null,
  };
  sandbox.window = sandbox;
  const fnBody = appSrc.match(
    /function applyUrlDeviceParamFromQuery\(params\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(fnBody, 'applyUrlDeviceParamFromQuery body found');
  const params = { get: (k) => (k === 'device' ? 'qa-pc-01' : null) };
  vm.runInNewContext(fnBody[0] + '\napplyUrlDeviceParamFromQuery(params);', { ...sandbox, params });
  assert.equal(devInput.value, 'qa-pc-01');
  assert.equal(storage.getItem('milksha:deviceId'), 'qa-pc-01');
});
