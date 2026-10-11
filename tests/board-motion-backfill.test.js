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

function ids(count, base) {
  const out = [];
  for (let i = count; i >= 1; i -= 1) {
    out.push({ id: 'store:' + (base + i), number: String(base + i) });
  }
  return out;
}

test('detectLeftColumnBackfillRemovalPlan: remove left column triggers right-top backfill', () => {
  const Anim = loadAnim();
  const prev = ids(7, 2100);
  const next = prev.filter((e) => e.number !== '2103');
  const diff = Anim.diffVisibleSlots(prev, next, 0, 0, 10, layoutPageGrid);
  const plan = Anim.detectLeftColumnBackfillRemovalPlan(prev, next, 0, 10, layoutPageGrid, diff);
  assert.ok(plan);
  assert.equal(plan.kind, 'left-column-backfill-removal');
  assert.equal(plan.backfillId, 'store:2102');
});
