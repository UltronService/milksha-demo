import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadRealtime() {
  const pathsSrc = readFileSync(join(root, 'js/transport/paths.js'), 'utf8');
  const boardSrc = readFileSync(join(root, 'js/board/today-board.js'), 'utf8');
  const rtSrc = readFileSync(join(root, 'js/transport/firestore-realtime.js'), 'utf8');
  const sandbox = { globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(`${pathsSrc}\n${boardSrc}\n${rtSrc}`, sandbox);
  return sandbox.globalThis.QMS.Transport.FirestoreRealtime;
}

test('normalizePendingCommand requires id and type', () => {
  const RT = loadRealtime();
  assert.equal(RT.normalizePendingCommand(null), null);
  assert.equal(RT.normalizePendingCommand({ id: 'x' }), null);
  const cmd = RT.normalizePendingCommand({
    id: 'c1',
    type: 'clear_now',
    boardSeq: 3,
    issuedAtMs: 1000,
  });
  assert.equal(cmd.id, 'c1');
  assert.equal(cmd.boardSeq, 3);
});

test('pendingCommandChanged only when id changes', () => {
  const RT = loadRealtime();
  const a = { id: 'same' };
  assert.equal(RT.pendingCommandChanged(a, { id: 'same' }), false);
  assert.equal(RT.pendingCommandChanged(a, { id: 'other' }), true);
  assert.equal(RT.pendingCommandChanged(null, { id: 'new' }), true);
});

test('realtimeCommandNeedsDevicePoll for slow without delayMs', () => {
  const RT = loadRealtime();
  assert.equal(RT.realtimeCommandNeedsDevicePoll({ id: '1', type: 'clear_now', params: {} }), false);
  assert.equal(
    RT.realtimeCommandNeedsDevicePoll({ id: '1', type: 'slow', params: {} }),
    true,
  );
  assert.equal(
    RT.realtimeCommandNeedsDevicePoll({ id: '1', type: 'slow', params: { delayMs: 500 } }),
    false,
  );
});
