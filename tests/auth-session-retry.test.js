'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAuthSession(fetchImpl) {
  const storage = {};
  const sandbox = {
    URL: URL,
    globalThis: {},
    localStorage: {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => {
        storage[k] = String(v);
      },
      removeItem: (k) => {
        delete storage[k];
      },
    },
    location: { hostname: '127.0.0.1', protocol: 'http:' },
    fetch: fetchImpl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/auth-session.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.createAuthSession;
}

test('successful login resets devLoginAttempts so a later 401 retries once', async function () {
  let devLoginCalls = 0;
  const create = loadAuthSession(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      if (devLoginCalls === 2 || devLoginCalls === 3) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ code: 'invalid_token' }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ idToken: 'id', refreshToken: 'ref', expiresIn: 3600 }),
      };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(
    { functionsBaseUrl: 'http://127.0.0.1:8787/fn/', apiKey: 'k' },
    { storeId: 's120030', role: 'device', deviceId: 'stb-01', accessCode: 'code' },
  );
  const token = await session.devLogin();
  assert.equal(token, 'tok');
  await assert.rejects(session.devLogin());
  assert.equal(devLoginCalls, 2);
  assert.equal(session.isAuthStopped(), false);
  await assert.rejects(session.devLogin());
  assert.equal(devLoginCalls, 3);
  assert.equal(session.isAuthStopped(), true);
});
