'use strict';

/**
 * milksha-cloud sanitizePosTicketDisplayNo parity (board + controller quick-send).
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

test('board: store From_Store — 4 digits, no trim', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'store', '1234', '1234');
  assertBoardNorm(MB, 'store', '123', null);
  assertBoardNorm(MB, 'store', '12345', null);
  assertBoardNorm(MB, 'store', '12ab', null);
});

test('board: point From_milksha_point — exactly 3 digits', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'point', '012', '012');
  assertBoardNorm(MB, 'point', '0123', null);
  assertBoardNorm(MB, 'point', '12', null);
});

test('board: udd From_Udd — 4 digits', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'udd', '1234', '1234');
  assertBoardNorm(MB, 'udd', 'AB12', null);
  assertBoardNorm(MB, 'udd', '123', null);
});

test('board: uber From_UberEat — 5 hex uppercase', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'uber', 'AB12C', 'AB12C');
  assertBoardNorm(MB, 'uber', 'ab12c', 'AB12C');
  assertBoardNorm(MB, 'uber', 'AB12G', null);
  assertBoardNorm(MB, 'uber', 'AB12CD', null);
});

test('board: foodpanda From_FoodPanda — # + 4 digits', function () {
  const { MB } = loadBoardStack();
  assertBoardNorm(MB, 'fp', '#1234', '#1234');
  assertBoardNorm(MB, 'fp', '1234', null);
  assertBoardNorm(MB, 'fp', '#123', null);
  assertBoardNorm(MB, 'fp', '#12345', null);
});

test('controller: store quick-send matches board', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'store', '1234', true, '1234');
  assertController(SendNumber, 'store', '123', false);
  assertController(SendNumber, 'store', '12345', false);
});

test('controller: point quick-send matches board', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'point', '012', true, '012');
  assertController(SendNumber, 'point', '0123', false);
  assertController(SendNumber, 'point', '12', false);
});

test('controller: udd quick-send matches board', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'udd', '1234', true, '1234');
  assertController(SendNumber, 'udd', 'AB12', false);
  assertController(SendNumber, 'udd', '123', false);
});

test('controller: uber quick-send matches board', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'uber', 'AB12C', true, 'AB12C');
  assertController(SendNumber, 'uber', 'ab12c', true, 'AB12C');
  assertController(SendNumber, 'uber', 'AB12G', false);
  assertController(SendNumber, 'uber', 'AB12CD', false);
});

test('controller: foodpanda quick-send matches board', function () {
  const SendNumber = loadControllerSendNumber();
  assertController(SendNumber, 'fp', '#1234', true, '#1234');
  assertController(SendNumber, 'fp', '1234', false);
  assertController(SendNumber, 'fp', '#12ab', false);
});

test('PosTicketDisplayNo.channelFromSourceType strips zone suffix', function () {
  const { Pos } = loadBoardStack();
  assert.equal(Pos.channelFromSourceType('From_Store_OK'), 'From_Store');
  assert.equal(Pos.channelFromSourceType('From_Store_Cancelled'), 'From_Store');
  assert.equal(Pos.duplicateKey('store', '1234'), 'From_Store1234');
});
