'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBoardBindApi() {
  const sandbox = {
    fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
    globalThis: {},
    Promise: Promise,
    Error: Error,
    crypto: { randomUUID: () => 'uuid-1' },
    Date: Date,
    Intl: Intl,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'cloud-api.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'board-bind-api.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport;
}

test('requestBoardAutoPair posts brand storeNumber deviceId via cloudApi', async function () {
  const Transport = loadBoardBindApi();
  let posted = null;
  const api = {
    boardAutoPair: async function (body) {
      posted = body;
      return {
        ok: true,
        storeId: 'zz-qa-store-a',
        storeName: 'QA門市',
        storeNumber: 'store-a-num',
        isFirstBind: true,
        customToken: 'tok-1',
      };
    },
  };
  const result = await Transport.BoardBindApi.requestBoardAutoPair(api, {
    brand: 'Milksha',
    storeNumber: 'zz-qa-store-a',
    deviceId: 'stb-01',
  });
  assert.equal(posted.brand, 'Milksha');
  assert.equal(posted.storeNumber, 'zz-qa-store-a');
  assert.equal(posted.deviceId, 'stb-01');
  assert.equal(result.isFirstBind, true);
  assert.equal(result.storeName, 'QA門市');
  assert.equal(result.storeNumber, 'store-a-num');
  assert.equal(result.customToken, 'tok-1');
});

test('requestBoardAutoPair ok false throws pairOkFalse', async function () {
  const Transport = loadBoardBindApi();
  const api = {
    boardAutoPair: async function () {
      return { ok: false, information: '找不到目標叫號機' };
    },
  };
  await assert.rejects(
    () =>
      Transport.BoardBindApi.requestBoardAutoPair(api, {
        brand: 'Milksha',
        storeNumber: 'missing',
        deviceId: 'stb-01',
      }),
    (err) => {
      assert.equal(err.pairOkFalse, true);
      assert.match(err.message, /找不到目標叫號機/);
      return true;
    },
  );
});
