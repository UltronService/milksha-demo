'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAnim() {
  const sandbox = { globalThis: {}, window: null };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

function layoutPageGrid(items, page, pageSize) {
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  const cells = new Array(pageSize).fill(null);
  for (let i = 0; i < slice.length; i += 1) {
    cells[i] = slice[i];
  }
  return cells;
}

test('diffVisibleSlots detects add move remove', function () {
  const MB = loadAnim();
  const pageSize = 10;
  const prev = [
    { id: 's:1', number: '1' },
    { id: 's:2', number: '2' },
    { id: 's:3', number: '3' },
  ];
  const next = [
    { id: 's:9', number: '9' },
    { id: 's:2', number: '2' },
    { id: 's:1', number: '1' },
  ];
  const diff = MB.diffVisibleSlots(prev, next, 0, 0, pageSize, layoutPageGrid);
  assert.equal(JSON.stringify(diff.added), JSON.stringify(['s:9']));
  assert.equal(JSON.stringify(diff.removed), JSON.stringify(['s:3']));
  assert.equal(diff.moved.length, 1);
  assert.equal(diff.moved[0].id, 's:1');
});

test('shouldSkipBoardAnimations on silent and first payload', function () {
  const MB = loadAnim();
  const base = {
    isFirstPayload: false,
    silentApply: false,
    reduceMotion: false,
    canUseWebAnimations: true,
    prevPrep: [{ id: 's:1', number: '1' }],
    nextPrep: [{ id: 's:1', number: '1' }, { id: 's:2', number: '2' }],
    prevReady: [],
    nextReady: [],
  };
  assert.equal(MB.shouldSkipBoardAnimations({ ...base, isFirstPayload: true }).reason, 'first-payload');
  assert.equal(MB.shouldSkipBoardAnimations({ ...base, silentApply: true }).reason, 'silent-reconnect');
});

test('bulk snapshot replace skips motion', function () {
  const MB = loadAnim();
  const prev = [];
  for (let i = 0; i < 8; i += 1) {
    prev.push({ id: 's:' + i, number: String(i) });
  }
  const next = [];
  for (let j = 10; j < 18; j += 1) {
    next.push({ id: 's:' + j, number: String(j) });
  }
  assert.equal(MB.isBulkSnapshotReplace(prev, next), true);
});
