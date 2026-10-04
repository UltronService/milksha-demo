'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCloudApi(fetchImpl) {
  const sandbox = {
    fetch: fetchImpl,
    globalThis: {},
    Promise: Promise,
    Error: Error,
    Object: Object,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/cloud-api.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.createCloudApi;
}

test('devCommand retries once on 401 after refresh', async function () {
  let refreshCalls = 0;
  let devCommandCalls = 0;
  const session = {
    authHeaders: async function () {
      return { Authorization: 'Bearer tok' };
    },
    refreshIdToken: async function () {
      refreshCalls += 1;
    },
  };
  const fetch401ThenOk = async function () {
    devCommandCalls += 1;
    if (devCommandCalls === 1) {
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 'invalid_token', message: 'login expired' }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  const create = loadCloudApi(fetch401ThenOk);
  const api = create({ functionsBaseUrl: 'https://example.test/fn/' }, session);
  const ok = await api.devCommand({ storeId: 's1', deviceId: 'stb-01', type: 'restore' });
  assert.equal(ok.ok, true);
  assert.equal(devCommandCalls, 2);
  assert.equal(refreshCalls, 1);
});

test('devCommand does not refresh on 403', async function () {
  let refreshCalls = 0;
  let devCommandCalls = 0;
  const session = {
    authHeaders: async function () {
      return { Authorization: 'Bearer tok' };
    },
    refreshIdToken: async function () {
      refreshCalls += 1;
    },
  };
  const fetch403 = async function () {
    devCommandCalls += 1;
    return {
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ code: 'forbidden', message: 'no permission' }),
    };
  };
  const create = loadCloudApi(fetch403);
  const api = create({ functionsBaseUrl: 'https://example.test/fn/' }, session);
  await assert.rejects(
    function () {
      return api.devCommand({ storeId: 's1', deviceId: 'stb-01', type: 'restore' });
    },
    function (err) {
      assert.equal(err.status, 403);
      return true;
    },
  );
  assert.equal(devCommandCalls, 1);
  assert.equal(refreshCalls, 0);
});
