import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadRealtimeSync(bridge) {
  const pathsSrc = readFileSync(join(root, 'js/transport/paths.js'), 'utf8');
  const boardSrc = readFileSync(join(root, 'js/board/today-board.js'), 'utf8');
  const syncSrc = readFileSync(join(root, 'controller/controller-realtime-sync.js'), 'utf8');
  const sandbox = {
    globalThis: {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${pathsSrc}\n${boardSrc}`, sandbox);
  sandbox.QMS.Transport.FirebaseSdkBridge = bridge;
  vm.runInContext(syncSrc, sandbox);
  return sandbox.QMS.Controller.RealtimeSync.createControllerRealtimeSync;
}

test('board snapshot invokes onBoardDoc without REST', async () => {
  let boardCb = null;
  const boardDoc = {
    onSnapshot: (onNext) => {
      boardCb = onNext;
      onNext({
        exists: false,
        data: () => null,
        metadata: {},
        updateTime: { toMillis: () => 0 },
      });
      return () => {};
    },
    get: async () => ({ exists: false }),
  };
  const deviceDoc = {
    onSnapshot: (onNext) => {
      onNext({ exists: false });
      return () => {};
    },
    get: async () => ({ exists: false }),
  };
  const db = {
    doc: (path) => {
      if (path.includes('today_board')) {
        return boardDoc;
      }
      return deviceDoc;
    },
  };
  const create = loadRealtimeSync({
    isSdkLoaded: () => true,
    initApp: () => true,
    ensureFirebaseSignedIn: async () => true,
    firestoreDb: () => db,
  });
  const boardDocs = [];
  const sync = create({
    config: { projectId: 'milksha-qms-dev', apiKey: 'x' },
    storeId: 'zz-qa-store-a',
    deviceId: 'stb-01',
    session: {},
    onBoardDoc: (doc) => {
      boardDocs.push(doc);
    },
    onDeviceDoc: () => {},
    onRealtimeState: () => {},
  });
  const mode = await sync.start();
  assert.equal(mode.boardListen, true);
  assert.equal(mode.deviceListen, true);
  assert.ok(boardCb);
  boardCb({
    exists: true,
    data: () => ({
      seq: 3,
      tickets: [{ no: '1001', status: 'ready', sourceType: 'From_Store_OK' }],
      updatedAt: '2026-10-18T00:00:00.000Z',
    }),
    metadata: { fromCache: false, hasPendingWrites: false },
    updateTime: { toMillis: () => Date.parse('2026-10-18T00:00:00.000Z') },
  });
  const withData = boardDocs.filter((doc) => doc && doc.data);
  assert.equal(withData.length, 1);
  assert.equal(withData[0].data.seq, 3);
  sync.stop();
});

test('listener error after attach notifies disconnect and schedules reconnect', async () => {
  let boardErrCb = null;
  let getCalls = 0;
  const boardDoc = {
    onSnapshot: (onNext, onErr) => {
      boardErrCb = onErr;
      onNext({ exists: false });
      return () => {};
    },
    get: async () => {
      getCalls += 1;
      return { exists: false };
    },
  };
  const deviceDoc = {
    onSnapshot: (onNext) => {
      onNext({ exists: false });
      return () => {};
    },
    get: async () => ({ exists: false }),
  };
  const db = {
    doc: (path) => {
      if (path.includes('today_board')) {
        return boardDoc;
      }
      return deviceDoc;
    },
  };
  const create = loadRealtimeSync({
    isSdkLoaded: () => true,
    initApp: () => true,
    ensureFirebaseSignedIn: async () => true,
    firestoreDb: () => db,
  });
  const states = [];
  const sync = create({
    config: { projectId: 'milksha-qms-dev', apiKey: 'x' },
    storeId: 'zz-qa-ci-store',
    deviceId: 'stb-01',
    session: {},
    onBoardDoc: () => {},
    onDeviceDoc: () => {},
    onRealtimeState: (state) => {
      states.push(state);
    },
    reconnectInitialMs: 50,
  });
  await sync.start();
  assert.ok(boardErrCb);
  boardErrCb(new Error('permission-denied'));
  assert.ok(states.some((s) => s.connected === false && s.reason === 'board_listener_error'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.ok(getCalls >= 1, 'reconnect should forceRefetch at least once');
  sync.stop();
});
