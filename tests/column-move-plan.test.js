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
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'),
    sandbox,
  );
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoardAnim;
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

function ids(n, prefix) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ id: prefix + ':' + (1000 + i), number: String(1000 + i) });
  }
  return out;
}

test('detectColumnMovePlan sixth-on-page', function () {
  const Anim = loadAnim();
  const prev = ids(5, 'store');
  const next = ids(6, 'store');
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'sixth-on-page');
  assert.equal(plan.enterSlot, 5);
  assert.equal(plan.leftBottomSlot, 4);
});

test('detectColumnMovePlan right-bottom page two overflow', function () {
  const Anim = loadAnim();
  const prev = ids(10, 'store');
  const next = ids(11, 'store');
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  assert.equal(diff.added.length, 0);
  const plan = Anim.detectColumnMovePlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.equal(plan, null);
});
