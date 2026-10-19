'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const POS_TICKET_JS = fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8');

/**
 * @param {{ Intl?: { Segmenter?: unknown } }} [opts]
 */
function loadPosModule(opts) {
  const sandbox = {
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Error: Error,
    Intl: opts && opts.Intl ? opts.Intl : Intl,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(POS_TICKET_JS, sandbox);
  return sandbox.QMS.Board.PosTicketDisplayNo;
}

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
    Intl: Intl,
    requestAnimationFrame: function (fn) {
      fn();
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  return {
    MB: sandbox.QMS.MilkshaBoard,
    Pos: sandbox.QMS.Board.PosTicketDisplayNo,
    Icons: sandbox.QMS.Board.SourceIconsLayout,
  };
}

function loadControllerStack() {
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
    Intl: Intl,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/pos-ticket-display-no.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/controller-send-number.js'), 'utf8'), sandbox);
  return sandbox.QMS.Controller.SendNumber;
}

test('spec 1: show number as sent (case, #, leading zeros)', function () {
  const { MB } = loadBoardStack();
  assert.equal(MB.normalizeBoardDisplayNumber('0012', 'store'), '0012');
  assert.equal(MB.normalizeBoardDisplayNumber('#130', 'fp'), '#130');
  assert.equal(MB.normalizeBoardDisplayNumber('c7458', 'uber'), 'c7458');
  assert.equal(MB.normalizeBoardDisplayNumber('BFBEF', 'uber'), 'BFBEF');
});

test('spec 2: display at most 6 grapheme/code units', function () {
  const { Pos } = loadBoardStack();
  assert.equal(Pos.truncateToDisplayUnits('#130,vke3-2643-dy6y'), '#130,v');
  assert.equal(Pos.truncateToDisplayUnits('12345😀'), '12345😀');
  assert.equal(Pos.truncateToDisplayUnits('123456😀'), '123456');
  assert.equal(Pos.truncateToDisplayUnits('𠮷𠮷𠮷𠮷𠮷𠮷𠮷'), '𠮷𠮷𠮷𠮷𠮷𠮷');
});

test('STB baseline: truncateToDisplayUnitsByCodePoint keeps emoji and 𠮷 whole', function () {
  const Pos = loadPosModule({ Intl: { Segmenter: undefined } });
  assert.equal(Pos.truncateToDisplayUnitsByCodePoint('12345😀'), '12345😀');
  assert.equal(Pos.truncateToDisplayUnitsByCodePoint('123456😀'), '123456');
  assert.equal(Pos.truncateToDisplayUnitsByCodePoint('😀😀😀😀😀😀😀'), '😀😀😀😀😀😀');
  assert.equal(Pos.truncateToDisplayUnitsByCodePoint('𠮷𠮷𠮷𠮷𠮷𠮷𠮷'), '𠮷𠮷𠮷𠮷𠮷𠮷');
  const ki = '\uD842\uDFB7';
  const mixed = 'a' + ki + 'bcd';
  const twoUnits = Pos.truncateToDisplayUnitsByCodePoint(mixed, 2);
  assert.equal(twoUnits, 'a' + ki);
  assert.equal(Array.from(twoUnits).length, 2);
  assert.ok(!twoUnits.includes('\uD842') || twoUnits.includes(ki));
});

test('STB fallback: truncateToDisplayUnits without Intl.Segmenter matches code-point baseline', function () {
  const Pos = loadPosModule({ Intl: { Segmenter: undefined } });
  assert.equal(Pos.canUseIntlSegmenter(), false);
  const samples = ['123456😀', '12345😀', '𠮷𠮷𠮷𠮷𠮷𠮷𠮷', '#130,vke3-2643-dy6y'];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    assert.equal(
      Pos.truncateToDisplayUnits(s),
      Pos.truncateToDisplayUnitsByCodePoint(s),
      'fallback must match baseline for: ' + s,
    );
  }
});

test('spec 3: trim outer whitespace, keep inner spaces', function () {
  const { MB } = loadBoardStack();
  assert.equal(MB.normalizeBoardDisplayNumber('  12 34  ', 'store'), '12 34');
});

test('spec 4: empty or whitespace-only yields blank display string on board', function () {
  const { MB } = loadBoardStack();
  MB.resetInvalidBoardNumberWarningsForTest();
  assert.equal(MB.normalizeBoardDisplayNumber('', 'store'), '');
  assert.equal(MB.normalizeBoardDisplayNumber('   ', 'store'), '');
  const parts = MB.partitionNumberContent([{ source_type: 'From_Store_OK', number: '   ' }]);
  assert.equal(parts.ready.length, 1);
  assert.equal(parts.ready[0].number, '');
  const chip = MB.renderNumberChip(parts.ready[0]);
  assert.match(chip, /milksha-board-chip/);
  assert.match(chip, /milksha-num/);
});

test('spec 5: dedupe by source + trimmed original', function () {
  const { MB } = loadBoardStack();
  MB.resetInvalidBoardNumberWarningsForTest();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_Store_OK', number: '130' },
    { source_type: 'From_Store_OK', number: '130 ' },
    { source_type: 'From_Store_OK', number: '' },
    { source_type: 'From_Store_OK', number: '  ' },
  ]);
  assert.equal(parts.ready.length, 2);
});

test('spec 6: different originals with same 6-char prefix both shown', function () {
  const { MB } = loadBoardStack();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_FoodPanda_OK', number: '#130,va' },
    { source_type: 'From_FoodPanda_OK', number: '#130,vb' },
  ]);
  assert.equal(parts.ready.length, 2);
  assert.equal(parts.ready[0].number, '#130,v');
  assert.equal(parts.ready[1].number, '#130,v');
});

test('spec 7: unknown sources not shown', function () {
  const { MB } = loadBoardStack();
  const parts = MB.partitionNumberContent([
    { source_type: 'From_OtherChannel_OK', number: '9999' },
  ]);
  assert.equal(parts.ready.length, 0);
  assert.equal(MB.parseSourceType('From_OtherChannel_OK'), null);
});

test('spec 8: HTML escaped in chip inner html', function () {
  const { Icons } = loadBoardStack();
  const html = Icons.renderChipInnerHtml({ sourceKey: 'store', number: '<b>13</b>' });
  assert.match(html, /&lt;b&gt;13&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>13<\/b>/);
});

test('spec 9: six full-width chars stay in number span', function () {
  const { MB } = loadBoardStack();
  const six = '迷客夏珍奶好';
  assert.equal(MB.normalizeBoardDisplayNumber(six, 'store'), six);
  const chip = MB.renderNumberChip({ id: 'store:x', sourceKey: 'store', number: six });
  assert.match(chip, /milksha-num/);
  assert.match(chip, /迷客夏珍奶好/);
});

test('spec 10: blank cells count toward paging', function () {
  const { MB } = loadBoardStack();
  const items = [{ number: '' }, { number: '1001' }];
  assert.equal(MB.pageCountForItems(items.length), 1);
  const grid = MB.layoutPageGrid(items, 0, 2);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].number, '');
});

test('spec 11-12: controller accepts any string, no format error UI', function () {
  const S = loadControllerStack();
  const bad = S.buildQuickSendFieldPresentation({ sourceKey: 'store', rawValue: '12', duplicateOnBoard: false });
  assert.equal(bad.valid, true);
  assert.equal(bad.inputInvalid, false);
  assert.match(bad.ruleNoteText, /原樣送出/);
  const v = S.validateQuickSendNumber('uber', 'c7458');
  assert.equal(v.normalized, 'c7458');
});

test('spec 13: controller sends long string; board truncates display', function () {
  const { MB } = loadBoardStack();
  assert.equal(MB.normalizeBoardDisplayNumber('1234567890', 'store'), '123456');
});

test('spec 14: controller list uses text (no html parse) — structural check', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller/controller-app.js'), 'utf8');
  assert.match(src, /li\.textContent = t\.no/);
});

test('spec 15: empty quick send allowed', function () {
  const S = loadControllerStack();
  const v = S.validateQuickSendNumber('store', '   ');
  assert.equal(v.ok, true);
  assert.equal(v.normalized, '   ');
});
