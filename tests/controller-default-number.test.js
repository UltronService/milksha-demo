'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadSendNumber() {
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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller', 'controller-send-number.js'), 'utf8'), sandbox);
  return sandbox.QMS.Controller.SendNumber;
}

test('switching source replaces pristine default with new source default', function () {
  const S = loadSendNumber();
  const first = S.resolveQuickSendValueOnSourceChange({
    previousSourceKey: 'store',
    newSourceKey: 'uber',
    currentValue: '2001',
    pristine: true,
  });
  assert.equal(first.nextValue, 'c7458');
  assert.equal(first.selectAll, true);
  assert.equal(first.pristine, true);
});

test('switching source keeps hand-edited number when not pristine', function () {
  const S = loadSendNumber();
  const kept = S.resolveQuickSendValueOnSourceChange({
    previousSourceKey: 'store',
    newSourceKey: 'uber',
    currentValue: '9999',
    pristine: false,
  });
  assert.equal(kept.nextValue, '9999');
  assert.equal(kept.selectAll, false);
});

test('B5: short number shows rule note and enabled send (no format error)', function () {
  const S = loadSendNumber();
  const ui = S.buildQuickSendFieldPresentation({
    sourceKey: 'store',
    rawValue: '12',
    duplicateOnBoard: false,
  });
  assert.equal(ui.valid, true);
  assert.match(ui.ruleNoteText, /原樣送出/);
  assert.equal(ui.errorText, '');
  assert.equal(ui.inputInvalid, false);
  assert.equal(ui.sendDisabled, false);
});

test('B5: any value keeps rule note and enabled send', function () {
  const S = loadSendNumber();
  const ui = S.buildQuickSendFieldPresentation({
    sourceKey: 'fp',
    rawValue: '#6405',
    duplicateOnBoard: false,
  });
  assert.equal(ui.valid, true);
  assert.match(ui.ruleNoteText, /原樣送出/);
  assert.equal(ui.errorText, '');
  assert.equal(ui.inputInvalid, false);
  assert.equal(ui.sendDisabled, false);
});

test('foodpanda sends hash as typed', function () {
  const S = loadSendNumber();
  const ok = S.validateQuickSendNumber('fp', '#6405');
  assert.equal(ok.ok, true);
  assert.equal(ok.normalized, '#6405');
});

test('point accepts any string as typed', function () {
  const S = loadSendNumber();
  assert.equal(S.validateQuickSendNumber('point', '012').normalized, '012');
  assert.equal(S.validateQuickSendNumber('point', '0912').ok, true);
});

test('duplicate on board surfaces 此號碼已在看板上 in rule-note slot', function () {
  const S = loadSendNumber();
  const ui = S.buildQuickSendFieldPresentation({
    sourceKey: 'store',
    rawValue: '2001',
    duplicateOnBoard: true,
  });
  assert.equal(ui.errorText, '此號碼已在看板上');
  assert.equal(ui.sendDisabled, true);
});

test('HTML places rule note beside number field', function () {
  const html = fs.readFileSync(path.join(ROOT, 'controller', 'index.html'), 'utf8');
  assert.match(html, /data-testid="quick-send-rule-note"/);
  assert.match(html, /quick-send-number-row/);
});

test('CSS styles invalid input border and responsive rule note', function () {
  const css = fs.readFileSync(path.join(ROOT, 'controller', 'controller.css'), 'utf8');
  assert.match(css, /#fld-quick-no\.is-invalid/);
  assert.match(css, /@media \(max-width: 768px\)/);
});
