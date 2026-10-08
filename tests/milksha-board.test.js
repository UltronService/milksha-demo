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

test('each column page holds ten numbers in two-by-five grid', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.PAGE_SIZE, 10);
  assert.equal(MB.pageCountForItems(0), 1);
  assert.equal(MB.pageCountForItems(10), 1);
  assert.equal(MB.pageCountForItems(11), 2);
  assert.equal(MB.pageCountForItems(25), 3);

  const items = [];
  for (let n = 1; n <= 12; n += 1) {
    items.push({ number: String(1000 + n) });
  }
  const page0 = MB.layoutPageGrid(items, 0);
  assert.equal(page0.length, 10);
  assert.equal(page0[0].number, '1001');
  assert.equal(page0[9].number, '1010');
  const page1 = MB.layoutPageGrid(items, 1);
  assert.equal(page1[0].number, '1011');
  assert.equal(page1[1].number, '1012');

  const positions = MB.gridPositionsForCells(page0);
  const leftCol = positions.filter(function (p) {
    return p.col === 0;
  });
  const rightCol = positions.filter(function (p) {
    return p.col === 1;
  });
  assert.equal(leftCol.length, 5);
  assert.equal(rightCol.length, 5);
  assert.equal(leftCol[0].number, '1001');
  assert.equal(leftCol[4].number, '1005');
  assert.equal(rightCol[0].number, '1006');
  assert.equal(rightCol[4].number, '1010');
});

test('boot rings on new ready without overlay markup', async function () {
  const dom = {};
  const root = {
    className: '',
    innerHTML: '',
    style: { setProperty: function () {} },
  };
  dom['board-root'] = root;

  const played = [];
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
    Promise: Promise,
    Set: Set,
    URLSearchParams: URLSearchParams,
    requestAnimationFrame: function (fn) {
      fn();
    },
    addEventListener: function () {},
    innerWidth: 1920,
    innerHeight: 1080,
    __milkshaSoundLog: [],
  };
  sandbox.document = {
    getElementById: function (id) {
      if (id === 'board-root') {
        return root;
      }
      if (id === 'milksha-board-viewport' || id === 'milksha-board') {
        if (!dom[id]) {
          dom[id] = {
            innerHTML: '',
            style: {},
            classList: { toggle: function () {} },
          };
        }
        return dom[id];
      }
      return dom[id] || null;
    },
    addEventListener: function () {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'chime-policy.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);

  sandbox.QMS.createAudioManager = function () {
    return {
      setBrandAudio: function () {},
      setMuted: function () {},
      unlock: function () {},
      playDingDong: function () {
        played.push('ding');
        return Promise.resolve();
      },
    };
  };

  const brand = {
    displayName: '迷客夏',
    audio: { dingDong: true, mutedDefault: false },
    copy: { pickupHint: '請取餐' },
    assets: {},
  };
  const runtime = sandbox.QMS.bootMilkshaBoard(brand, { document: sandbox.document, window: sandbox });

  runtime.applyPayload([
    { source_type: 'From_Store_OK', number: '9001' },
    { source_type: 'From_Store_OK', number: '9002' },
  ]);
  assert.equal(played.length, 0);
  assert.equal(sandbox.__milkshaSoundLog.length, 0);
  assert.match(dom['milksha-board'].innerHTML, /milksha-cream/);
  assert.doesNotMatch(dom['milksha-board'].innerHTML, /milksha-ov/);

  runtime.applyPayload([
    { source_type: 'From_Store_OK', number: '9001' },
    { source_type: 'From_Store_OK', number: '9002' },
    { source_type: 'From_Store_OK', number: '9003' },
  ]);
  await Promise.resolve();
  assert.equal(played.length, 1);
  assert.deepEqual(sandbox.__milkshaSoundLog, ['store:9003']);

  runtime.applyPayload(
    [
      { source_type: 'From_Store_OK', number: '9001' },
      { source_type: 'From_Store_OK', number: '9002' },
      { source_type: 'From_Store_OK', number: '9003' },
    ],
    { silent: true },
  );
  await Promise.resolve();
  assert.equal(played.length, 1);

  runtime.applyPayload([
    { source_type: 'From_Store_OK', number: '9001' },
    { source_type: 'From_Store_OK', number: '9002' },
    { source_type: 'From_Store_OK', number: '9003' },
    { source_type: 'From_Store_OK', number: '9004' },
  ]);
  await Promise.resolve();
  assert.equal(played.length, 2);
  assert.deepEqual(sandbox.__milkshaSoundLog, ['store:9003', 'store:9004']);
  runtime.destroy();
});

test('computeViewportScale uniform fit without upscale cap', function () {
  const MB = loadMilkshaBoard();
  assert.equal(MB.DESIGN_LANDSCAPE_W, 1920);
  assert.equal(MB.DESIGN_LANDSCAPE_H, 1080);
  assert.equal(MB.computeViewportScale(1920, 1080, 1920, 1080), 1);
  assert.equal(MB.computeViewportScale(3840, 2160, 1920, 1080), 2);
  assert.equal(MB.computeViewportScale(1440, 1080, 1920, 1080), 0.75);
  assert.ok(Math.abs(MB.computeViewportScale(1920, 800, 1920, 1080) - 800 / 1080) < 1e-9);
});
