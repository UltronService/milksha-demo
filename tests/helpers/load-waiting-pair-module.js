'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { WAITING_PAIR_MODULE } = require('./waiting-pair-contract.js');

const ROOT = path.join(__dirname, '..', '..');

/**
 * @returns {object} QMS.Board.WaitingPair
 */
function loadWaitingPairModule() {
  const filePath = path.join(ROOT, WAITING_PAIR_MODULE);
  assert.ok(fs.existsSync(filePath), `${WAITING_PAIR_MODULE} not implemented`);
  const sandbox = {
    globalThis: {},
    QMS: {},
    Date: Date,
    Intl: Intl,
    Math: Math,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox);
  assert.ok(sandbox.QMS.Board && sandbox.QMS.Board.WaitingPair, 'QMS.Board.WaitingPair export missing');
  return sandbox.QMS.Board.WaitingPair;
}

/**
 * @returns {object} QMS.Board.WaitingPairHost
 */
function loadWaitingPairHostModule() {
  const filePath = path.join(ROOT, 'js', 'board', 'board-waiting-pair-host.js');
  assert.ok(fs.existsSync(filePath), 'js/board/board-waiting-pair-host.js not implemented');
  const sandbox = {
    globalThis: {},
    QMS: {},
    document: { createElement: () => ({ style: {}, classList: { add: () => {} } }) },
    Date: Date,
    Intl: Intl,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, WAITING_PAIR_MODULE), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox);
  assert.ok(sandbox.QMS.Board.WaitingPairHost, 'QMS.Board.WaitingPairHost export missing');
  return sandbox.QMS.Board.WaitingPairHost;
}

/**
 * @returns {object} QMS.Receiver.BoardUrlBindSync
 */
function loadUrlBindSyncModule() {
  const filePath = path.join(ROOT, 'js', 'receiver', 'board-url-bind-sync.js');
  assert.ok(fs.existsSync(filePath), 'js/receiver/board-url-bind-sync.js not implemented');
  const sandbox = { globalThis: {}, QMS: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox);
  assert.ok(sandbox.QMS.Receiver && sandbox.QMS.Receiver.BoardUrlBindSync);
  return sandbox.QMS.Receiver.BoardUrlBindSync;
}

module.exports = {
  loadWaitingPairModule,
  loadWaitingPairHostModule,
  loadUrlBindSyncModule,
};
