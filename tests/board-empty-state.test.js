'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadMilkshaBoard() {
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
  const code = fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'milksha-board.js' });
  return sandbox.QMS.MilkshaBoard;
}

test('empty board has no centered hint copy', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.isBoardFullyEmpty([], []), true);
  assert.equal('EMPTY_BOARD_MESSAGE' in MB, false);
});

test('hint copy applies only when both zones are empty', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.isBoardFullyEmpty([], []), true);
  assert.equal(MB.isBoardFullyEmpty([{ id: 'x:1' }], []), false);
  assert.equal(MB.isBoardFullyEmpty([], [{ id: 'x:2' }]), false);
});
