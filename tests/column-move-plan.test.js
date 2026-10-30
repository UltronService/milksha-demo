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

function newestFirstIds(count, prefix) {
  const out = [];
  for (let i = count; i >= 1; i -= 1) {
    out.push({ id: prefix + ':' + (1000 + i), number: String(1000 + i) });
  }
  return out;
}

test('detectColumnMovePlan left-column-overflow 5->6 newest-first', function () {
  const Anim = loadAnim();
  const prev = newestFirstIds(5, 'store');
  const next = [{ id: 'store:1006', number: '1006' }].concat(prev);
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'left-column-overflow');
  assert.equal(plan.enterSlot, 0);
  assert.equal(plan.addedId, 'store:1006');
  assert.equal(plan.pushedId, 'store:1001');
});

test('detectColumnMovePlan left-column-overflow 8->9', function () {
  const Anim = loadAnim();
  const prev = newestFirstIds(8, 'store');
  const next = [{ id: 'store:1009', number: '1009' }].concat(prev);
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'left-column-overflow');
  assert.equal(plan.pushedId, 'store:1004');
});

function ids(n, prefix) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ id: prefix + ':' + (1000 + i), number: String(1000 + i) });
  }
  return out;
}

test('detectColumnMovePlan page 2 prepend 15->16 matches page 0 left-overflow', function () {
  const Anim = loadAnim();
  const prev = newestFirstIds(15, 'store');
  const next = [{ id: 'store:1099', number: '1099' }].concat(prev);
  const diff = Anim.diffVisibleSlots(prev, next, 1, 1, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 1, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'left-column-overflow');
  assert.equal(plan.pushedId, 'store:1001');
  assert.equal(plan.enterSlot, 0);
});

test('isCrossColumnSlotMove detects left-bottom to right-top', function () {
  const Anim = loadAnim();
  assert.equal(Anim.isCrossColumnSlotMove(4, 5), true);
  assert.equal(Anim.isCrossColumnSlotMove(3, 4), false);
});

test('detectColumnMovePlan right-column-fade-in on page 1 (5->6 visible)', function () {
  const Anim = loadAnim();
  const prev = ids(15, 'store');
  const next = ids(16, 'store');
  const diff = Anim.diffVisibleSlots(prev, next, 1, 1, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 1, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'right-column-fade-in');
  assert.equal(plan.enterSlot, 5);
});

test('detectColumnMovePlan right-bottom page two overflow on page 1', function () {
  const Anim = loadAnim();
  const prev = newestFirstIds(10, 'store');
  const next = [{ id: 'store:1099', number: '1099' }].concat(prev);
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  const plan = Anim.detectColumnMovePlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'right-bottom-page-two');
  assert.equal(plan.exitId, 'store:1001');
});

test('detectColumnMovePlan right-bottom overflow on page 4 (index 3) with one removed', function () {
  const Anim = loadAnim();
  const prev = newestFirstIds(40, 'store');
  const next = [{ id: 'store:1099', number: '1099' }].concat(prev);
  const page = 3;
  const diff = Anim.diffVisibleSlots(prev, next, page, page, 10, layoutPageGrid);
  assert.equal(diff.removed.length, 1);
  const plan = Anim.detectColumnMovePlan(prev, next, page, 10, layoutPageGrid, diff);
  assert.equal(plan.kind, 'right-bottom-page-two');
  assert.equal(plan.exitId, 'store:1001');
  assert.equal(plan.addedId, 'store:1011');
});
