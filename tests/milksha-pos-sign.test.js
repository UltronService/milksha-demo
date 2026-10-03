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
