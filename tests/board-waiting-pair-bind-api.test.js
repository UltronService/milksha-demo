'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  CLOUD_WAITING_PAIR_BODY,
  CLOUD_INVALID_STORE_FORMAT_BODY,
  QA_WAITING_STORE,
} = require('./helpers/waiting-pair-contract.js');

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
  const waitingPath = path.join(ROOT, 'js', 'board', 'board-waiting-pair.js');
  assert.ok(fs.existsSync(waitingPath), 'board-waiting-pair.js required for bind-api waiting flow');
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(waitingPath, 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'cloud-api.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'board-bind-api.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.BoardBindApi;
}

test('item 17: requestBoardAutoPair waiting_pair throws pairWaiting not pairOkFalse', async function () {
  const BoardBindApi = loadBoardBindApi();
  const api = {
    boardAutoPair: async function () {
      return CLOUD_WAITING_PAIR_BODY;
    },
  };
  await assert.rejects(
    () =>
      BoardBindApi.requestBoardAutoPair(api, {
        brand: 'Milksha',
        storeNumber: QA_WAITING_STORE,
        deviceId: 'stb-wait-red',
      }),
    (err) => {
      assert.equal(err.pairWaiting, true);
      assert.notEqual(err.pairOkFalse, true);
      return true;
    },
  );
});

test('item 17: requestBoardAutoPair invalid_store_format throws pairInvalidStoreFormat', async function () {
  const BoardBindApi = loadBoardBindApi();
  const api = {
    boardAutoPair: async function () {
      return CLOUD_INVALID_STORE_FORMAT_BODY;
    },
  };
  await assert.rejects(
    () =>
      BoardBindApi.requestBoardAutoPair(api, {
        brand: 'Milksha',
        storeNumber: 's0305769',
        deviceId: 'stb-fmt-red',
      }),
    (err) => {
      assert.equal(err.pairInvalidStoreFormat, true);
      return true;
    },
  );
});
