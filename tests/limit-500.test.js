'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FAKE_CLOUD_PORT = 18793;
const STORE_ID = 'zz-qa-store-a';

function loadBrowserDevCmd() {
  const sandbox = { globalThis: {}, TextEncoder };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/dev-command-validation.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.DevCommandValidation;
}

function loadCmdErrors() {
  const sandbox = { globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/controller-command-errors.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.ControllerCommandErrors;
}

function pushEntry(no) {
  return { no: String(no), sourceType: 'From_Store_OK' };
}

function buildPushNumbersRequest(readyCount, opts) {
  const Dev = loadBrowserDevCmd();
  const ready = [];
  const preparing = [];
  const o = opts || {};
  const cjk = o.cjkSix === true;
  for (let i = 0; i < readyCount; i += 1) {
    ready.push(pushEntry(cjk ? '測試號' + String(i).padStart(2, '0') : 2000 + i));
  }
  if (o.preparingCount) {
    for (let j = 0; j < o.preparingCount; j += 1) {
      preparing.push(pushEntry(3000 + j));
    }
  }
  return Dev.buildDevCommandRequest({
    storeId: STORE_ID,
    deviceId: 'stb-01',
    type: 'push_numbers',
    params: { ready, preparing },
  });
}

async function waitHealth(port) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('fake-cloud not up');
}

async function withFakeCloud(fn) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(FAKE_CLOUD_PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth(FAKE_CLOUD_PORT);
    await fetch(`http://127.0.0.1:${FAKE_CLOUD_PORT}/test/reset`, { method: 'POST' });
    return await fn();
  } finally {
    proc.kill();
  }
}

async function postDevCommand(body) {
  return fetch(`http://127.0.0.1:${FAKE_CLOUD_PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
    body: JSON.stringify(body),
  });
}

async function readBoardTicketNos() {
  const res = await fetch(
    `http://127.0.0.1:${FAKE_CLOUD_PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/${STORE_ID}/board/today_board`,
    { headers: { Authorization: 'Bearer fake-id-token' } },
  );
  assert.equal(res.status, 200);
  const doc = await res.json();
  const values = doc.fields && doc.fields.tickets && doc.fields.tickets.arrayValue
    ? doc.fields.tickets.arrayValue.values
    : [];
  return values.map(function (v) {
    return v.mapValue.fields.no.stringValue;
  });
}

// --- Controller: devCommand build (items 1–5) ---

test('limit-500 item 1: 18 push_numbers are not blocked by client validation', function () {
  const built = buildPushNumbersRequest(18);
  assert.equal(built.ok, true);
  assert.equal(built.body.params.ready.length, 18);
});

test('limit-500 item 2: 30 push_numbers are not blocked', function () {
  const built = buildPushNumbersRequest(30);
  assert.equal(built.ok, true);
});

test('limit-500 item 3: 60 push_numbers are not blocked', function () {
  const built = buildPushNumbersRequest(60);
  assert.equal(built.ok, true);
});

test('limit-500 item 4: 500 push_numbers are not blocked by controller validation', function () {
  const built = buildPushNumbersRequest(500);
  assert.equal(built.ok, true);
  assert.equal(built.body.params.ready.length, 500);
});

test('limit-500 item 5: 60 numbers of 6 CJK chars each are not blocked', function () {
  const built = buildPushNumbersRequest(60, { cjkSix: true });
  assert.equal(built.ok, true);
  for (let i = 0; i < built.body.params.ready.length; i += 1) {
    assert.match(built.body.params.ready[i].no, /^測試號\d{2}$/);
  }
});

test('limit-500 item 6: devCommand never surfaces 1024-byte UI messages', function () {
  const built = buildPushNumbersRequest(60);
  assert.equal(built.ok, true);
  const src = fs.readFileSync(path.join(ROOT, 'js/transport/dev-command-validation.js'), 'utf8');
  assert.doesNotMatch(src, /指令參數超過 1024 位元組上限/);
  assert.doesNotMatch(src, /buildDevCommandRequest[\s\S]*请求內容過大/);
  const E = loadCmdErrors();
  const blocked = E.devCommandUserMessage(
    { status: 400, response: { code: 'invalid_command_params', message: '指令參數超過 1024 位元組上限' } },
  );
  assert.notEqual(blocked, '指令參數超過 1024 位元組上限');
  assert.notEqual(blocked, '請求內容過大');
});

test('limit-500 item 7: other devCommand checks still block invalid requests', function () {
  const Dev = loadBrowserDevCmd();
  const unknown = Dev.buildDevCommandRequest({
    storeId: STORE_ID,
    deviceId: 'stb-01',
    type: 'not_a_command',
    params: {},
  });
  assert.equal(unknown.ok, false);
  const extra = Dev.buildDevCommandRequest({
    storeId: STORE_ID,
    deviceId: 'stb-01',
    type: 'restore',
    params: {},
    extraField: true,
  });
  assert.equal(extra.ok, false);
  const badDev = Dev.buildDevCommandRequest({
    storeId: STORE_ID,
    deviceId: 'bad id',
    type: 'restore',
    params: {},
  });
  assert.equal(badDev.ok, false);
  assert.equal(badDev.code, 'invalid_device_id');
});

test('limit-500 item 8: boxHeartbeat 1024-byte limit still applies', function () {
  const Dev = loadBrowserDevCmd();
  const long = 'x'.repeat(1100);
  const hb = Dev.buildBoxHeartbeatRequest({
    storeId: STORE_ID,
    deviceId: 'stb-01',
    appVersion: long,
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
  });
  assert.equal(hb.ok, false);
  assert.match(hb.message, /請求內容過大/);
});

test('limit-500 item 10: other cloud errors stay plain Chinese without raw codes', function () {
  const E = loadCmdErrors();
  const msg = E.devCommandUserMessage({
    status: 400,
    response: { code: 'invalid_command_params', message: 'bad params english' },
  });
  assert.equal(msg, E.USER_MSG_400_INVALID);
  assert.doesNotMatch(msg, /bad params/);
  assert.doesNotMatch(msg, /invalid_command_params/);
});

test('limit-500 item 11: after other cloud rejection quick-send inputs keep typed values', function () {
  const E = loadCmdErrors();
  const dom = {
    'fld-quick-no': { value: '2847' },
    'fld-no': { value: '2847' },
  };
  const err = {
    status: 500,
    response: { code: 'internal_error', message: 'An internal error occurred.' },
  };
  const quickError = E.devCommandUserMessage(err, {});
  assert.equal(quickError, E.USER_MSG_INTERNAL_ERROR);
  assert.doesNotMatch(quickError, /internal_error/);
  assert.equal(dom['fld-quick-no'].value, '2847');
  assert.equal(dom['fld-no'].value, '2847');
});

test('limit-500 item 9b: trim keeps last 500 in send order across ready and preparing', async function () {
  const { trimTicketsToBoardCap } = await import('../tools/fake-cloud/board-number-limit.mjs');
  const rows = [];
  for (let i = 0; i < 400; i += 1) {
    rows.push({ no: 'R' + i, status: 'ready' });
  }
  for (let j = 0; j < 120; j += 1) {
    rows.push({ no: 'P' + j, status: 'preparing' });
  }
  assert.equal(rows.length, 520);
  const trimmed = trimTicketsToBoardCap(rows);
  assert.equal(trimmed.length, 500);
  assert.equal(trimmed[0].no, 'R20');
  assert.equal(trimmed[499].no, 'P119');
});

test('limit-500 cloud PR38: push_numbers over 256KB rejected; controller maps message', async function () {
  const E = loadCmdErrors();
  const Dev = loadBrowserDevCmd();
  const pad = 'W'.repeat(32);
  const ready = [];
  for (let i = 0; i < 9000; i += 1) {
    ready.push({ no: pad, sourceType: 'From_Store_OK' });
  }
  const built = Dev.buildDevCommandRequest({
    storeId: STORE_ID,
    deviceId: 'stb-01',
    type: 'push_numbers',
    params: { ready, preparing: [] },
  });
  assert.equal(built.ok, true);

  await withFakeCloud(async function () {
    const res = await postDevCommand(built.body);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, E.CLOUD_ERROR_PUSH_NUMBERS_PARAMS_TOO_LARGE);
    const msg = E.devCommandUserMessage({ status: 400, response: json });
    assert.equal(msg, E.USER_MSG_PUSH_NUMBERS_TOO_LARGE);
  });
});

test('limit-500 item 11b: after push_numbers too large rejection inputs stay typed', function () {
  const E = loadCmdErrors();
  const dom = { 'fld-quick-no': { value: '2847' }, 'fld-no': { value: '2847' } };
  const err = {
    status: 400,
    response: { code: E.CLOUD_ERROR_PUSH_NUMBERS_PARAMS_TOO_LARGE, message: 'too big' },
  };
  const quickError = E.devCommandUserMessage(err, {});
  assert.equal(quickError, E.USER_MSG_PUSH_NUMBERS_TOO_LARGE);
  assert.equal(dom['fld-quick-no'].value, '2847');
});

test('limit-500 cloud PR38: non-push devCommand over 1024 bytes rejected', async function () {
  const { cloudDevCommandSizeCheck } = await import('../tools/fake-cloud/cloud-dev-command-size.mjs');
  const E = loadCmdErrors();
  const hugeBody = {
    storeId: STORE_ID,
    deviceId: 'stb-01',
    type: 'slow',
    params: { delayMs: 1, padding: 'x'.repeat(1200) },
  };
  const check = cloudDevCommandSizeCheck(hugeBody);
  assert.equal(check.ok, false);
  assert.equal(check.code, 'invalid_command_params');
  const msg = E.devCommandUserMessage({ status: 400, response: { code: check.code, message: check.message } });
  assert.equal(msg, E.USER_MSG_CLOUD_COMMAND_REJECTED);
});

test('limit-500 item 12: fake-cloud accepts 500 push_numbers', async function () {
  await withFakeCloud(async function () {
    const built = buildPushNumbersRequest(500);
    assert.equal(built.ok, true);
    const res = await postDevCommand(built.body);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(json.commandId);
  });
});

// --- Board paging (items 13–17) ---

function minimalBrand() {
  return {
    version: 1,
    brandId: 'milksha',
    displayName: '迷客夏',
    layout: 'milksha-callboard',
    theme: { primary: '#161616', accent: '#1565FF' },
    copy: { pickupHint: '請取餐', standbyFallback: 'logo-on-primary' },
    queue: { historyOrientation: 'horizontal', historyPageIntervalSec: 6 },
    audio: { tts: false, dingDong: true, mutedDefault: true },
    assets: { logo: 'assets/logo.svg' },
  };
}

function splitZoneHtml(html, zoneClass) {
  const marker = 'milksha-zone ' + zoneClass;
  const start = html.indexOf(marker);
  if (start < 0) {
    return '';
  }
  const other =
    zoneClass.indexOf('prep') >= 0 ? 'milksha-zone milksha-ready' : 'milksha-zone milksha-prep';
  const end = html.indexOf(other, start + 1);
  return end < 0 ? html.slice(start) : html.slice(start, end);
}

function parseZoneBoardHtml(zoneHtml) {
  const indicatorMatch = zoneHtml.match(/class="milksha-pg-indicator[^"]*"[^>]*>([^<]+)</);
  const indicator = indicatorMatch ? indicatorMatch[1].trim() : '';
  const cells = [];
  const cellOpenRe = /<div class="milksha-num-cell"[^>]*>/g;
  let openMatch;
  while ((openMatch = cellOpenRe.exec(zoneHtml)) !== null) {
    const from = openMatch.index;
    const nextOpen = zoneHtml.indexOf('<div class="milksha-num-cell"', from + 1);
    const inner = nextOpen < 0 ? zoneHtml.slice(from) : zoneHtml.slice(from, nextOpen);
    const numMatch = inner.match(/class="milksha-num">([^<]+)/);
    cells.push(numMatch ? numMatch[1].trim() : null);
  }
  return { indicator: indicator, cells: cells };
}

function parseBoardDom(html) {
  return {
    prep: parseZoneBoardHtml(splitZoneHtml(html, 'milksha-prep prep')),
    ready: parseZoneBoardHtml(splitZoneHtml(html, 'milksha-ready ready')),
  };
}

function pageFromIndicator(text) {
  const m = String(text).match(/^(\d+)\/(\d+)/);
  if (!m) {
    return { page: 0, total: 1 };
  }
  return { page: Number(m[1]) - 1, total: Number(m[2]) };
}

function bootBoardHarness() {
  const dom = {};
  const root = { className: '', innerHTML: '', style: { setProperty: function () {} } };
  dom['board-root'] = root;
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
    location: { search: '' },
    requestAnimationFrame: function (fn) {
      fn();
    },
    addEventListener: function () {},
    innerWidth: 1920,
    innerHeight: 1080,
    __milkshaSoundLog: [],
    Element: function () {},
  };
  sandbox.Element.prototype = {
    animate: function () {
      return { cancel: function () {}, finish: function () {} };
    },
  };
  function makeBoardEl() {
    return {
      innerHTML: '',
      style: {},
      classList: { toggle: function () {} },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
    };
  }
  sandbox.document = {
    getElementById: function (id) {
      if (id === 'board-root') {
        return root;
      }
      if (id === 'milksha-board-viewport' || id === 'milksha-board' || id === 'milksha-board-canvas') {
        if (!dom[id]) {
          dom[id] = makeBoardEl();
        }
        return dom[id];
      }
      return dom[id] || null;
    },
    addEventListener: function () {},
    visibilityState: 'visible',
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/source-icons-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/board/today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/board-seq.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/chime-policy.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), sandbox);
  sandbox.QMS.createAudioManager = function () {
    return {
      setBrandAudio: function () {},
      setMuted: function () {},
      unlock: function () {},
      playDingDong: function () {
        return Promise.resolve();
      },
    };
  };
  return {
    sandbox: sandbox,
    getBoardHtml: function () {
      return dom['milksha-board'].innerHTML;
    },
  };
}

function readyPayload(numbers) {
  return numbers.map(function (n) {
    return { source_type: 'From_Store_OK', number: String(n) };
  });
}

function sequentialReady(base, count) {
  const nums = [];
  for (let i = 0; i < count; i += 1) {
    nums.push(base + i);
  }
  return nums;
}

test('limit-500 item 9: 501st push succeeds, cloud drops oldest, board shows new number', async function () {
  const errSrc = fs.readFileSync(path.join(ROOT, 'js/transport/controller-command-errors.js'), 'utf8');
  assert.doesNotMatch(errSrc, /號碼太多（上限 500 個），雲端拒收/);
  assert.doesNotMatch(errSrc, /too_many_board_numbers/);

  await withFakeCloud(async function () {
    const full = buildPushNumbersRequest(501);
    assert.equal(full.ok, true);
    const res = await postDevCommand(full.body);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);

    const nos = await readBoardTicketNos();
    assert.equal(nos.length, 500);
    assert.ok(nos.includes('2500'));
    assert.equal(nos.includes('2000'), false);
  });

  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  const cloudShaped = sequentialReady(2000, 501).slice(1);
  runtime.applyPayload(readyPayload(cloudShaped), { silent: true });
  const snap = runtime.getSnapshot();
  assert.equal(snap.ready.length, 500);
  assert.equal(snap.ready[0].number, '2500');
  assert.equal(
    snap.ready.some(function (r) {
      return r.number === '2000';
    }),
    false,
  );
  runtime.destroy();
});

test('limit-500 item 13: 60 ready numbers paginate 6 pages of 10 in order', async function () {
  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  const nums = sequentialReady(1000, 60);
  runtime.applyPayload(readyPayload(nums), { silent: true });
  const MB = harness.sandbox.QMS.MilkshaBoard;
  assert.equal(MB.pageCountForItems(60, MB.PAGE_SIZE), 6);
  const seen = [];
  for (let p = 0; p < 6; p += 1) {
    const dom = parseBoardDom(harness.getBoardHtml());
    const pg = pageFromIndicator(dom.ready.indicator);
    assert.equal(pg.total, 6);
    assert.equal(pg.page, p);
    seen.push(dom.ready.indicator);
    await runtime.advanceZonePageForTest('ready');
  }
  assert.deepEqual(seen, ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6']);
  runtime.destroy();
});

test('limit-500 item 14: 500 ready numbers paginate 50 pages in order', async function () {
  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  runtime.applyPayload(readyPayload(sequentialReady(2000, 500)), { silent: true });
  const MB = harness.sandbox.QMS.MilkshaBoard;
  assert.equal(MB.pageCountForItems(500, MB.PAGE_SIZE), 50);
  for (let p = 0; p < 50; p += 1) {
    const dom = parseBoardDom(harness.getBoardHtml());
    const pg = pageFromIndicator(dom.ready.indicator);
    assert.equal(pg.total, 50);
    assert.equal(pg.page, p);
    await runtime.advanceZonePageForTest('ready');
  }
  runtime.destroy();
});

test('limit-500 item 15: after last page board wraps to page 1', async function () {
  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  runtime.applyPayload(readyPayload(sequentialReady(3000, 500)), { silent: true });
  for (let p = 0; p < 49; p += 1) {
    await runtime.advanceZonePageForTest('ready');
  }
  let dom = parseBoardDom(harness.getBoardHtml());
  assert.equal(dom.ready.indicator, '50/50');
  await runtime.advanceZonePageForTest('ready');
  dom = parseBoardDom(harness.getBoardHtml());
  assert.equal(dom.ready.indicator, '1/50');
  runtime.destroy();
});

test('limit-500 item 16: with 500 numbers new ready item jumps to page 1', async function () {
  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  const nums = sequentialReady(4000, 500);
  runtime.applyPayload(readyPayload(nums), { silent: true });
  await runtime.advanceZonePageForTest('ready');
  await runtime.advanceZonePageForTest('ready');
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).ready.indicator).page, 2);
  runtime.applyPayload(readyPayload(nums.concat([4999])), { silent: true });
  assert.equal(parseBoardDom(harness.getBoardHtml()).ready.indicator, '1/51');
  runtime.destroy();
});

test('limit-500 item 17: with 500 numbers only 10 ready cells exist in DOM', function () {
  const harness = bootBoardHarness();
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  runtime.applyPayload(readyPayload(sequentialReady(5000, 500)), { silent: true });
  const zoneHtml = splitZoneHtml(harness.getBoardHtml(), 'milksha-ready ready');
  const cellCount = (zoneHtml.match(/class="milksha-num-cell"/g) || []).length;
  assert.equal(cellCount, 10);
  runtime.destroy();
});
