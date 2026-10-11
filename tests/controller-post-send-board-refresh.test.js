'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CONNECT_CLOUD = '雲端暫時出錯。請稍後再連線。';
const DEVCMD_FAIL = '雲端暫時出錯。請稍後再送一次。';

function loadBoardRefreshHelper() {
  const sandbox = { globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/board-refresh-after-command.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.BoardRefreshAfterCommand;
}

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

/** Mirrors sendQuickDemoNumber rollback + presentConnectError on posSend failure. */
async function simulateQuickSendAfterPush(refreshFn, pushThrows) {
  const CmdErrors = loadCmdErrors();
  const tickets = [{ no: '2001', status: 'ready' }];
  const ticketCountBefore = tickets.length;
  tickets.push({ no: '2002', status: 'ready' });
  let alertMessage = '';
  const H = loadBoardRefreshHelper();
  const src = fs.readFileSync(path.join(ROOT, 'controller/controller-app.js'), 'utf8');
  const usesHelper = src.includes('refreshBoardIgnoringSupersededAbort(refreshBoardLists)');
  try {
    if (pushThrows) {
      throw pushThrows;
    }
    if (usesHelper) {
      await H.refreshBoardIgnoringSupersededAbort(refreshFn);
    } else {
      await refreshFn();
    }
  } catch (e) {
    tickets.splice(ticketCountBefore);
    alertMessage =
      CmdErrors && CmdErrors.connectUserMessage
        ? CmdErrors.connectUserMessage(e)
        : String(e.message || '');
  }
  return { tickets, alertMessage };
}

/** Mirrors pushNumbersViaDevCommand post-devCommand refresh (production wiring). */
async function simulatePushPostCommandRefresh(refreshFn) {
  const H = loadBoardRefreshHelper();
  const src = fs.readFileSync(path.join(ROOT, 'controller/controller-app.js'), 'utf8');
  const usesHelper = src.includes('refreshBoardIgnoringSupersededAbort(refreshBoardLists)');
  try {
    if (usesHelper) {
      await H.refreshBoardIgnoringSupersededAbort(refreshFn);
    } else {
      await refreshFn();
    }
  } catch (refreshErr) {
    const bestEffortAfterPush = src.includes('push_numbers 後同步看板略過');
    if (!bestEffortAfterPush) {
      throw refreshErr;
    }
  }
  return { isSuccess: true };
}

test('post-send refresh ignores superseded AbortError (no connect alert, ticket kept)', async function () {
  const abortErr = new Error('signal is aborted without reason');
  abortErr.name = 'AbortError';
  const pushResult = await simulatePushPostCommandRefresh(async function () {
    throw abortErr;
  });
  assert.equal(pushResult.isSuccess, true);

  const ui = await simulateQuickSendAfterPush(async function () {
    throw abortErr;
  }, null);
  assert.equal(ui.alertMessage, '');
  assert.equal(ui.tickets.length, 2);
  assert.equal(ui.tickets[1].no, '2002');
});

test('real push_numbers failure still surfaces error and rolls back local ticket', async function () {
  const devErr = { status: 500, response: { code: 'internal_error', message: 'fail' } };
  const CmdErrors = loadCmdErrors();
  const ui = await simulateQuickSendAfterPush(async function () {}, devErr);
  assert.equal(ui.tickets.length, 1);
  assert.equal(ui.alertMessage, CONNECT_CLOUD);
  assert.equal(CmdErrors.devCommandUserMessage(devErr), DEVCMD_FAIL);
});

test('non-abort board refresh failure after successful push does not fail push_numbers', async function () {
  const netErr = new Error('Firestore GET 503');
  const result = await simulatePushPostCommandRefresh(async function () {
    throw netErr;
  });
  assert.equal(result.isSuccess, true);
});
