'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 18791;

function loadWireSign() {
  const sandbox = {
    globalThis: {},
    crypto: crypto.webcrypto || globalThis.crypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder: TextEncoder,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-md5.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-pos-sign.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/milksha-pos-wire.js'), 'utf8'), sandbox);
  return {
    Wire: sandbox.QMS.Transport.MilkshaPosWire,
    Md5: sandbox.QMS.Transport.MilkshaMd5,
    PosSign: sandbox.QMS.Transport.MilkshaPosSign,
  };
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

test('md5 is computed over exact wire bytes including Chinese and slash', async function () {
  const { extractRawJsonField } = await import('../tools/fake-cloud/json-raw.mjs');
  const { FAKE_CLOUD_POS_SIGN_SECRET } = await import('../tools/fake-cloud/sign-secret.mjs');
  const { Wire, Md5, PosSign } = loadWireSign();
  const timeStmp = PosSign.formatTimeStmp(new Date());
  const marquee = '歡迎光臨迷客夏／現場點餐';
  const inner = {
    target: 'milkshas120030',
    data: {
      number_content: [{ source_type: 'From_Store_Preparing', number: '8801' }],
      newsTicker_content: [marquee],
      newsTickerSpeed: 40,
    },
  };
  const innerText = JSON.stringify(inner);
  assert.ok(innerText.includes('／'));
  const built = await Wire.signPosWire(
    {
      isEncrypt: false,
      serviceSpecialData_Json: inner,
      merchant_id: 'milksha',
      account: 's120030',
      timeStmp: timeStmp,
    },
    FAKE_CLOUD_POS_SIGN_SECRET,
    false,
  );
  assert.equal(Md5.md5Hex(innerText), built.md5Hash);
  const rawFromWire = extractRawJsonField(built.wireText, 'serviceSpecialData_Json');
  assert.equal(rawFromWire, innerText);
  assert.ok(built.wireText.includes(innerText));

  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const res = await fetch(
      `http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/posReceiver`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: built.wireText },
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.isSuccess, false);
    assert.match(json.information, /機台|尚未連線/);
    assert.equal(json.boxOnline, false);
  } finally {
    proc.kill();
  }
});
