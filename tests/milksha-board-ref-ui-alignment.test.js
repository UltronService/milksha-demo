'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadArtLayout() {
  const sandbox = { console, Math, Number, Array, Object, QMS: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'landscape-art-layout.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.LandscapeArtLayout;
}

test('Milksha ref UI: icon column X anchors at 1920 (prep 176/572, ready +919)', function () {
  const art = loadArtLayout();
  assert.equal(art.iconBoxLeftBoard('prep', 0), 176);
  assert.equal(art.iconBoxLeftBoard('prep', 1), 572);
  assert.equal(art.iconBoxLeftBoard('ready', 0), 1095);
  assert.equal(art.iconBoxLeftBoard('ready', 1), 1491);
  assert.equal(art.CREAM_LEFT_ICON_OFFSET_PX[0], 75);
  assert.equal(art.CREAM_RIGHT_CONTENT_INSET_PX, 91);
});

test('Milksha ref UI: icon box and gap locked at 54px / 14px (independent of 70px font)', function () {
  const art = loadArtLayout();
  assert.equal(art.ICON_BOX_PX, 54);
  assert.equal(art.ICON_GAP_PX, 14);
  assert.equal(art.expectedNumLeftBoard('prep', 0), 176 + 54 + 14);
});

test('Milksha ref UI: icon box left edges within 2px @ 1920', async function () {
  const { measureRefUiIconAnchors } = await import('../scripts/check-milksha-board-column-alignment.mjs');
  const result = await measureRefUiIconAnchors();
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('Milksha ref UI: landscape art CSS tokens 54px box, 14px gap, Arial Regular numbers', function () {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'milksha-board.css'), 'utf8');
  const artBlock = css.match(/\.milksha-board\.milksha-board--landscape-art\s*\{[^}]+\}/);
  assert.ok(artBlock, 'landscape art token block');
  assert.match(artBlock[0], /--milksha-icon-box:\s*54px/);
  assert.match(artBlock[0], /--milksha-icon-gap:\s*14px/);
  assert.match(artBlock[0], /--milksha-icon-slot-w:\s*54px/);
  const artNumBlock = css.match(
    /\.milksha-board\.milksha-board--landscape-art \.milksha-art-numbers \.milksha-num\s*\{[^}]+\}/,
  );
  assert.ok(artNumBlock, 'landscape art .milksha-num block');
  assert.match(artNumBlock[0], /font-family:\s*Arial,\s*Arimo,\s*sans-serif/);
  assert.match(artNumBlock[0], /font-weight:\s*400/);
});

test('Milksha ref UI: comparison layout widest labels stay inside cream', async function () {
  const { runCreamColumnBoundsCheck, buildRefLayoutComparisonPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildRefLayoutComparisonPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});
