'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBrowserValidate() {
  const sandbox = {
    globalThis: {},
    TextEncoder,
    TextDecoder,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'milksha-md5.js'), 'utf8'), sandbox);
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'transport', 'pos-receiver-validate.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.PosReceiverValidate;
}

test('entry A contract: md5, canonical, target, entry-A message', async function () {
  const browserValidate = loadBrowserValidate();
  const { validatePosReceiverBody, ENTRY_A_OFF_MSG, milkshaTargetForAccount } = browserValidate;
  const { validatePosReceiverBody: nodeValidate, md5Hex, ENTRY_A_OFF_MSG: nodeMsg } = await import(
    '../tools/fake-cloud/pos-validate.mjs'
  );

  assert.equal(ENTRY_A_OFF_MSG, '入口 A 未啟用');
  assert.equal(nodeMsg, ENTRY_A_OFF_MSG);
  assert.equal(milkshaTargetForAccount('s120030'), 'milkshas120030');

  const inner = {
    target: 'milkshas120030',
    data: { number_content: [{ source_type: 'From_Store_Preparing', number: '1' }] },
  };
  const jsonStr = JSON.stringify(inner);
  const hash = md5Hex(jsonStr);
  const body = {
    merchant_id: 'milksha',
    account: 's120030',
    timeStmp: '2026-10-03-12-00-00:0000',
    serviceSpecialData_Json: inner,
    serviceSpecialData_Json_Md5Hash: hash,
  };

  const canon = `${body.merchant_id}|${body.account}|${body.timeStmp}|${body.serviceSpecialData_Json_Md5Hash}`;
  const secret = 'contract-test-key';
  const signature = crypto.createHmac('sha256', secret).update(canon, 'utf8').digest('base64');
  body.signature = signature;

  const parsed = browserValidate.parseTimeStmp(body.timeStmp);
  const opts = {
    now: parsed,
    entryAEnabled: true,
    md5Hex,
    serviceSpecialDataJsonRaw: jsonStr,
  };
  const browserOut = validatePosReceiverBody(body, opts);
  const nodeOut = nodeValidate(body, opts);
  assert.equal(browserOut.ok, nodeOut.ok);
  assert.equal(browserOut.information, nodeOut.information);
  assert.equal(browserOut.ok, true);

  const off = validatePosReceiverBody(body, { ...opts, entryAEnabled: false });
  assert.equal(off.ok, false);
  assert.equal(off.information, '入口 A 未啟用');
});
