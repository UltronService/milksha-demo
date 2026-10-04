'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAuthSession() {
  const sandbox = {
    URL: URL,
    globalThis: {},
    localStorage: {
      getItem: function () {
        return null;
      },
      setItem: function () {},
      removeItem: function () {},
    },
    fetch: async function () {
      return { ok: false, status: 500, text: async () => '' };
    },
    location: { hostname: 'ultronservice.github.io', protocol: 'https:' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/auth-session.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.createAuthSession;
}

test('devLogin refuses non-https target URL', async function () {
  const create = loadAuthSession();
  const session = create(
    {
      functionsBaseUrl: 'http://evil.example/fn/',
      apiKey: 'k',
      identityToolkitBaseUrl: 'https://identitytoolkit.googleapis.com/v1',
    },
    { storeId: 's120030', role: 'device', deviceId: 'stb-01', accessCode: 'fake-code' },
  );
  await assert.rejects(session.devLogin(), function (err) {
    return err.status === 400 && err.response.code === 'insecure_transport';
  });
});

test('devLogin allows http localhost emulator target', async function () {
  const create = loadAuthSession();
  let hit = false;
  const sandbox = {
    URL: URL,
    globalThis: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hostname: '127.0.0.1', protocol: 'http:' },
    fetch: async function () {
      hit = true;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/config-resolve.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/auth-session.js'), 'utf8'), sandbox);
  const session = sandbox.QMS.Transport.createAuthSession(
    { functionsBaseUrl: 'http://127.0.0.1:8787/fn/', apiKey: 'k' },
    { storeId: 's120030', role: 'device', deviceId: 'stb-01', accessCode: 'fake' },
  );
  const token = await session.devLogin();
  assert.equal(token, 'tok');
  assert.equal(hit, true);
});
