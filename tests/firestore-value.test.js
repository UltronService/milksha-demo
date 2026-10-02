'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadFv() {
  const sandbox = { Object: Object, Array: Array };
  sandbox.QMS = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'transport', 'firestore-value.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.FirestoreValue;
}

test('encode/decode map and array', function () {
  const FV = loadFv();
  const src = {
    storeId: 's120030',
    seq: 3,
    tickets: [{ no: '9', status: 'ready' }],
  };
  const fields = FV.encodeDocumentFields(src).fields;
  const out = FV.decodeDocumentFields(fields);
  assert.equal(out.storeId, 's120030');
  assert.equal(out.seq, 3);
  assert.equal(out.tickets[0].no, '9');
});
