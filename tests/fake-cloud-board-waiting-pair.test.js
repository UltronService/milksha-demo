'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { QA_WAITING_STORE, CLOUD_WAITING_PAIR_BODY } = require('./helpers/waiting-pair-contract.js');

const ROOT = join(__dirname, '..');
const PORT = 18788;
let proc;

async function waitHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('fake-cloud not up');
}

async function postBoardAutoPair(body) {
  const res = await fetch(
    `http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/boardAutoPair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}

before(async () => {
  proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitHealth();
  await fetch(`http://127.0.0.1:${PORT}/test/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedDevice: true }),
  });
});

after(() => {
  if (proc && proc.exitCode === null) {
    proc.kill('SIGTERM');
  }
});

test('item 10/14 baseline: unregistered s999998 returns waiting_pair (not 找不到目標叫號機)', async function () {
  const json = await postBoardAutoPair({
    brand: 'Milksha',
    storeNumber: QA_WAITING_STORE,
    deviceId: 'unit-wait-red-01',
  });
  assert.equal(json.ok, CLOUD_WAITING_PAIR_BODY.ok);
  assert.equal(json.code, CLOUD_WAITING_PAIR_BODY.code);
});
