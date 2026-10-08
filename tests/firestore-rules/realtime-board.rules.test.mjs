/**
 * Firestore rules draft (see realtime-board.rules). Replace with milksha-cloud firestore.rules when published.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), 'firestore.rules');
const rules = readFileSync(rulesPath, 'utf8');

let testing;
try {
  testing = await import('@firebase/rules-unit-testing');
} catch (e) {
  test('rules-unit-testing package optional in CI', { skip: 'no @firebase/rules-unit-testing' }, () => {});
}

if (testing) {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = testing;

  test('board device token: own store read ok; other store denied; no writes', async (t) => {
    try {
      const probe = await fetch('http://127.0.0.1:8080');
      if (!probe.ok) {
        t.skip('firestore emulator not running on :8080');
      }
    } catch (e) {
      t.skip('firestore emulator not running on :8080');
    }
    const env = await initializeTestEnvironment({
      projectId: 'milksha-rules-test',
      firestore: { rules, host: '127.0.0.1', port: 8080 },
    });
    const own = env.authenticatedContext('board-a', {
      token: { storeId: 'zz-qa-store-a', deviceId: 'stb-01', role: 'device' },
    });
    const other = env.authenticatedContext('board-b', {
      token: { storeId: 'zz-qa-store-b', deviceId: 'stb-01', role: 'device' },
    });
    await assertSucceeds(
      own.firestore().doc('stores/zz-qa-store-a/board/today_board').get(),
    );
    await assertFails(
      own.firestore().doc('stores/zz-qa-store-b/board/today_board').get(),
    );
    await assertSucceeds(
      own.firestore().doc('stores/zz-qa-store-a/devices/stb-01').get(),
    );
    await assertSucceeds(
      own.firestore().doc('stores/zz-qa-store-a/devices/stb-01/control/pending').get(),
    );
    await assertFails(
      own.firestore().collection('stores/zz-qa-store-a/devices').get(),
    );
    await assertFails(
      own.firestore().doc('stores/zz-qa-store-a/board/today_board').set({ seq: 1 }),
    );
    await env.cleanup();
  });
}
