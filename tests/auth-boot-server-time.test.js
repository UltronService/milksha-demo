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

test('bootServerTimeMs is set only from the first cloud response', async function () {
  let call = 0;
  const session = loadSessionWithFetch(async function () {
    call += 1;
    const date =
      call === 1 ? 'Sat, 03 Oct 2026 12:00:00 GMT' : 'Sat, 03 Oct 2026 13:00:00 GMT';
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'date' ? date : '') },
      text: async () => JSON.stringify({ customToken: 'tok' }),
    };
  });
  await session.devLogin();
  const first = session.getBootServerTimeMs();
  await session.devLogin();
  assert.equal(session.getBootServerTimeMs(), first);
  assert.equal(first, Date.parse('Sat, 03 Oct 2026 12:00:00 GMT'));
});

test('missing Date header leaves bootServerTimeMs at zero', async function () {
  const session = loadSessionWithFetch(async function () {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '' },
      text: async () => JSON.stringify({ customToken: 'tok' }),
    };
  });
  await session.devLogin();
  assert.equal(session.getBootServerTimeMs(), 0);
});

test('noteBootServerTimeFromResponse keeps full millisecond precision within the same second', function () {
  const session = loadSessionWithFetch(async function () {
    return { ok: false, status: 500, text: async () => '' };
  });
  const parsed = Date.parse('Sat, 03 Oct 2026 12:00:00.500 GMT');
  session.noteBootServerTimeFromResponse({
    headers: { get: () => 'Sat, 03 Oct 2026 12:00:00.500 GMT' },
  });
  assert.equal(session.getBootServerTimeMs(), parsed);
  assert.notEqual(session.getBootServerTimeMs(), Date.parse('Sat, 03 Oct 2026 12:00:00 GMT'));
});
