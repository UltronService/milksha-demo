import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadCreateListener(bridge) {
  const pathsSrc = readFileSync(join(root, 'js/transport/paths.js'), 'utf8');
  const boardSrc = readFileSync(join(root, 'js/board/today-board.js'), 'utf8');
  const rtSrc = readFileSync(join(root, 'js/transport/firestore-realtime.js'), 'utf8');
  const sandbox = { globalThis: {}, setTimeout: setTimeout, clearTimeout: clearTimeout };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${pathsSrc}\n${boardSrc}`, sandbox);
  sandbox.QMS.Transport.FirebaseSdkBridge = bridge;
  vm.runInContext(rtSrc, sandbox);
  return sandbox.QMS.Transport.FirestoreRealtime.createFirestoreRealtimeListener;
}

test('auth_failed: falls back to poll (permission / sign-in denied)', async () => {
  const create = loadCreateListener({
    isSdkLoaded: () => true,
    initApp: () => true,
    ensureFirebaseSignedIn: async () => false,
    firestoreDb: () => ({}),
  });
  let boardFallback = '';
  const listener = create({
    config: {},
    storeId: 'zz-qa-store-a',
    deviceId: 'stb-01',
    session: {},
    onBoardSnapshot: () => {},
    onCommandSnapshot: () => {},
    onBoardFallback: (reason) => {
      boardFallback = reason;
    },
    onCommandPollFallback: () => {},
  });
  const mode = await listener.start();
  assert.equal(mode.boardListen, false);
  assert.equal(mode.commandMode, 'poll');
  assert.equal(boardFallback, 'auth_failed');
});

test('sdk_missing: poll fallback', async () => {
  const create = loadCreateListener({ isSdkLoaded: () => false });
  const listener = create({
    config: {},
    storeId: 'zz-qa-store-a',
    deviceId: 'stb-01',
    session: {},
    onBoardSnapshot: () => {},
    onCommandSnapshot: () => {},
    onBoardFallback: () => {},
    onCommandPollFallback: () => {},
  });
  const mode = await listener.start();
  assert.equal(mode.boardListen, false);
  assert.equal(mode.commandMode, 'poll');
});

test('pendingCommandChanged: ack delete does not re-fire same id', () => {
  const pathsSrc = readFileSync(join(root, 'js/transport/paths.js'), 'utf8');
  const boardSrc = readFileSync(join(root, 'js/board/today-board.js'), 'utf8');
  const rtSrc = readFileSync(join(root, 'js/transport/firestore-realtime.js'), 'utf8');
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${pathsSrc}\n${boardSrc}\n${rtSrc}`, sandbox);
  const RT = sandbox.QMS.Transport.FirestoreRealtime;
  const a = { id: 'cmd-1' };
  assert.equal(RT.pendingCommandChanged(a, { id: 'cmd-1' }), false);
  assert.equal(RT.pendingCommandChanged(a, { id: 'cmd-2' }), true);
});

test('onBoardSnapshot path: seq+1 with same ticket number still normalizes', () => {
  const pathsSrc = readFileSync(join(root, 'js/transport/paths.js'), 'utf8');
  const boardSrc = readFileSync(join(root, 'js/board/today-board.js'), 'utf8');
  const rtSrc = readFileSync(join(root, 'js/transport/firestore-realtime.js'), 'utf8');
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${pathsSrc}\n${boardSrc}\n${rtSrc}`, sandbox);
  const TodayBoard = sandbox.QMS.Board.TodayBoard;
  const norm10 = TodayBoard.normalizeTodayBoard({
    seq: 10,
    storeId: 'zz-qa-store-a',
    businessDate: '2026-10-08',
    updatedAt: new Date().toISOString(),
    source: 'A',
    tickets: [{ no: '777', status: 'ready', updatedAt: new Date().toISOString() }],
  });
  const norm11 = TodayBoard.normalizeTodayBoard({
    seq: 11,
    storeId: 'zz-qa-store-a',
    businessDate: '2026-10-08',
    updatedAt: new Date().toISOString(),
    source: 'A',
    tickets: [{ no: '777', status: 'ready', updatedAt: new Date().toISOString() }],
  });
  assert.equal(norm10.ok, true);
  assert.equal(norm11.ok, true);
  assert.equal(norm10.board.seq, 10);
  assert.equal(norm11.board.seq, 11);
});
