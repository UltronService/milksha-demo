'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadMilkshaBoard() {
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
  const code = fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'milksha-board.js' });
  return sandbox.QMS.MilkshaBoard;
}

test('milksha brand layout is accepted by brand loader', function () {
  const coreCode = fs.readFileSync(path.join(ROOT, 'js', 'brand-loader.js'), 'utf8');
  const sandbox = {
    URLSearchParams: URLSearchParams,
    fetch: function () {},
    globalThis: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(coreCode, sandbox);
  const sample = {
    version: 1,
    brandId: 'milksha',
    displayName: '迷客夏',
    layout: 'milksha-callboard',
    theme: { primary: '#161616', accent: '#1565FF' },
    copy: { pickupHint: '請取餐', standbyFallback: 'logo-on-primary' },
    queue: { historyOrientation: 'horizontal', historyPageIntervalSec: 6 },
    audio: { tts: false, dingDong: true, mutedDefault: false },
    assets: { logo: 'assets/logo.svg' },
  };
  const validated = sandbox.QMS.validateBrand(sample, 'milksha');
  assert.equal(validated.layout, 'milksha-callboard');
});

test('partition and newly-ready detection follow demo script rings', function () {
  const MB = loadMilkshaBoard();
  const script = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'demo', 'milksha-demo-script.json'), 'utf8'),
  );

  let prevReady = new Set();
  let isFirst = true;
  const soundLog = [];

  for (let i = 0; i < script.length; i += 1) {
    const frame = script[i];
    const content = frame.request.serviceSpecialData_Json.data.number_content;
    const parts = MB.partitionNumberContent(content);
    const newly = MB.detectNewlyReady(prevReady, parts.ready);
    const split = MB.splitPopQueue(newly);

    if (!isFirst) {
      for (let p = 0; p < split.popIds.length; p += 1) {
        soundLog.push({ frame: i + 1, id: split.popIds[p] });
      }
    }

    const expect = frame._expectRing || [];
    if (!isFirst) {
      const expectedIds = expect.map(function (token) {
        const partsToken = token.split(':');
        return MB.makeItemId(partsToken[0], partsToken[1]);
      });
      const poppedIds = split.popIds;
      if (i + 1 === 8) {
        assert.equal(poppedIds.length, 3);
        assert.equal(JSON.stringify(poppedIds), JSON.stringify(expectedIds.slice(0, 3)));
      } else {
        assert.equal(JSON.stringify(poppedIds), JSON.stringify(expectedIds));
      }
    } else {
      assert.equal(newly.length, 0);
    }

    prevReady = new Set(
      parts.ready.map(function (r) {
        return r.id;
      }),
    );
    isFirst = false;
  }

  assert.equal(
    soundLog.filter(function (e) {
      return e.frame === 1;
    }).length,
    0,
  );
});

test('splitPopQueue caps at three', function () {
  const MB = loadMilkshaBoard();
  const ids = ['a:1', 'a:2', 'a:3', 'a:4', 'a:5'];
  const split = MB.splitPopQueue(ids);
  assert.deepEqual(split.popIds, ['a:1', 'a:2', 'a:3']);
  assert.deepEqual(split.silentFreshIds, ['a:4', 'a:5']);
});
