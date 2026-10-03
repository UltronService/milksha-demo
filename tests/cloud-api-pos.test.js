'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

test('posReceiver returns JSON body on HTTP 200 even when isSuccess is false', async function () {
  const sandbox = {
    globalThis: {},
    fetch: async function () {
      return {
        ok: true,
        status: 200,
        text: async function () {
          return JSON.stringify({ isSuccess: false, information: '目標叫號機尚未連線' });
        },
      };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'cloud-api.js'), 'utf8'), sandbox);
  const api = sandbox.QMS.Transport.createCloudApi(
    { functionsBaseUrl: 'https://example.com/' },
    { authHeaders: async () => ({}) },
  );
  const res = await api.posReceiver({ hello: 1 });
  assert.equal(res.isSuccess, false);
  assert.match(res.information, /尚未連線/);
});
