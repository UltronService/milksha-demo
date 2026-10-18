'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMilkshaCloudBackendUrl } = require('../artifacts/pr101-diag/pr101-diag-lib.mjs');

test('isMilkshaCloudBackendUrl matches firestore and cloud functions hosts', function () {
  assert.equal(isMilkshaCloudBackendUrl('https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents/a'), true);
  assert.equal(
    isMilkshaCloudBackendUrl('https://asia-east1-milksha-qms-dev.cloudfunctions.net/boxHeartbeat'),
    true,
  );
  assert.equal(isMilkshaCloudBackendUrl('http://127.0.0.1:8877/controller/'), false);
});
