'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OFFICIAL_NUM_FONT_PX = 64;

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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  return {
    MB: sandbox.QMS.MilkshaBoard,
    art: sandbox.QMS.Board.LandscapeArtLayout,
    icons: sandbox.QMS.Board.SourceIconsLayout,
  };
}

test('landscape art baseline uses 64px number font for both zones', function () {
  const { art } = loadBoardStack();
  assert.equal(art.NUM_FONT_PX, OFFICIAL_NUM_FONT_PX);
});

test('foodpanda requires hash + 4 digits on board', function () {
  const { MB } = loadBoardStack();
  MB.resetInvalidBoardNumberWarningsForTest();
  assert.equal(MB.normalizeBoardDisplayNumber('#6405', 'fp'), '#6405');
  assert.equal(MB.normalizeBoardDisplayNumber('6405', 'fp'), null);
  assert.equal(MB.normalizeBoardDisplayNumber('#12345', 'fp'), null);
});

test('renderNumberChip: delivery icons and empty store slot per PR #74 layout', function () {
  const { MB, icons } = loadBoardStack();
  const storeHtml = MB.renderNumberChip({ id: 'store:2217', sourceKey: 'store', number: '2217' });
  assert.match(storeHtml, /milksha-board-chip--with-slot/);
  assert.match(storeHtml, /milksha-board-icon-slot--empty/);
  assert.doesNotMatch(storeHtml, /<img/);

  const pointHtml = MB.renderNumberChip({ id: 'point:096', sourceKey: 'point', number: '096' });
  assert.match(pointHtml, new RegExp(icons.SOURCE_ICON_SRC.point.replace(/\./g, '\\.')));
  assert.match(pointHtml, /milksha-board-icon-box/);

  const fpHtml = MB.renderNumberChip({ id: 'fp:#6405', sourceKey: 'fp', number: '#6405' });
  assert.match(fpHtml, /foodpanda\.png/);
  assert.match(fpHtml, />#6405</);

  const uberHtml = MB.renderNumberChip({ id: 'uber:BFBEF', sourceKey: 'uber', number: 'BFBEF' });
  assert.match(uberHtml, /ubereats\.png/);
});

test('PR #74: same column number and icon-box left edges within 1px', async function () {
  const { runColumnAlignmentCheck } = await import('../scripts/check-milksha-board-column-alignment.mjs');
  const result = await runColumnAlignmentCheck();
  assert.equal(result.tolPx, 1);
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('PR #74: chip, number, and icon box stay inside cream column bands', async function () {
  const { runCreamColumnBoundsCheck, buildFullBoardMixedPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildFullBoardMixedPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('PR #74: icon slot and number left match 64px preview anchors', async function () {
  const { runPr74BaselineCheck } = await import('../scripts/check-milksha-board-column-alignment.mjs');
  const result = await runPr74BaselineCheck({ fontPx: 64 });
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('PR #74 widest compliant stress: all chips inside cream bands', async function () {
  const { runCreamColumnBoundsCheck, buildWorstCaseStressPayload } = await import(
    '../scripts/check-milksha-board-column-alignment.mjs'
  );
  const result = await runCreamColumnBoundsCheck({ payload: buildWorstCaseStressPayload() });
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('production board @ 1920×1080: 64px Arial Regular, icons, foodpanda #6405', async function () {
  const { runOfficialBoardLayoutCheck } = await import('../scripts/check-milksha-board-official-layout.mjs');
  const result = await runOfficialBoardLayoutCheck();
  assert.equal(result.fontPx, 64);
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('board CSS defines icon slot 1.0F, gap 0.2F, icon box 0.8F without hidden overflow', function () {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'milksha-board.css'), 'utf8');
  assert.match(css, /--milksha-icon-slot-w:\s*calc\(var\(--milksha-num-font\)\s*\*\s*1\)/);
  assert.match(css, /--milksha-icon-gap:\s*calc\(var\(--milksha-num-font\)\s*\*\s*0\.2\)/);
  assert.match(css, /--milksha-icon-box:\s*calc\(var\(--milksha-num-font\)\s*\*\s*0\.8\)/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /\.milksha-board-icon-box[\s\S]*overflow:\s*visible/);
});
