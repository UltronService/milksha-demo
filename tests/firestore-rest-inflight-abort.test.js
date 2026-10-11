'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadFirestoreRest(fetchImpl) {
  const sandbox = {
    globalThis: {},
    AbortController: AbortController,
    fetch: fetchImpl,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/firestore-value.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/firestore-rest.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.FirestoreRest;
}

test('getDocument aborts prior in-flight GET for the same path when a newer GET starts', async function () {
  /** @type {Map<number, () => void>} */
  const releaseByUrl = new Map();
  let fetchCalls = 0;

  const Rest = loadFirestoreRest(async function mockFetch(url, init) {
    fetchCalls += 1;
    const signal = init && init.signal;
    const callId = fetchCalls;
    await new Promise(function (resolve) {
      releaseByUrl.set(callId, resolve);
    });
    if (signal && signal.aborted) {
      const err = new Error('signal is aborted without reason');
      err.name = 'AbortError';
      throw err;
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => '' },
      json: async () => ({
        fields: { seq: { integerValue: '1' }, tickets: { arrayValue: { values: [] } } },
        updateTime: 't',
      }),
    };
  });

  const client = Rest.createFirestoreRestClient({
    config: { projectId: 'p', apiKey: 'k' },
  });
  const path = 'stores/s1/board/today_board';
  const first = client.getDocument(path);
  const second = client.getDocument(path);
  const firstRejection = first.then(
    () => {
      throw new Error('first should reject');
    },
    (e) => e,
  );
  releaseByUrl.get(2)();
  await new Promise((r) => setTimeout(r, 0));
  releaseByUrl.get(1)();
  const err = await firstRejection;
  assert.equal(err.name, 'AbortError');
  assert.match(String(err.message), /aborted/i);
  const secondDoc = await second;
  assert.ok(secondDoc && secondDoc.data);
  assert.equal(fetchCalls, 2);
});

test('getDocument maps aborted fetch TypeError to AbortError', async function () {
  const Rest = loadFirestoreRest(async function mockFetch(url, init) {
    const signal = init && init.signal;
    if (signal) {
      signal.addEventListener('abort', function () {
        /* wait until aborted */
      });
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
    if (signal && signal.aborted) {
      throw new TypeError('Failed to fetch');
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => '' },
      json: async () => ({ fields: {}, updateTime: 't' }),
    };
  });

  const client = Rest.createFirestoreRestClient({
    config: { projectId: 'p', apiKey: 'k' },
  });
  const path = 'stores/s1/board/today_board';
  const first = client.getDocument(path);
  const second = client.getDocument(path);
  const err = await first.catch((e) => e);
  assert.equal(err.name, 'AbortError');
  await second;
});
