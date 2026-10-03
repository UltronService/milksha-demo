'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCmdErrors() {
  const sandbox = { globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/controller-command-errors.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.ControllerCommandErrors;
}

test('devCommand user messages map by error code', function () {
  const E = loadCmdErrors();
  assert.equal(E.devCommandUserMessage({ status: 401 }), E.USER_MSG_401);
  assert.equal(
    E.devCommandUserMessage({ status: 404, response: { error: 'device_not_found' } }),
    E.USER_MSG_404,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 400, response: { error: 'invalid_command_params', message: 'x' } }),
    E.USER_MSG_400_INVALID,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 400, response: { error: 'invalid_device_id' } }),
    E.USER_MSG_INVALID_DEVICE_ID,
  );
  assert.equal(E.devCommandUserMessage({}, { validationCode: 'invalid_device_id' }), E.USER_MSG_INVALID_DEVICE_ID);
  assert.equal(
    E.devCommandUserMessage({ status: 500, response: { error: 'internal_error' } }),
    E.USER_MSG_INTERNAL_ERROR,
  );
  assert.equal(E.devCommandUserMessage({ status: 403, response: { error: 'forbidden' } }), E.USER_MSG_403);
  assert.equal(
    E.devCommandUserMessage({ status: 400, response: { error: 'invalid_body' } }),
    E.USER_MSG_400_INVALID,
  );
  assert.equal(E.devCommandUserMessage({ status: 418, response: { error: 'weird' } }), E.USER_MSG_INTERNAL_ERROR);
});

test('error detail redacts tokens and secrets', function () {
  const E = loadCmdErrors();
  const text = E.formatErrorDetailText(401, {
    error: 'invalid_token',
    idToken: 'secret-token',
    nested: { apiKey: 'k', ok: true },
  });
  assert.match(text, /401/);
  assert.doesNotMatch(text, /secret-token/);
  assert.match(text, /\[已隱藏\]/);
});
