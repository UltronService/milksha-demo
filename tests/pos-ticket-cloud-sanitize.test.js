'use strict';

/**
 * POS number v2: as-sent display rules (board + controller quick-send).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBoardStack() {
  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    setInterval: setInterval,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Promise: Promise,
    Error: Error,
    Set: Set,
    Intl: Intl,
    requestAnimationFrame: function (fn) {
      fn();
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const files = [
    'js/board/pos-ticket-display-no.js',
    'js/board/landscape-art-layout.js',
    'js/board/source-icons-layout.js',
    'js/board/milksha-board-anim-config.js',
    'js/board/milksha-board-anim.js',
    'js/milksha-board.js',
  ];
  for (let i = 0; i < files.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, files[i]), 'utf8'), sandbox);
  }
  return {
    MB: sandbox.QMS.MilkshaBoard,
    Pos: sandbox.QMS.Board.PosTicketDisplayNo,
  };
}

function loadControllerSendNumber() {
  const sandbox = {
    console: console,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Error: Error,
    Set: Set,
    Intl: Intl,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/controller-send-number.js'), 'utf8'), sandbox);
  return sandbox.QMS.Controller.SendNumber;
}

function assertBoardNorm(MB, sourceKey, raw, expected) {
  const got = MB.normalizeBoardDisplayNumber(raw, sourceKey);
  if (expected === null) {
    assert.equal(got, null, `${sourceKey} "${raw}" should be invalid`);
  } else {
    assert.equal(got, expected, `${sourceKey} "${raw}"`);
  }
}

function assertController(SendNumber, sourceKey, raw, expectedOk, expectedNormalized) {
  const r = SendNumber.validateQuickSendNumber(sourceKey, raw);
  assert.equal(r.ok, expectedOk, `${sourceKey} "${raw}" ok=${expectedOk}`);
  if (expectedOk) {
    assert.equal(r.normalized, expectedNormalized);
  }
}

test('board: store preserves arbitrary string up to 6 display units', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'store', '1234', '1234');
  assertBoardNorm(MB, 'store', '123', '123');
  assertBoardNorm(MB, 'store', '1234567', '123456');
  assertBoardNorm(MB, 'store', '12ab', '12ab');
});

test('board: point preserves length and leading zeros', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'point', '012', '012');
  assertBoardNorm(MB, 'point', '0123', '0123');
  assertBoardNorm(MB, 'point', '12', '12');
});

test('board: udd accepts non-digit strings', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'udd', '1234', '1234');
  assertBoardNorm(MB, 'udd', 'AB12', 'AB12');
  assertBoardNorm(MB, 'udd', '123', '123');
});

test('board: uber keeps letter case', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'uber', 'AB12C', 'AB12C');
  assertBoardNorm(MB, 'uber', 'ab12c', 'ab12c');
  assertBoardNorm(MB, 'uber', 'AB12G', 'AB12G');
  assertBoardNorm(MB, 'uber', 'AB12CD', 'AB12CD');
});

test('board: foodpanda keeps hash and arbitrary tail', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'fp', '#6405', '#6405');
  assertBoardNorm(MB, 'fp', '6406', '6406');
  assertBoardNorm(MB, 'fp', '#12345', '#12345');
});

test('controller quick-send mirrors as-typed values', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'store', '1234', true, '1234');
  assertController(SendNumber, 'store', '123', true, '123');
  assertController(SendNumber, 'point', '091', true, '091');
  assertController(SendNumber, 'uber', 'c7458', true, 'c7458');
  assertController(SendNumber, 'fp', '#6406', true, '#6406');
  assertController(SendNumber, 'udd', 'ab12', true, 'ab12');
});
