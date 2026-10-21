'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAuthStack(fetchImpl) {
  const storage = {};
  const sandbox = {
    URL: URL,
    TextEncoder: TextEncoder,
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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/cloud-resync-auth.js'), 'utf8'), sandbox);
  return {
    create: sandbox.QMS.Transport.createAuthSession,
    runResyncAuthStep: sandbox.QMS.Receiver.runResyncAuthStep,
    storage,
  };
}

function signInOk(idToken) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => '' },
    text: async () =>
      JSON.stringify({
        idToken: idToken || 'cached-id',
        refreshToken: 'ref',
        expiresIn: 3600,
      }),
  };
}

const sessionConfig = {
  functionsBaseUrl: 'https://asia-east1-example.cloudfunctions.net/',
  identityToolkitBaseUrl: 'https://identitytoolkit.googleapis.com/v1',
  secureTokenBaseUrl: 'https://securetoken.googleapis.com/v1',
  apiKey: 'k',
};

const sessionCreds = {
  storeId: 'c030020',
  role: 'device',
  deviceId: 'stb-01',
  accessCode: 'code',
};

test('T1 resync auth step does not devLogin when session cache is valid', async function () {
  let devLoginCalls = 0;
  const { create, runResyncAuthStep } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  const afterBoot = devLoginCalls;
  let polls = 0;
  for (let i = 0; i < 6; i += 1) {
    await runResyncAuthStep(
      session,
      async function () {
        await session.ensureIdToken();
      },
      function () {
        polls += 1;
      },
    );
  }
  assert.equal(devLoginCalls, afterBoot);
  assert.equal(polls, 6);
});

test('T2 token reused until near expiry without devLogin', async function () {
  let devLoginCalls = 0;
  let refreshCalls = 0;
  const { create } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    if (u.indexOf('securetoken.googleapis.com') >= 0) {
      refreshCalls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({ id_token: 'refreshed-id', refresh_token: 'ref', expires_in: 3600 }),
      };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  for (let i = 0; i < 5; i += 1) {
    const tok = await session.ensureIdToken();
    assert.equal(tok, 'cached-id');
  }
  assert.equal(devLoginCalls, 1);
  assert.equal(refreshCalls, 0);
  assert.equal(session.hasUsableCachedIdToken(), true);
});

test('T3 expired cache uses refresh not devLogin when refresh succeeds', async function () {
  let devLoginCalls = 0;
  let refreshCalls = 0;
  const { create, storage } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    if (u.indexOf('securetoken.googleapis.com') >= 0) {
      refreshCalls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({ id_token: 'refreshed-id', refresh_token: 'ref', expires_in: 3600 }),
      };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  assert.equal(devLoginCalls, 1);
  const key = Object.keys(storage).find((k) => k.indexOf('milksha:auth:') === 0);
  assert.ok(key);
  const parsed = JSON.parse(storage[key]);
  parsed.expiresAtMs = Date.now() - 1000;
  storage[key] = JSON.stringify(parsed);
  const tok = await session.ensureIdToken();
  assert.equal(tok, 'refreshed-id');
  assert.equal(devLoginCalls, 1);
  assert.equal(refreshCalls, 1);
});

test('T4 real 401 refresh with no usable cache performs devLogin', async function () {
  let devLoginCalls = 0;
  const { create, storage } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk('relogin-id');
    }
    if (u.indexOf('securetoken.googleapis.com') >= 0) {
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'invalid_grant' }),
      };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  const key = Object.keys(storage).find((k) => k.indexOf('milksha:auth:') === 0);
  const parsed = JSON.parse(storage[key]);
  parsed.expiresAtMs = Date.now() - 1000;
  parsed.refreshToken = '';
  storage[key] = JSON.stringify(parsed);
  const tok = await session.ensureIdToken();
  assert.equal(tok, 'relogin-id');
  assert.equal(devLoginCalls, 2);
});

test('T5 resync auth step still runs poll hook when cache valid (missed numbers path)', async function () {
  let devLoginCalls = 0;
  const { create, runResyncAuthStep } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  let devicePolls = 0;
  await runResyncAuthStep(session, async function () {
    await session.ensureIdToken();
  }, function () {
    devicePolls += 1;
  });
  assert.equal(devicePolls, 1);
  assert.equal(devLoginCalls, 1);
});

test('T6 resync auth step adds no extra devLogin latency path when cached', async function () {
  let devLoginCalls = 0;
  const { create, runResyncAuthStep } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  const t0 = Date.now();
  await runResyncAuthStep(session, async function () {
    await session.ensureIdToken();
  }, function () {});
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 500, 'cached resync auth should stay fast');
  assert.equal(devLoginCalls, 1);
});

test('T7 auth success poll hook must not chain into devLogin via resync', async function () {
  let devLoginCalls = 0;
  let proactiveRefresh = 0;
  const { create, runResyncAuthStep } = loadAuthStack(async function (url) {
    const u = String(url);
    if (u.indexOf('devLogin') >= 0) {
      devLoginCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customToken: 'tok' }),
      };
    }
    if (u.indexOf('signInWithCustomToken') >= 0) {
      return signInOk();
    }
    if (u.indexOf('securetoken.googleapis.com') >= 0) {
      proactiveRefresh += 1;
      return { ok: false, status: 500, text: async () => '' };
    }
    return { ok: false, status: 500, text: async () => '' };
  });
  const session = create(sessionConfig, sessionCreds);
  await session.ensureIdToken();
  const baseline = devLoginCalls;
  for (let i = 0; i < 4; i += 1) {
    await runResyncAuthStep(
      session,
      async function () {
        await session.ensureIdToken();
      },
      function () {},
    );
  }
  assert.equal(devLoginCalls, baseline);
  assert.equal(proactiveRefresh, 0);
});
