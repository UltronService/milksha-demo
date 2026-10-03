'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const crypto = require('node:crypto');

const ROOT = join(__dirname, '..');
const PORT = 18787;
let SIGN_SECRET = '';

before(async () => {
  const mod = await import('../tools/fake-cloud/sign-secret.mjs');
  SIGN_SECRET = mod.FAKE_CLOUD_POS_SIGN_SECRET;
});

function md5Hex(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function buildWire(inner, secret) {
  const innerText = JSON.stringify(inner);
  const md5Hash = md5Hex(innerText);
  const timeStmp = '2026-10-03-12-00-00:0000';
  const merchant_id = 'm1';
  const account = 's120030';
  const canon = `${merchant_id}|${account}|${timeStmp}|${md5Hash}`;
  const signature = crypto.createHmac('sha256', secret).update(canon, 'utf8').digest('base64');
  return (
    '{"isEncrypt":false,"serviceSpecialData_Json":' +
    innerText +
    ',"merchant_id":"' +
    merchant_id +
    '","account":"' +
    account +
    '","timeStmp":"' +
    timeStmp +
    '","serviceSpecialData_Json_Md5Hash":"' +
    md5Hash +
    '","signature":"' +
    signature +
    '"}'
  );
}

async function waitHealth() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('fake-cloud not up');
}

test('posReceiver does not write board when no box is online', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const secret = SIGN_SECRET;
    const inner = {
      target: 'milkshas120030',
      data: { number_content: [{ source_type: 'From_Store_Preparing', number: '9001' }] },
    };
    const wire = buildWire(inner, secret);
    const res = await fetch(
      `http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/posReceiver`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: wire },
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.isSuccess, false);
    const boardRes = await fetch(
      `http://127.0.0.1:${PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/board/today_board`,
      { headers: { Authorization: 'Bearer x' } },
    );
    assert.equal(boardRes.status, 404);
  } finally {
    proc.kill();
  }
});
