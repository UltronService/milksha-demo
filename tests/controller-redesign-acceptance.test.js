'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadStoreList() {
  const sandbox = { fetch: async function () { throw new Error('fetch not mocked'); } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(readUtf8('controller/store-list.js'), sandbox);
  return sandbox.QMS.Controller.StoreList;
}

function loadControllerView() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(readUtf8('controller/controller-view.js'), sandbox);
  return sandbox.QMS.Controller.View;
}

test('acceptance 1: light theme header and store section before quick send in HTML', function () {
  const html = readUtf8('controller/index.html');
  assert.match(html, /class="app-header"/);
  assert.match(html, /id="sec-store-top"/);
  assert.match(html, /id="sec-quick-send"/);
  const storeIdx = html.indexOf('id="sec-store-top"');
  const sendIdx = html.indexOf('id="sec-quick-send"');
  assert.ok(storeIdx >= 0 && sendIdx > storeIdx);
  const css = readUtf8('controller/controller.css');
  assert.match(css, /--color-bg:\s*#f7f8fa/);
  assert.doesNotMatch(css, /\.top\s*\{[^}]*background:\s*#161616/);
});

test('acceptance 2: operator picker filter keeps only c030020, a17, and URL pin', function () {
  const S = loadStoreList();
  const rows = [
    { storeId: 'c030020' },
    { storeId: 'a17' },
    { storeId: 's120030' },
    { storeId: 'zz-qa-store-a', test: true },
    { storeId: 'zz-qa-ci-store', test: true },
  ];
  const filtered = S.filterStoresForOperatorPicker(rows, '');
  assert.deepEqual(filtered.map((s) => s.storeId), ['c030020', 'a17']);
  const pinned = S.filterStoresForOperatorPicker(rows, 'zz-qa-ci-store');
  assert.deepEqual(
    pinned.map((s) => s.storeId).sort(),
    ['a17', 'c030020', 'zz-qa-ci-store'].sort(),
  );
});

test('acceptance 3: send button larger min-height than generic buttons', function () {
  const css = readUtf8('controller/controller.css');
  const sendMatch = css.match(/\.btn-send-numbers\s*\{[^}]+\}/);
  assert.ok(sendMatch);
  const genericMatch = css.match(/button\.primary:not\(\.btn-send-numbers\)[^{]*\{[^}]+\}/);
  const sendMin = Number((sendMatch[0].match(/min-height:\s*(\d+)/) || [])[1]);
  let genericMin = 48;
  if (genericMatch) {
    const digit = (genericMatch[0].match(/min-height:\s*(\d+)/) || [])[1];
    if (digit) {
      genericMin = Number(digit);
    }
  }
  assert.ok(sendMin >= 56);
  assert.ok(sendMin > genericMin);
});

test('acceptance 4: quick send area has success bar and error slot markup', function () {
  const html = readUtf8('controller/index.html');
  assert.match(html, /data-testid="quick-send-success"/);
  assert.match(html, /data-testid="quick-send-error"/);
  const V = loadControllerView();
  assert.equal(V.shouldShowQuickSendSuccess({ isSuccess: true }), true);
  assert.equal(V.shouldShowQuickSendSuccess({ isSuccess: false }), false);
  assert.equal(V.shouldShowQuickSendSuccess(null), false);
});

test('acceptance 5 and 9: clear-board modal with store name and confirm/cancel controls', function () {
  const html = readUtf8('controller/index.html');
  assert.match(html, /data-testid="clear-board-modal"/);
  assert.match(html, /data-testid="btn-clear-confirm"/);
  assert.match(html, /data-testid="btn-clear-cancel"/);
  assert.match(html, /data-testid="clear-board-modal-store"/);
  const V = loadControllerView();
  assert.match(V.buildClearBoardModalBody('c030020'), /c030020/);
});

test('acceptance 6: test tools section collapsed by default', function () {
  const html = readUtf8('controller/index.html');
  assert.match(html, /id="sec-test-tools"/);
  assert.match(html, /data-testid="zone-toggle-test-tools"/);
  assert.match(html, /id="sec-test-tools"[^>]*data-default-expanded="0"/);
});

test('acceptance 7: core controller test zones and actions remain in HTML', function () {
  const html = readUtf8('controller/index.html');
  const required = [
    'btn-send-numbers',
    'btn-connect',
    'btn-clear-now',
    'btn-add-ticket',
    'btn-offline',
    'zone-toggle-pos',
    'zone-toggle-log',
  ];
  for (const id of required) {
    assert.match(html, new RegExp(`data-testid="${id}"|id="${id}"`));
  }
});

test('acceptance 8: board receiver entry files untouched on this branch', function () {
  const { execSync } = require('node:child_process');
  const diff = execSync('git diff origin/main --name-only', { cwd: ROOT, encoding: 'utf8' });
  const touched = diff
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const forbiddenPrefixes = ['js/board/', 'receiver/'];
  const hits = touched.filter((p) => forbiddenPrefixes.some((pre) => p.startsWith(pre)));
  assert.equal(hits.length, 0, `Board code paths must not change: ${hits.join(', ')}`);
});

test('acceptance 10: disconnected header pill label is 未連線', function () {
  const V = loadControllerView();
  assert.equal(V.formatConnectionPillLabel({ connected: false }), '未連線');
  assert.match(V.formatConnectionPillLabel({ connected: true, boardOnline: true }), /已連線/);
});

test('acceptance 11: tap targets at least 48px and send errors use quick-send-rule-note', function () {
  const css = readUtf8('controller/controller.css');
  assert.match(css, /--tap-min:\s*48px/);
  assert.match(css, /min-height:\s*var\(--tap-min\)/);
  const V = loadControllerView();
  assert.equal(V.quickSendFailureSurface(), 'quick-send-rule-note');
});
