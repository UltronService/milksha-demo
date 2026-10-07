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
    Date: Date,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/auth-session.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.createAuthSession;
}

test('accessDenied403 does not call devLogin on every ensureIdToken', async function () {
  let devLoginCalls = 0;
  const create = loadAuthSession(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ code: 'forbidden', message: 'nope' }),
      };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(
    { functionsBaseUrl: 'http://127.0.0.1:8787/fn/', apiKey: 'k' },
    { storeId: 's120030', role: 'device', deviceId: 'stb-01' },
  );
  await assert.rejects(session.ensureIdToken());
  assert.equal(devLoginCalls, 1);
  await assert.rejects(session.ensureIdToken());
  assert.equal(devLoginCalls, 1);
  session.prepareScheduledAuthRecheck();
  await assert.rejects(session.ensureIdToken());
  assert.equal(devLoginCalls, 2);
});
