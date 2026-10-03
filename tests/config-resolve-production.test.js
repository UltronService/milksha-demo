'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadConfigResolve(location) {
  const sandbox = {
    location: location,
    MILKSHA_FIREBASE_CONFIG: {
      projectId: 'prod-project',
      apiKey: 'prod-key',
      region: 'asia-east1',
    },
    localStorage: {
      _data: {},
      getItem(k) {
        return this._data[k] ?? null;
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/cloud-settings.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport;
}

test('production host ignores hostile gateway query param', function () {
  const T = loadConfigResolve({
    hostname: 'ultronservice.github.io',
    protocol: 'https:',
    search: '?gateway=https://evil.example&functions=https://evil.example/fn',
  });
  const params = new URLSearchParams('?gateway=https://evil.example&functions=https://evil.example/fn');
  const cfg = T.resolveFirebaseConfig(params, sandboxMilkshaConfig());
  assert.equal(cfg.useEmulator, false);
  assert.ok(cfg.functionsBaseUrl.indexOf('evil.example') < 0);
  assert.ok(cfg.functionsBaseUrl.indexOf('prod-project') >= 0);
});

function sandboxMilkshaConfig() {
  return {
    projectId: 'prod-project',
    apiKey: 'prod-key',
    region: 'asia-east1',
  };
}

test('localhost allows gateway override', function () {
  const T = loadConfigResolve({
    hostname: '127.0.0.1',
    protocol: 'http:',
    search: '?gateway=127.0.0.1:8787',
  });
  const params = new URLSearchParams('?gateway=127.0.0.1:8787&project=dev');
  const cfg = T.resolveFirebaseConfig(params, sandboxMilkshaConfig());
  assert.equal(cfg.useEmulator, true);
  assert.ok(cfg.functionsBaseUrl.indexOf('127.0.0.1:8787') >= 0);
});
