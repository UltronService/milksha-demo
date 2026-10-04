'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadSign() {
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
  return sandbox.QMS.Transport.MilkshaPosSign;
}

function loadValidate() {
  const sandbox = { globalThis: {}, window: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/pos-receiver-validate.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.PosReceiverValidate;
}

test('formatTimeStmp uses Asia/Taipei wall time independent of process TZ', function () {
  const prev = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const S = loadSign();
    const instant = new Date('2026-10-03T01:15:00.123Z');
    assert.equal(S.formatTimeStmp(instant), '2026-10-03-09-15-00:0123');
  } finally {
    if (prev === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = prev;
    }
  }
});

test('parseTimeStmp mirrors fake-cloud (Taipei +08, 1-4 digit fractional)', async function () {
  const browser = loadValidate();
  const { parseTimeStmp: nodeParse } = await import('../tools/fake-cloud/pos-validate.mjs');
  const ts = '2026-10-03-09-15-00:0123';
  const expected = new Date('2026-10-03T01:15:00.123Z').getTime();
  assert.equal(browser.parseTimeStmp(ts).getTime(), expected);
  assert.equal(nodeParse(ts).getTime(), expected);
  assert.equal(nodeParse('2026-10-03-09-15-00:2831').getTime(), nodeParse('2026-10-03-09-15-00:831').getTime());
});

test('HMAC signature matches node reference', async function () {
  const S = loadSign();
  const body = {
    merchant_id: 'milksha',
    account: 's120030',
    timeStmp: '2026-10-02-12-00-00:0000',
    serviceSpecialData_Json: {
      target: 'milkshas120030',
      data: { number_content: [{ source_type: 'From_Store_Preparing', number: '1' }] },
    },
  };
  const secret = 'unit-test-hmac-key-only';
  const signed = await S.signPosBody(body, secret);
  const wire = signed.__wireText || JSON.stringify(signed);
  const parsed = JSON.parse(wire);
  const canon = `${parsed.merchant_id}|${parsed.account}|${parsed.timeStmp}|${parsed.serviceSpecialData_Json_Md5Hash}`;
  const ref = crypto.createHmac('sha256', secret).update(canon, 'utf8').digest('base64');
  assert.equal(parsed.signature, ref);
  assert.equal(await S.verifyPosBody(parsed, secret), true);
});
