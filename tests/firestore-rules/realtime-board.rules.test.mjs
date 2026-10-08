/**
 * Firestore security rules (milksha-cloud PR #18 @ 9ed72a1).
 * Run: npm run test:rules (firebase emulators:exec + Java)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';

const rulesPath = join(dirname(fileURLToPath(import.meta.url)), 'firestore.rules');
const rules = readFileSync(rulesPath, 'utf8');
const PROJECT = 'milksha-qms-dev';

function deviceClaims(storeId, deviceId) {
  return {
    storeId: storeId,
    deviceId: deviceId,
    role: 'device',
    firebase: { sign_in_provider: 'custom' },
  };
}

function controllerClaims(storeId) {
  return {
    storeId: storeId,
    deviceId: 'controller-web',
    role: 'controller',
    firebase: { sign_in_provider: 'custom' },
  };
}

async function openEnv() {
  const firestoreCfg = { rules };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    firestoreCfg.host = '127.0.0.1';
    firestoreCfg.port = 8080;
  }
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: firestoreCfg,
  });
}

async function expectDenied(run) {
  try {
    await run();
    assert.fail('expected permission-denied');
  } catch (e) {
    assert.equal(e.code, 'permission-denied', String(e.message || e));
  }
}

test('device token: own board + control/pending', async () => {
  const env = await openEnv();
  const db = env.authenticatedContext('dev-a', deviceClaims('zz-qa-store-a', 'stb-01')).firestore();
  await assertSucceeds(db.doc('stores/zz-qa-store-a/board/today_board').get());
  await assertSucceeds(db.doc('stores/zz-qa-store-a/devices/stb-01/control/pending').get());
  await env.cleanup();
});

test('device token: cross-store and cross-device denied', async () => {
  const env = await openEnv();
  const own = env.authenticatedContext('dev-a', deviceClaims('zz-qa-store-a', 'stb-01')).firestore();
  await expectDenied(() => own.doc('stores/zz-qa-store-b/board/today_board').get());
  const other = env.authenticatedContext('dev-b', deviceClaims('zz-qa-store-b', 'stb-01')).firestore();
  await expectDenied(() => other.doc('stores/zz-qa-store-a/board/today_board').get());
  const wrongDev = env.authenticatedContext('dev-a2', deviceClaims('zz-qa-store-a', 'stb-02')).firestore();
  await expectDenied(() => wrongDev.doc('stores/zz-qa-store-a/devices/stb-01/control/pending').get());
  await env.cleanup();
});

test('unauthenticated and writes denied', async () => {
  const env = await openEnv();
  const unauth = env.unauthenticatedContext().firestore();
  await expectDenied(() => unauth.doc('stores/zz-qa-store-a/board/today_board').get());
  const own = env.authenticatedContext('dev-a', deviceClaims('zz-qa-store-a', 'stb-01')).firestore();
  await expectDenied(() => own.collection('stores/zz-qa-store-a/devices').get());
  await expectDenied(() => own.doc('stores/zz-qa-store-a/board/today_board').set({ seq: 1 }));
  await expectDenied(() =>
    own.doc('stores/zz-qa-store-a/devices/stb-01/control/pending').set({ id: 'x' }),
  );
  await env.cleanup();
});

test('controller: board yes, control/pending no', async () => {
  const env = await openEnv();
  const ctrl = env.authenticatedContext('ctrl', controllerClaims('zz-qa-store-a')).firestore();
  await assertSucceeds(ctrl.doc('stores/zz-qa-store-a/board/today_board').get());
  await expectDenied(() => ctrl.doc('stores/zz-qa-store-a/devices/stb-01/control/pending').get());
  await env.cleanup();
});
