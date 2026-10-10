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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

test('normalizeBoardDisplayNumber accepts only four-digit display strings', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber('0001'), '0001');
  assert.equal(MB.normalizeBoardDisplayNumber('9999'), '9999');
  assert.equal(MB.normalizeBoardDisplayNumber('1001'), '1001');
  assert.equal(MB.normalizeBoardDisplayNumber('123'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('12345'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('12ab'), null);
  assert.equal(MB.normalizeBoardDisplayNumber(''), null);
  assert.equal(MB.normalizeBoardDisplayNumber(null), null);
});

test('normalizeBoardDisplayNumber rejects JSON number type (backend PR #19 alignment)', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.normalizeBoardDisplayNumber(1001), null);
  assert.equal(MB.normalizeBoardDisplayNumber(1234), null);
  assert.equal(MB.normalizeBoardDisplayNumber(123), null);
  assert.equal(MB.normalizeBoardDisplayNumber(12345), null);
});

test('partitionNumberContent drops JSON number 1001 but keeps string siblings', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Store_OK', number: 1001 },
    { source_type: 'From_Store_OK', number: '1002' },
    { source_type: 'From_Store_Preparing', number: '2003' },
  ]);
  assert.equal(JSON.stringify(parts.ready.map((r) => r.number)), '["1002"]');
  assert.equal(JSON.stringify(parts.preparing.map((r) => r.number)), '["2003"]');
});

test('partitionNumberContent drops invalid entries and warns once per bad value', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const warnings = [];
  const orig = console.warn;
  console.warn = function (...args) {
    warnings.push(args.join(' '));
  };
  try {
    const parts = MB.partitionNumberContent([
      { source_type: 'From_Store_OK', number: '1001' },
      { source_type: 'From_Store_OK', number: '123' },
      { source_type: 'From_Store_OK', number: '123' },
      { source_type: 'From_Store_Preparing', number: 'abcd' },
      { source_type: 'From_Store_Preparing', number: null },
      { source_type: 'From_Store_Preparing', number: 5678 },
    ]);
    assert.equal(JSON.stringify(parts.ready.map((r) => r.number)), '["1001"]');
    assert.equal(JSON.stringify(parts.preparing.map((r) => r.number)), '[]');
    const bad123 = warnings.filter((w) => w.includes('123'));
    assert.equal(bad123.length, 1);
    assert.equal(warnings.filter((w) => w.includes('abcd')).length, 1);
  } finally {
    console.warn = orig;
  }
});

test('partitionNumberContent dedupes within list and prefers ready over preparing', function () {
  const MB = loadMilkshaBoard();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Store_Preparing', number: '2001' },
    { source_type: 'From_Store_OK', number: '2001' },
    { source_type: 'From_Store_OK', number: '2001' },
    { source_type: 'From_Store_Preparing', number: '2002' },
    { source_type: 'From_Store_Preparing', number: '2002' },
    { source_type: 'From_Store_OK', number: '3003' },
    { source_type: 'From_Store_Preparing', number: '3003' },
  ]);
  assert.equal(JSON.stringify(parts.ready.map((r) => r.number).sort()), '["2001","3003"]');
  assert.equal(JSON.stringify(parts.preparing.map((r) => r.number)), '["2002"]');
});

test('partitionNumberContent accepts more than fifty valid entries', function () {
  const MB = loadMilkshaBoard();
  const content = [];
  for (let i = 0; i < 60; i += 1) {
    const no = String(1000 + i);
    content.push({ source_type: 'From_Store_Preparing', number: no });
  }
  const parts = MB.partitionNumberContent(content);
  assert.equal(parts.preparing.length, 60);
  assert.equal(parts.ready.length, 0);
});
