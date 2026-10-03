'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { join } = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const PORT = 18788;
let SECRET = '';

before(async () => {
  const mod = await import('../tools/fake-cloud/sign-secret.mjs');
  SECRET = mod.FAKE_CLOUD_POS_SIGN_SECRET;
});

function loadPosSign() {
  const sandbox = {
    globalThis: {},
    crypto: crypto,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(join(ROOT, 'js/vendor/md5.min.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(join(ROOT, 'js/transport/milksha-md5.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(join(ROOT, 'js/transport/milksha-pos-sign.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(join(ROOT, 'js/transport/milksha-pos-wire.js'), 'utf8'), sandbox);
  return sandbox.QMS.Transport.MilkshaPosSign;
}

async function waitHealth() {
  for (let i = 0; i < 40; i += 1) {
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

async function postPos(body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/posReceiver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  return { status: res.status, json: await res.json() };
}

test('posReceiver rejects altered JSON with stale Md5Hash', async function () {
  const PosSign = loadPosSign();
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const inner = {
      target: 'milkshas120030',
      data: { number_content: [{ source_type: 'From_Store_Preparing', number: '9002' }] },
    };
    const draft = {
      isEncrypt: false,
      serviceSpecialData_Json: inner,
      merchant_id: 'milksha',
      account: 's120030',
    };
    const signed = await PosSign.signPosBody(draft, SECRET);
    const wire = signed.__wireText || JSON.stringify(signed);
    const tamperedWire = wire.replace('"9002"', '"9999"');
    const out = await postPos(tamperedWire);
    assert.equal(out.status, 200);
    assert.equal(out.json.isSuccess, false);
    assert.match(out.json.information, /Md5Hash/);
  } finally {
    proc.kill();
  }
});

test('posReceiver returns 入口 A 未啟用 when switch off', async function () {
  const PosSign = loadPosSign();
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${PORT}/test/posReceiverA`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const inner = {
      target: 'milkshas120030',
      data: { number_content: [{ source_type: 'From_Store_Preparing', number: '9003' }] },
    };
    const signed = await PosSign.signPosBody(
      { isEncrypt: false, serviceSpecialData_Json: inner, merchant_id: 'milksha', account: 's120030' },
      SECRET,
    );
    const out = await postPos(signed.__wireText || JSON.stringify(signed));
    assert.equal(out.json.isSuccess, false);
    assert.match(out.json.information, /入口 A 未啟用/);
  } finally {
    proc.kill();
  }
});
