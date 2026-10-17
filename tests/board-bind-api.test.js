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

test('requestBoardBind posts brand store machine via cloudApi', async function () {
  const Transport = loadBoardBindApi();
  let posted = null;
  const api = {
    boardBind: async function (body) {
      posted = body;
      return { storeName: 'QA門市', storeNumber: 'zz-qa-store-a', isFirstBind: true };
    },
  };
  const result = await Transport.BoardBindApi.requestBoardBind(api, {
    brandId: 'milksha',
    storeId: 'zz-qa-store-a',
    machineId: 'machine-a',
  });
  assert.equal(posted.brandId, 'milksha');
  assert.equal(posted.storeId, 'zz-qa-store-a');
  assert.equal(posted.machineId, 'machine-a');
  assert.equal(result.isFirstBind, true);
  assert.equal(result.storeName, 'QA門市');
});
