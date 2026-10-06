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

test('connect user message prefers response code over http status', function () {
  const E = loadCmdErrors();
  assert.equal(
    E.connectUserMessage({
      status: 403,
      response: { code: 'invalid_access_code', message: 'wrong access code' },
    }),
    E.USER_MSG_CONNECT_ACCESS,
  );
  assert.equal(
    E.connectUserMessage({ status: 403, response: { code: 'forbidden', message: 'no permission' } }),
    E.USER_MSG_CONNECT_FORBIDDEN,
  );
  assert.equal(
    E.connectUserMessage({ status: 401, response: { code: 'invalid_token', message: 'expired' } }),
    E.USER_MSG_CONNECT_ACCESS,
  );
  assert.equal(
    E.connectUserMessage({ status: 403, response: { code: 'unauthorized' } }),
    E.USER_MSG_CONNECT_ACCESS,
  );
  assert.equal(E.connectUserMessage({ status: 503, response: { code: 'unavailable' } }), E.USER_MSG_CONNECT_CLOUD);
  assert.equal(
    E.connectUserMessage({ status: 403, response: { code: 'store_not_allowed', message: 'denied' } }),
    E.USER_MSG_STORE_NOT_ALLOWED,
  );
});

test('devCommand user messages map by response code', function () {
  const E = loadCmdErrors();
  assert.equal(E.devCommandUserMessage({ status: 401 }), E.USER_MSG_401);
  assert.equal(
    E.devCommandUserMessage({ status: 404, response: { code: 'device_not_found', message: 'device not found' } }),
    E.USER_MSG_404,
  );
  assert.equal(
    E.devCommandUserMessage({
      status: 400,
      response: { code: 'invalid_command_params', message: 'bad params' },
    }),
    E.USER_MSG_400_INVALID,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 400, response: { code: 'invalid_device_id', message: 'x' } }),
    E.USER_MSG_INVALID_DEVICE_ID,
  );
  assert.equal(E.devCommandUserMessage({}, { validationCode: 'invalid_device_id' }), E.USER_MSG_INVALID_DEVICE_ID);
  assert.equal(
    E.devCommandUserMessage({ status: 500, response: { code: 'internal_error', message: 'An internal error occurred.' } }),
    E.USER_MSG_INTERNAL_ERROR,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 403, response: { code: 'forbidden', message: 'no permission' } }),
    E.USER_MSG_403,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 401, response: { code: 'invalid_token', message: 'login expired' } }),
    E.USER_MSG_401,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 400, response: { code: 'invalid_body', message: 'invalid body' } }),
    E.USER_MSG_400_INVALID,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 413, response: { code: 'payload_too_large', message: 'request too large' } }),
    E.USER_MSG_400_INVALID,
  );
  assert.equal(
    E.devCommandUserMessage({ status: 418, response: { code: 'weird', message: 'nope' } }),
    E.USER_MSG_INTERNAL_ERROR,
  );
});

test('devCommand user message does not surface raw English message', function () {
  const E = loadCmdErrors();
  const msg = E.devCommandUserMessage({
    status: 400,
    response: { code: 'invalid_command_params', message: 'bad params' },
  });
  assert.equal(msg, E.USER_MSG_400_INVALID);
  assert.doesNotMatch(msg, /bad params/);
});

test('error detail redacts tokens and secrets', function () {
  const E = loadCmdErrors();
  const text = E.formatErrorDetailText(401, {
    code: 'invalid_token',
    message: 'login expired',
    idToken: 'secret-token',
    nested: { apiKey: 'k', ok: true },
  });
  assert.match(text, /401/);
  assert.doesNotMatch(text, /secret-token/);
  assert.match(text, /\[已隱藏\]/);
  assert.match(text, /login expired/);
});
