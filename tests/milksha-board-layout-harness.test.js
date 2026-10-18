'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const LAYOUT_HARNESS_SCRIPTS = [
  'scripts/check-milksha-board-column-alignment.mjs',
  'scripts/check-milksha-board-official-layout.mjs',
];

test('BOARD_LAYOUT_HARNESS_QUERY uses local mode without cloud auto-pair default', async function () {
  const { BOARD_LAYOUT_HARNESS_QUERY, boardLayoutHarnessUrl } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  assert.equal(BOARD_LAYOUT_HARNESS_QUERY, 'demo=0&mode=local');
  const url = boardLayoutHarnessUrl('http://127.0.0.1:8800/milksha-demo/');
  assert.match(url, /demo=0/);
  assert.match(url, /mode=local/);
  assert.doesNotMatch(url, /mode=cloud/);
});

test('layout harness scripts never open home board with demo=0 only', function () {
  for (let i = 0; i < LAYOUT_HARNESS_SCRIPTS.length; i += 1) {
    const rel = LAYOUT_HARNESS_SCRIPTS[i];
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /goto\(base \+ '\?demo=0'/);
    assert.match(src, /gotoLayoutHarness|boardLayoutHarnessUrl/);
  }
});

test('layout harness URL keeps board surface off cloud auto-pair boot', async function () {
  const { verifyLayoutHarnessBootIsolation } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await verifyLayoutHarnessBootIsolation();
  assert.equal(result.ok, true);
});
