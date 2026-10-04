'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCoord() {
  const code = fs.readFileSync(path.join(__dirname, '../js/transport/local-poc-coord.js'), 'utf8');
  const storage = new Map();
  const localStorage = {
    getItem(k) {
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem(k, v) {
      storage.set(k, String(v));
    },
    key(i) {
      return [...storage.keys()][i] || null;
    },
    get length() {
      return storage.size;
    },
  };
  const root = { localStorage, QMS: { Transport: {} } };
  vm.runInNewContext(code, root, { filename: 'local-poc-coord.js' });
  return { Coord: root.QMS.Transport.LocalPocCoord, storage, localStorage };
}

test('publish and read poc target', () => {
  const { Coord, localStorage } = loadCoord();
  Coord.publishLocalPocTarget(localStorage, { storeId: 's120030', deviceId: 'stb-01' });
  const poc = Coord.readLocalPocTarget(localStorage);
  assert.equal(poc.storeId, 's120030');
  assert.equal(poc.deviceId, 'stb-01');
});

test('findForeignRecentHeartbeat ignores expected store', () => {
  const { Coord, localStorage } = loadCoord();
  localStorage.setItem(
    'milksha:local:device:s110012:stb-01',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
  );
  const foreign = Coord.findForeignRecentHeartbeat(localStorage, 's120030', 300000);
  assert.equal(foreign.storeId, 's110012');
});

test('resolveLocalDeviceContext prefers poc target on home board', () => {
  const { Coord, localStorage } = loadCoord();
  Coord.publishLocalPocTarget(localStorage, { storeId: 's120030', deviceId: 'stb-01' });
  const ctx = Coord.resolveLocalDeviceContext(localStorage, { homeBoard: true, fallbackStoreId: 's110012' });
  assert.equal(ctx.storeId, 's120030');
});
