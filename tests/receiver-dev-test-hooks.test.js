'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadConfigResolve(hostname) {
  const sandbox = {
    globalThis: {},
    location: { hostname: hostname, search: '' },
    MILKSHA_FIREBASE_CONFIG: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/cloud-settings.js'), 'utf8'),
    sandbox,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport;
}

test('isDevEndpointOverrideAllowed is false on production-like hostnames', function () {
  const Transport = loadConfigResolve('shop.milksha.com');
  assert.equal(Transport.isDevEndpointOverrideAllowed(), false);
});

test('isDevEndpointOverrideAllowed is true on localhost', function () {
  const Transport = loadConfigResolve('127.0.0.1');
  assert.equal(Transport.isDevEndpointOverrideAllowed(), true);
});
