'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadCore() {
  const sandbox = { globalThis: {}, Intl: Intl, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readUtf8('pos2756-test/pos2756-test-core.js'), sandbox);
  return sandbox.QMS.Pos2756Test.Core;
}

function firstInlineScriptBody(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  return m ? m[1] : '';
}

test('spec 1: pos2756-test page exists and board receiver paths are not changed on branch', function () {
  assert.ok(fs.existsSync(path.join(ROOT, 'pos2756-test', 'index.html')));
  const html = readUtf8('pos2756-test/index.html');
  assert.match(html, /pos2756-test/);
  const diff = execSync('git diff origin/main --name-only', { cwd: ROOT, encoding: 'utf8' });
  const touched = diff
    .split('\n')
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  const boardAllow = new Set([
    'js/board/board-pos-time-fields.js',
    'js/board/board-item-sort.js',
    'js/board/today-board.js',
  ]);
  const forbidden = touched.filter(function (p) {
    if (p.startsWith('receiver/')) {
      return true;
    }
    if (p.startsWith('js/board/') && !boardAllow.has(p)) {
      return true;
    }
    return false;
  });
  assert.equal(forbidden.length, 0, 'board paths must stay untouched: ' + forbidden.join(', '));
});

test('spec 2: first inline script defines getOrderStatus and getSoldoutItem before external scripts', function () {
  const html = readUtf8('pos2756-test/index.html');
  const inlineIdx = html.indexOf('<script');
  const srcIdx = html.indexOf('<script src=');
  assert.ok(inlineIdx >= 0 && (srcIdx < 0 || inlineIdx < srcIdx));
  const inline = firstInlineScriptBody(html);
  assert.match(inline, /window\.getOrderStatus\s*=/);
  assert.match(inline, /window\.getSoldoutItem\s*=/);
});

test('spec 3: getOrderStatus line uses Taipei time and raw argument without parsing payload', function () {
  const C = loadCore();
  const fixed = new Date('2026-10-17T15:49:06.451Z');
  const obj = {
    preparing: [],
    done: ['9001'],
    clear: [],
    orderType: 1,
    totalAmount: 1,
    totalTime: 0,
  };
  const lineObj = C.buildOrderStatusLine(obj, fixed);
  assert.match(lineObj, /^2026-10-17 23:49:06 /);
  assert.ok(lineObj.indexOf('"done":["9001"]') >= 0);
  const rawJson =
    '{"preparing":[],"done":["9001"],"clear":[],"orderType":1,"totalAmount":1,"totalTime":0}';
  const lineStr = C.buildOrderStatusLine(rawJson, fixed);
  assert.equal(lineStr, '2026-10-17 23:49:06 ' + rawJson);
});

test('spec 4: three log lines prepend with newest on top', function () {
  const C = loadCore();
  const t = new Date('2026-10-17T10:00:00.000Z');
  let lines = [];
  lines = C.prependLogLine(lines, C.buildOrderStatusLine('a', t), C.MAX_LOG_LINES);
  lines = C.prependLogLine(lines, C.buildOrderStatusLine('b', t), C.MAX_LOG_LINES);
  lines = C.prependLogLine(lines, C.buildOrderStatusLine('c', t), C.MAX_LOG_LINES);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].endsWith(' c'));
  assert.ok(lines[2].endsWith(' a'));
});

test('spec 5: empty or malformed input still yields one line and handlers never throw', function () {
  const C = loadCore();
  const t = new Date('2026-10-17T10:00:00.000Z');
  const weird = [{ circular: null }];
  weird[0].circular = weird[0];
  assert.doesNotThrow(function () {
    C.safeCallOrderStatus(function (raw) {
      C.buildOrderStatusLine(raw, t);
    }, undefined);
    C.safeCallOrderStatus(function (raw) {
      C.buildOrderStatusLine(raw, t);
    }, weird);
    C.safeCallOrderStatus(function () {
      throw new Error('inner');
    }, 'x');
  });
  const emptyLine = C.buildOrderStatusLine(undefined, t);
  assert.match(emptyLine, /^2026-10-17 18:00:00 $/);
});

test('spec 6: getSoldoutItem line is labelled and does not throw', function () {
  const C = loadCore();
  const t = new Date('2026-10-17T10:00:00.000Z');
  const line = C.buildSoldoutLine({ sku: 'x' }, t);
  assert.match(line, / getSoldoutItem /);
  assert.doesNotThrow(function () {
    C.safeCallSoldout(function (raw) {
      C.buildSoldoutLine(raw, t);
    }, null);
  });
});

test('spec 7: Firestore summary uses string deviceId 5848 and counts only since page open', function () {
  const C = loadCore();
  const q = C.buildDeviceLogQuery(5848, 10);
  assert.equal(q.structuredQuery.where.fieldFilter.value.stringValue, '5848');
  const pageOpen = '2026-10-17T15:00:00.000Z';
  const rows = [
    { id: 'new2', createTime: '2026-10-17T16:00:00.000Z', receiveTime: '2026-10-17 23:47:41' },
    { id: 'new1', createTime: '2026-10-17T15:30:00.000Z', receiveTime: '2026-10-17 23:30:00' },
    { id: 'old', createTime: '2026-10-17T14:00:00.000Z', receiveTime: '2026-10-17 22:00:00' },
  ];
  const summary = C.summarizeDeviceLogs(rows, pageOpen);
  assert.equal(summary.latestReceiveTime, '2026-10-17 23:47:41');
  assert.equal(summary.countSinceOpen, 2);
  assert.match(C.formatTopStatusOk(summary), /本頁開啟後筆數=2/);
});

test('spec 8: top section shows 讀不到 and reason when read fails', function () {
  const C = loadCore();
  const text = C.formatTopStatusError('permission-denied');
  assert.match(text, /^讀不到/);
  assert.match(text, /permission-denied/);
});

test('spec 9: bottom log keeps at most 200 lines', function () {
  const C = loadCore();
  let lines = [];
  for (let i = 0; i < 205; i++) {
    lines = C.prependLogLine(lines, 'line-' + i, C.MAX_LOG_LINES);
  }
  assert.equal(lines.length, 200);
  assert.ok(lines[0].indexOf('line-204') >= 0);
});

test('spec 10: page is minimal read-only diagnostic without board assets or motion', function () {
  const html = readUtf8('pos2756-test/index.html');
  assert.doesNotMatch(html, /js\/board\//);
  assert.doesNotMatch(html, /milksha-board\.css/);
  assert.doesNotMatch(html, /animation|@keyframes|audio/i);
  const pageJs = readUtf8('pos2756-test/pos2756-test-page.js');
  const coreJs = readUtf8('pos2756-test/pos2756-test-core.js');
  assert.doesNotMatch(pageJs, /\.set\(|\.update\(|\.delete\(/);
  assert.match(coreJs, /documents:runQuery/);
  assert.match(pageJs, /firestoreRunQueryUrl/);
});
