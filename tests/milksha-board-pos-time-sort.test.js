'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FX = require('./fixtures/pos-time-cloud-tickets');

const STORE = FX.STORE_ID;

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

const BOARD_SCRIPT_CHAIN = [
  'js/board/board-pos-time-fields.js',
  'js/board/board-item-sort.js',
  'js/board/landscape-art-layout.js',
  'js/board/source-icons-layout.js',
  'js/board/milksha-board-anim-config.js',
  'js/board/milksha-board-anim.js',
  'js/board/today-board.js',
  'js/transport/board-seq.js',
  'js/receiver/chime-policy.js',
  'js/milksha-board.js',
];

function runScripts(sandbox, relPaths) {
  for (let i = 0; i < relPaths.length; i += 1) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, relPaths[i]), 'utf8'), sandbox, {
      filename: relPaths[i],
    });
  }
}

function assertOrder(actualFn, expected) {
  assert.equal(JSON.stringify(actualFn()), JSON.stringify(expected));
}

function bootMilkshaHarness(locationSearch, timerOpts) {
  const dom = {};
  const root = { className: '', innerHTML: '', style: { setProperty: function () {} } };
  dom['board-root'] = root;
  const RealDate = Date;
  let nowMs =
    timerOpts && Number.isFinite(timerOpts.startMs) ? timerOpts.startMs : 1_900_000_000_000;
  const intervals = [];

  function MockDate(...args) {
    if (args.length === 0) {
      return new RealDate(nowMs);
    }
    return new RealDate(...args);
  }
  MockDate.now = function () {
    return nowMs;
  };
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;

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

  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    setInterval: function (fn, ms) {
      intervals.push({ fn: fn, ms: ms, nextAt: nowMs + ms });
      return intervals.length;
    },
    Date: MockDate,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Number: Number,
    String: String,
    Promise: Promise,
    Error: Error,
    Set: Set,
    URLSearchParams: URLSearchParams,
    location: { search: locationSearch || '', href: 'http://localhost/' + (locationSearch || '') },
    requestAnimationFrame: function (fn) {
      fn();
    },
    addEventListener: function () {},
    innerWidth: 1920,
    innerHeight: 1080,
  };
  sandbox.document = {
    getElementById: function (id) {
      if (id === 'board-root') {
        return root;
      }
      if (
        id === 'milksha-board-viewport' ||
        id === 'milksha-board' ||
        id === 'milksha-board-canvas'
      ) {
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
  sandbox.Element = function () {};
  sandbox.Element.prototype = {
    animate: function () {
      return { cancel: function () {}, finish: function () {} };
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  runScripts(sandbox, BOARD_SCRIPT_CHAIN);
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
  sandbox.__setNowMs = function (ms) {
    nowMs = ms;
  };
  sandbox.__advanceBoardTimers = function (deltaMs) {
    nowMs += deltaMs;
    for (let round = 0; round < 8; round += 1) {
      let fired = false;
      for (let i = 0; i < intervals.length; i += 1) {
        const entry = intervals[i];
        while (entry.nextAt <= nowMs) {
          entry.fn();
          entry.nextAt += entry.ms;
          fired = true;
        }
      }
      if (!fired) {
        break;
      }
    }
  };
  const runtime = sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: sandbox.document,
    window: sandbox,
  });
  return {
    sandbox,
    runtime,
    getBoardHtml: function () {
      return dom['milksha-board'] ? dom['milksha-board'].innerHTML : '';
    },
  };
}

function ticketsToContent(tickets) {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runScripts(sandbox, ['js/board/board-pos-time-fields.js', 'js/board/today-board.js']);
  return sandbox.QMS.Board.TodayBoard.ticketsToNumberContent(tickets);
}

function prepRow(no, extra) {
  return Object.assign({ source_type: 'From_Store_Preparing', number: String(no) }, extra || {});
}

function readyRow(no, extra) {
  return Object.assign({ source_type: 'From_Store_OK', number: String(no) }, extra || {});
}

function prepNums(snap) {
  return snap.preparing.map(function (p) {
    return String(p.number);
  });
}

function readyNums(snap) {
  return snap.ready.map(function (r) {
    return String(r.number);
  });
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

function pageFromIndicator(text) {
  const m = String(text).match(/^(\d+)\//);
  return m ? Number(m[1]) - 1 : 0;
}

function parseZoneBoardHtml(zoneHtml) {
  const indicatorMatch = zoneHtml.match(/class="milksha-pg-indicator[^"]*"[^>]*>([^<]+)</);
  const indicator = indicatorMatch ? indicatorMatch[1].trim() : '';
  return { indicator: indicator };
}

function loadCloudHarness(nowIso) {
  const storage = {};
  const boardHarness = bootMilkshaHarness('', {
    startMs: nowIso ? Date.parse(nowIso) : Date.now(),
  });
  const sandbox = boardHarness.sandbox;
  sandbox.localStorage = {
    getItem: function (k) {
      return storage[k] ?? null;
    },
    setItem: function (k, v) {
      storage[k] = String(v);
    },
    removeItem: function (k) {
      delete storage[k];
    },
  };
  runScripts(sandbox, [
    'js/receiver/validate-request.js',
    'js/receiver/device-command-time.js',
    'js/receiver/cloud-runtime.js',
  ]);
  return { sandbox, storage, milkshaRuntime: boardHarness.runtime };
}

function boardDocFromTickets(tickets, seq) {
  return {
    data: {
      storeId: STORE,
      businessDate: '2026-10-20',
      seq: seq,
      updatedAt: '2026-10-20T08:00:00.000Z',
      source: 'A',
      tickets: tickets,
    },
    httpDate: 'Mon, 20 Oct 2026 08:00:00 GMT',
    httpDateReadable: true,
  };
}

test('1 preparing sorted by firstSeenPosAtMs newest first', function () {
  const { runtime } = bootMilkshaHarness();
  runtime.applyPayload(ticketsToContent(FX.PREPARING_POS_SORT_TICKETS), { silent: true });
  assertOrder(function () {
    return prepNums(runtime.getSnapshot());
  }, ['3003', '3002', '3001']);
  runtime.destroy();
});

test('2 ready sorted by readyPosAtMs newest first', function () {
  const { runtime } = bootMilkshaHarness();
  runtime.applyPayload(ticketsToContent(FX.READY_POS_SORT_TICKETS), { silent: true });
  assertOrder(function () {
    return readyNums(runtime.getSnapshot());
  }, ['4003', '4002', '4001']);
  runtime.destroy();
});

test('3 preparing to ready sorts by readyPosAtMs not firstSeenPosAtMs', function () {
  const { runtime } = bootMilkshaHarness();
  const tickets = [
    FX.ticket('6001', 'ready', {
      firstSeenPosAtMs: FX.T3,
      readyPosAtMs: FX.T0,
      readySeqInBatch: 0,
    }),
    FX.ticket('6002', 'ready', {
      firstSeenPosAtMs: FX.T0,
      readyPosAtMs: FX.T3,
      readySeqInBatch: 1,
    }),
  ];
  runtime.applyPayload(ticketsToContent(tickets), { silent: true });
  assertOrder(function () {
    return readyNums(runtime.getSnapshot());
  }, ['6002', '6001']);
  runtime.destroy();
});

test('4 late board receive still orders by POS time', function () {
  const h1 = bootMilkshaHarness('', { startMs: FX.T0 });
  h1.runtime.applyPayload(ticketsToContent(FX.PREPARING_POS_SORT_TICKETS), { silent: true });
  const orderA = prepNums(h1.runtime.getSnapshot());
  h1.runtime.destroy();

  const h2 = bootMilkshaHarness('', { startMs: FX.T3 + 999_999 });
  h2.runtime.applyPayload(ticketsToContent(FX.PREPARING_POS_SORT_TICKETS), { silent: true });
  const orderB = prepNums(h2.runtime.getSnapshot());
  assert.equal(JSON.stringify(orderA), JSON.stringify(orderB));
  h2.runtime.destroy();
});

test('5 two boards opened at different times show identical order', function () {
  const h1 = bootMilkshaHarness('', { startMs: 1_000_000 });
  const h2 = bootMilkshaHarness('', { startMs: 9_999_999_999 });
  const payload = ticketsToContent(FX.READY_POS_SORT_TICKETS);
  h1.runtime.applyPayload(payload, { silent: true });
  h2.runtime.applyPayload(payload, { silent: true });
  assert.equal(
    JSON.stringify(readyNums(h1.runtime.getSnapshot())),
    JSON.stringify(readyNums(h2.runtime.getSnapshot())),
  );
  h1.runtime.destroy();
  h2.runtime.destroy();
});

test('6 after reload equivalent payloads match order', function () {
  const payload = ticketsToContent(FX.PREPARING_POS_SORT_TICKETS);
  const h1 = bootMilkshaHarness();
  h1.runtime.applyPayload(payload, { silent: true });
  const first = prepNums(h1.runtime.getSnapshot());
  h1.runtime.destroy();
  const h2 = bootMilkshaHarness();
  h2.runtime.applyPayload(payload, { silent: true });
  assert.equal(JSON.stringify(prepNums(h2.runtime.getSnapshot())), JSON.stringify(first));
  h2.runtime.destroy();
});

test('7 same POS time: earlier seqInBatch appears earlier on board', function () {
  const { runtime } = bootMilkshaHarness();
  const tickets = [
    FX.ticket('7003', 'preparing', { firstSeenPosAtMs: FX.T2, seqInBatch: 2 }),
    FX.ticket('7001', 'preparing', { firstSeenPosAtMs: FX.T2, seqInBatch: 0 }),
    FX.ticket('7002', 'preparing', { firstSeenPosAtMs: FX.T2, seqInBatch: 1 }),
  ];
  runtime.applyPayload(ticketsToContent(tickets), { silent: true });
  assertOrder(function () {
    return prepNums(runtime.getSnapshot());
  }, ['7001', '7002', '7003']);
  runtime.destroy();
});

test('8 equal time and seq: order by number ascending', function () {
  const { runtime } = bootMilkshaHarness();
  runtime.applyPayload(ticketsToContent(FX.READY_TIE_SEQ_TICKETS), { silent: true });
  assertOrder(function () {
    return readyNums(runtime.getSnapshot());
  }, ['5001', '5010', '5002']);
  runtime.destroy();
});

test('9 delivery and store numbers share POS tie rules', function () {
  const { runtime } = bootMilkshaHarness();
  runtime.applyPayload(ticketsToContent(FX.MIXED_DELIVERY_TICKETS), { silent: true });
  assertOrder(function () {
    return readyNums(runtime.getSnapshot());
  }, ['578', '7112']);
  runtime.destroy();
});

test('10 missing POS times fall back to cloud updatedAt on row', function () {
  const { runtime } = bootMilkshaHarness();
  const updLate = '2026-10-20T10:00:00.000Z';
  const updEarly = '2026-10-20T09:00:00.000Z';
  runtime.applyPayload(
    [
      prepRow('8001', { updatedAt: updEarly }),
      prepRow('8002', { updatedAt: updLate }),
    ],
    { silent: true },
  );
  assertOrder(function () {
    return prepNums(runtime.getSnapshot());
  }, ['8002', '8001']);
  runtime.destroy();
});

test('11 missing POS and updatedAt uses local receive time', function () {
  const h = bootMilkshaHarness('', { startMs: FX.T0 });
  h.runtime.applyPayload([prepRow('8101')], { silent: true });
  h.sandbox.__setNowMs(FX.T2);
  // Payload order puts 8102 before 8101; only local firstSeenAt makes 8102 sort first.
  h.runtime.applyPayload([prepRow('8102'), prepRow('8101')], { silent: true });
  const snap = h.runtime.getSnapshot();
  assertOrder(function () {
    return prepNums(snap);
  }, ['8102', '8101']);
  const prep8101 = snap.preparing.find(function (p) {
    return String(p.number) === '8101';
  });
  const prep8102 = snap.preparing.find(function (p) {
    return String(p.number) === '8102';
  });
  assert.ok(prep8101 && prep8102, 'both numbers on board');
  assert.equal(prep8101.firstSeenAt, FX.T0);
  assert.equal(prep8102.firstSeenAt, FX.T2);
  assert.ok(prep8102.firstSeenAt > prep8101.firstSeenAt, 'local receive times must drive sort');
  h.runtime.destroy();
});

test('12 mixed with and without POS fields sorts POS, updatedAt, then local receive', function () {
  const { runtime } = bootMilkshaHarness('', { startMs: 1_900_000_000_000 });
  runtime.applyPayload(
    [
      prepRow('8201', { firstSeenPosAtMs: FX.T2, seqInBatch: 0 }),
      prepRow('8202'),
      prepRow('8203', { updatedAt: '2026-10-20T11:00:00.000Z' }),
    ],
    { silent: true },
  );
  assertOrder(function () {
    return prepNums(runtime.getSnapshot());
  }, ['8202', '8203', '8201']);
  runtime.destroy();
});

test('13 invalid POS time treated as missing', function () {
  const { runtime } = bootMilkshaHarness('', { startMs: FX.T0 });
  runtime.applyPayload(
    [
      prepRow('8301', { firstSeenPosAtMs: 'not-a-time', updatedAt: '2026-10-20T12:00:00.000Z' }),
      prepRow('8302', { firstSeenPosAtMs: -1, updatedAt: '2026-10-20T11:00:00.000Z' }),
    ],
    { silent: true },
  );
  assertOrder(function () {
    return prepNums(runtime.getSnapshot());
  }, ['8301', '8302']);
  runtime.destroy();
});

test('14 old cloud without POS fields keeps payloadIndex tie-break', function () {
  const fixedNow = 1_700_000_000_000;
  const h = bootMilkshaHarness('', { startMs: fixedNow });
  h.runtime.applyPayload(['2003', '2005', '2011', '2012'].map(function (no) {
    return prepRow(no);
  }), { silent: true });
  assertOrder(function () {
    return prepNums(h.runtime.getSnapshot());
  }, ['2012', '2011', '2005', '2003']);
  h.runtime.destroy();
});

test('15 cache stores POS ms fields on number_content rows', async function () {
  const { sandbox, storage, milkshaRuntime } = loadCloudHarness('2026-10-20T08:00:00.000Z');
  const cacheKey = 'milksha:receiver-cache:' + STORE;
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return boardDocFromTickets(FX.READY_POS_SORT_TICKETS, 2);
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: STORE,
    deviceId: 'stb-01',
    transport: transport,
    milkshaRuntime: milkshaRuntime,
    skipBootReceiverCache: true,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  const raw = storage[cacheKey];
  assert.ok(raw, 'cache written');
  const parsed = JSON.parse(raw);
  const row = parsed.numberContent.find(function (r) {
    return r.number === '4003';
  });
  assert.equal(row.readyPosAtMs, FX.T3);
  assert.equal(row.firstSeenPosAtMs, FX.T0);
  milkshaRuntime.destroy();
});

test('16 boot cache order matches cloud POS order before network', async function () {
  const now = '2026-10-20T08:00:00.000Z';
  const { sandbox, storage, milkshaRuntime } = loadCloudHarness(now);
  const cacheKey = 'milksha:receiver-cache:' + STORE;
  const bd = sandbox.QMS.Board.TodayBoard.taipeiBusinessDate(new Date(now));
  const nc = ticketsToContent(FX.PREPARING_POS_SORT_TICKETS);
  storage[cacheKey] = JSON.stringify({
    seq: 9,
    numberContent: nc,
    businessDate: bd,
    boardUpdatedAt: '2026-10-20T08:00:00.000Z',
  });
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      throw new Error('offline');
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: STORE,
    deviceId: 'stb-01',
    transport: transport,
    milkshaRuntime: milkshaRuntime,
    skipInitialCloudKick: true,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  assertOrder(function () {
    return prepNums(milkshaRuntime.getSnapshot());
  }, ['3003', '3002', '3001']);
  milkshaRuntime.destroy();
});

test('17 old cache without POS fields loads then cloud corrects order', async function () {
  const now = '2026-10-20T08:00:00.000Z';
  const { sandbox, storage, milkshaRuntime } = loadCloudHarness(now);
  const cacheKey = 'milksha:receiver-cache:' + STORE;
  const bd = sandbox.QMS.Board.TodayBoard.taipeiBusinessDate(new Date(now));
  storage[cacheKey] = JSON.stringify({
    seq: 3,
    numberContent: [prepRow('9001'), prepRow('9002')],
    businessDate: bd,
    boardUpdatedAt: '2026-10-20T08:00:00.000Z',
  });
  const transport = {
    session: { ensureIdToken: async function () {} },
    readBoard: async function () {
      return boardDocFromTickets(FX.PREPARING_POS_SORT_TICKETS, 4);
    },
    readDevice: async function () {
      return null;
    },
  };
  const cloud = sandbox.QMS.Receiver.bootReceiverCloud({
    storeId: STORE,
    deviceId: 'stb-01',
    transport: transport,
    milkshaRuntime: milkshaRuntime,
  });
  cloud.start();
  await new Promise(function (r) {
    setTimeout(r, 40);
  });
  assertOrder(function () {
    return prepNums(milkshaRuntime.getSnapshot());
  }, ['3003', '3002', '3001']);
  milkshaRuntime.destroy();
});

test('18 static no-motion: new ready on page 2 jumps to page 1', async function () {
  const harness = bootMilkshaHarness('');
  const readyNumsList = [];
  for (let i = 1; i <= 11; i += 1) {
    readyNumsList.push(
      readyRow(String(4000 + i), { readyPosAtMs: FX.T0 + i * 1000, readySeqInBatch: i }),
    );
  }
  harness.runtime.applyPayload(readyNumsList, { silent: true });
  await harness.runtime.advanceZonePageForTest('ready');
  const htmlBefore = harness.getBoardHtml();
  const pageBefore = pageFromIndicator(parseZoneBoardHtml(splitZoneHtml(htmlBefore, 'milksha-ready ready')).indicator);
  assert.equal(pageBefore, 1);
  harness.runtime.applyPayload(
    readyNumsList.concat([
      readyRow('4099', { readyPosAtMs: FX.T3, readySeqInBatch: 99 }),
    ]),
    { silent: true },
  );
  const pageAfter = pageFromIndicator(
    parseZoneBoardHtml(splitZoneHtml(harness.getBoardHtml(), 'milksha-ready ready')).indicator,
  );
  assert.equal(pageAfter, 0);
  harness.runtime.destroy();
});

test('19 static: preparing zone does not jump when number moves to ready (#60)', async function () {
  const harness = bootMilkshaHarness('');
  const prepList = [];
  for (let i = 1; i <= 12; i += 1) {
    prepList.push(prepRow(String(5000 + i), { firstSeenPosAtMs: FX.T0 + i * 1000, seqInBatch: i }));
  }
  harness.runtime.applyPayload(prepList, { silent: true });
  await harness.runtime.advanceZonePageForTest('prep');
  const pageBefore = pageFromIndicator(
    parseZoneBoardHtml(splitZoneHtml(harness.getBoardHtml(), 'milksha-prep prep')).indicator,
  );
  assert.equal(pageBefore, 1);
  const moved = prepList.slice(1).concat([
    readyRow('5001', { readyPosAtMs: FX.T3, readySeqInBatch: 0, firstSeenPosAtMs: FX.T0 }),
  ]);
  harness.runtime.applyPayload(moved, { silent: true });
  const pageAfter = pageFromIndicator(
    parseZoneBoardHtml(splitZoneHtml(harness.getBoardHtml(), 'milksha-prep prep')).indicator,
  );
  assert.equal(pageAfter, pageBefore);
  harness.runtime.destroy();
});

function staticMotionViolations(html) {
  const bad = [];
  if (/milksha-board-chip--layer-float/.test(html)) {
    bad.push('float-layer');
  }
  if (/data-page-turn-anim=/.test(html) || /data-column-move-anim=/.test(html)) {
    bad.push('anim-flag-on-layer');
  }
  if (/style="[^"]*opacity:\s*0/.test(html)) {
    bad.push('inline-opacity-zero');
  }
  if (/style="[^"]*transform:\s*scale\(/.test(html)) {
    bad.push('inline-scale');
  }
  return bad;
}

test('20 motion=on: animate path and no static motion violations (required)', function () {
  const harness = bootMilkshaHarness('?motion=on');
  harness.runtime.applyPayload([], { silent: true });
  harness.runtime.applyPayload([], { silent: true });
  const payload = ticketsToContent(FX.READY_POS_SORT_TICKETS).concat(
    ticketsToContent(FX.PREPARING_POS_SORT_TICKETS),
  );
  harness.runtime.applyPayload(payload);
  assert.equal(
    harness.runtime.getAnimSkipReason(),
    'animate',
    'motion=on must use animator (not static snapshot path); see artifacts/pos-time-sort/MUTATION-CHECK.md §20',
  );
  const html = harness.getBoardHtml();
  assert.deepEqual(
    staticMotionViolations(html),
    [],
    'animated board HTML must not show static motion defects; see MUTATION-CHECK.md §20b',
  );
  harness.runtime.destroy();
});

test('23 posTimeSource round-trips on tickets and number_content (required)', function () {
  const tickets = [
    FX.ticket('8401', 'preparing', {
      firstSeenPosAtMs: FX.T1,
      seqInBatch: 0,
      posTimeSource: 'server',
    }),
    FX.ticket('8402', 'ready', {
      firstSeenPosAtMs: FX.T0,
      readyPosAtMs: FX.T2,
      readySeqInBatch: 1,
      posTimeSource: 'pos',
    }),
  ];
  const nc = ticketsToContent(tickets);
  assert.equal(nc[0].posTimeSource, 'server');
  assert.equal(nc[1].posTimeSource, 'pos');
  const { runtime } = bootMilkshaHarness();
  runtime.applyPayload(nc, { silent: true });
  const snap = runtime.getSnapshot();
  const prep = snap.preparing.find(function (p) {
    return String(p.number) === '8401';
  });
  const ready = snap.ready.find(function (r) {
    return String(r.number) === '8402';
  });
  assert.equal(prep && prep.posTimeSource, 'server');
  assert.equal(ready && ready.posTimeSource, 'pos');
  assert.notEqual(prep.posTimeSource, ready.posTimeSource);
  runtime.destroy();
});

test('21 PAGE_SIZE 10 and 6s page interval unchanged', function () {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runScripts(sandbox, BOARD_SCRIPT_CHAIN);
  const MB = sandbox.QMS.MilkshaBoard;
  assert.equal(MB.PAGE_SIZE, 10);
  const src = fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8');
  assert.match(src, /PAGE_INTERVAL_MS\s*=\s*6000/);
  assert.equal(minimalBrand().queue.historyPageIntervalSec, 6);
});

test('22 BoardItemSort module exported for centralized sorting', function () {
  const sandbox = { globalThis: {}, Date: Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runScripts(sandbox, [
    'js/board/board-pos-time-fields.js',
    'js/board/board-item-sort.js',
  ]);
  assert.equal(typeof sandbox.QMS.Board.BoardItemSort.sortBoardZoneItems, 'function');
  assert.equal(typeof sandbox.QMS.Board.BoardItemSort.compareBoardZoneItems, 'function');
});
