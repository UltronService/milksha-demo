'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCloudSettings() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const sandbox = {
    globalThis: {},
    localStorage,
    location: { hash: '', pathname: '/receiver-demo/', search: '?mode=cloud', replaceState: () => {} },
    history: { replaceState: () => {} },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'cloud-settings.js'), 'utf8'), sandbox);
  return { CS: sandbox.QMS.Transport.CloudSettings, storage, sandbox };
}

test('cloud settings round-trip and hash import', function () {
  const { CS, sandbox } = loadCloudSettings();
  CS.save({
    projectId: 'demo-proj',
    apiKey: 'key-abc',
    region: 'asia-east1',
    accessCode: 'secret-code',
  });
  assert.equal(CS.isComplete(CS.load()), true);
  const hash = CS.encodeCfgHash(CS.load());
  sandbox.location.hash = '#cfg=' + hash;
  assert.equal(CS.applyHashImport(), true);
  const loaded = CS.load();
  assert.equal(loaded.projectId, 'demo-proj');
  assert.equal(loaded.accessCode, 'secret-code');
});

test('board setup hash never contains POS signing key', function () {
  const { CS, sandbox } = loadCloudSettings();
  const posKey = 'user-pos-sign-key-unique-xyz-99';
  CS.save({
    projectId: 'demo-proj',
    apiKey: 'web-api-key-abc',
    region: 'asia-east1',
    accessCode: 'access-only',
    posSignSecret: posKey,
    posSignKey: posKey,
  });
  const hash = CS.encodeCfgHash(CS.load());
  const setupUrl = 'https://example.com/r#cfg=' + hash;
  assert.equal(setupUrl.indexOf(posKey), -1);
  assert.equal(CS.hashContainsForbiddenSecrets(setupUrl, [posKey]), false);
  const decoded = CS.decodeCfgHash('#cfg=' + hash);
  assert.equal(decoded.posSignSecret, undefined);
  assert.equal(decoded.posSignKey, undefined);
  const payload = CS.cfgPayload(
    Object.assign(CS.load(), { posSignSecret: posKey, posSigningKey: posKey }),
  );
  assert.deepEqual(Object.keys(payload).sort(), ['accessCode', 'apiKey', 'projectId', 'region']);
});

test('production endpoints match Firebase functions URL pattern', function () {
  const { CS } = loadCloudSettings();
  const ep = CS.productionEndpoints('milksha-qms-dev', 'asia-east1');
  assert.equal(ep.functionsBaseUrl, 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/');
  assert.ok(ep.firestoreRestBase.includes('firestore.googleapis.com'));
});
