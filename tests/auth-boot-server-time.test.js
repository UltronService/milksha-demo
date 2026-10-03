'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadSessionWithFetch(fetchImpl) {
  const sandbox = {
    globalThis: {},
    URL,
    fetch: fetchImpl,
    localStorage: {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
      removeItem(k) {
        delete this._data[k];
      },
    },
    location: { hostname: '127.0.0.1' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/auth-session.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.createAuthSession(
    {
      functionsBaseUrl: 'https://127.0.0.1/fn/p/r/',
      identityToolkitBaseUrl: 'https://127.0.0.1/identity/v1',
      apiKey: 'k',
    },
    { storeId: 's1', role: 'device', deviceId: 'stb-01', accessCode: 'c' },
  );
}

test('devLogin captures HTTP Date as bootServerTimeMs', async function () {
  const session = loadSessionWithFetch(async function () {
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'date' ? 'Sat, 03 Oct 2026 12:00:00 GMT' : '') },
      text: async () => JSON.stringify({ customToken: 'tok' }),
    };
  });
  await session.devLogin();
  assert.equal(session.getBootServerTimeMs(), Date.parse('Sat, 03 Oct 2026 12:00:00 GMT'));
});
