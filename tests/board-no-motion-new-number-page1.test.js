'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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
  const cellRe = /<div class="milksha-num-cell"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cellRe.exec(zoneHtml)) !== null) {
    const inner = m[1];
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

function visibleNumbersForZone(snapshotItems, page) {
  const pageSize = 10;
  const start = page * pageSize;
  return snapshotItems.slice(start, start + pageSize).map(function (it) {
    return String(it.number);
  });
}

function bootMilkshaBoardHarness(locationSearch, timerOpts) {
  const dom = {};
  const root = { className: '', innerHTML: '', style: { setProperty: function () {} } };
  dom['board-root'] = root;
  const RealDate = Date;
  let nowMs = timerOpts && Number.isFinite(timerOpts.startMs) ? timerOpts.startMs : 1_700_000_000_000;
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
      const entry = { fn: fn, ms: ms, nextAt: nowMs + ms };
      intervals.push(entry);
      const id = intervals.length;
      return id;
    },
    Date: MockDate,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Math: Math,
    Promise: Promise,
    Set: Set,
    URLSearchParams: URLSearchParams,
    location: { search: locationSearch || '' },
    requestAnimationFrame: function (fn) {
      fn();
    },
    addEventListener: function () {},
    innerWidth: 1920,
    innerHeight: 1080,
    __milkshaSoundLog: [],
    Element: function () {},
    __advanceBoardTimers: function (deltaMs) {
      nowMs += deltaMs;
      for (let pass = 0; pass < 4; pass += 1) {
        let fired = false;
        for (let i = 0; i < intervals.length; i += 1) {
          const entry = intervals[i];
          if (!entry || entry.cancelled) {
            continue;
          }
          while (nowMs >= entry.nextAt) {
            entry.fn();
            entry.nextAt += entry.ms;
            fired = true;
          }
        }
        if (!fired) {
          break;
        }
      }
    },
    __intervalCount: function () {
      return intervals.filter(function (e) {
        return e && !e.cancelled;
      }).length;
    },
  };
  sandbox.clearInterval = function (id) {
    const entry = intervals[id - 1];
    if (entry) {
      entry.cancelled = true;
    }
  };
  sandbox.Element.prototype = {
    animate: function () {
      return { cancel: function () {}, finish: function () {} };
    },
  };

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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'transport', 'board-seq.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'receiver', 'chime-policy.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
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

function prepPayload(numbers) {
  return numbers.map(function (n) {
    return { source_type: 'From_Store_Preparing', number: String(n) };
  });
}

function readyPayload(numbers) {
  return numbers.map(function (n) {
    return { source_type: 'From_Store_OK', number: String(n) };
  });
}

function assertZonePage1(dom, snap, zoneKey) {
  const z = dom[zoneKey];
  const items = zoneKey === 'prep' ? snap.preparing : snap.ready;
  const pg = pageFromIndicator(z.indicator);
  assert.equal(pg.page, 0, zoneKey + ' indicator page');
  assert.ok(pg.total >= 2, zoneKey + ' total pages');
  assert.equal(z.indicator, '1/' + String(pg.total));
  const expect = visibleNumbersForZone(items, 0);
  for (let i = 0; i < expect.length; i += 1) {
    assert.equal(z.cells[i], expect[i], zoneKey + ' cell ' + String(i));
  }
}

test('no-motion: zone on page 2 jumps to page 1 when it receives a new number (prep and ready)', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const prepNums = [];
  for (let i = 1; i <= 11; i += 1) {
    prepNums.push(3000 + i);
  }
  runtime.applyPayload(prepPayload(prepNums), { silent: true });
  await runtime.advanceZonePageForTest('prep');
  const onPage2 = parseBoardDom(harness.getBoardHtml());
  assert.equal(pageFromIndicator(onPage2.prep.indicator).page, 1);

  runtime.applyPayload(prepPayload(prepNums.concat([3099])), { silent: true });
  const domPrep = parseBoardDom(harness.getBoardHtml());
  assertZonePage1(domPrep, runtime.getSnapshot(), 'prep');

  const readyNums = [];
  for (let j = 1; j <= 11; j += 1) {
    readyNums.push(4000 + j);
  }
  runtime.applyPayload(readyPayload(readyNums), { silent: true });
  await runtime.advanceZonePageForTest('ready');
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).ready.indicator).page, 1);

  runtime.applyPayload(readyPayload(readyNums.concat([4099])), { silent: true });
  const domBoth = parseBoardDom(harness.getBoardHtml());
  assertZonePage1(domBoth, runtime.getSnapshot(), 'ready');

  const movePrep = [];
  for (let k = 1; k <= 12; k += 1) {
    movePrep.push(5000 + k);
  }
  const moveReady = [];
  for (let r = 1; r <= 11; r += 1) {
    moveReady.push(6000 + r);
  }
  runtime.applyPayload(prepPayload(movePrep).concat(readyPayload(moveReady)), { silent: true });
  await runtime.advanceZonePageForTest('prep');
  await runtime.advanceZonePageForTest('ready');
  const prepPageBeforeMove = pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page;
  assert.equal(prepPageBeforeMove, 1);
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).ready.indicator).page, 1);

  runtime.applyPayload(
    prepPayload(movePrep.slice(1)).concat(readyPayload([movePrep[0]].concat(moveReady))),
    { silent: true },
  );
  const domMove = parseBoardDom(harness.getBoardHtml());
  assert.equal(pageFromIndicator(domMove.prep.indicator).page, prepPageBeforeMove, 'prep stays on page 2');
  assertZonePage1(domMove, runtime.getSnapshot(), 'ready');

  runtime.destroy();
});

test('no-motion: only removals or move-out do not jump page', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const prepNums = [];
  for (let i = 1; i <= 12; i += 1) {
    prepNums.push(7000 + i);
  }
  runtime.applyPayload(prepPayload(prepNums), { silent: true });
  await runtime.advanceZonePageForTest('prep');
  const pageBefore = pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page;
  assert.equal(pageBefore, 1);

  runtime.applyPayload(prepPayload(prepNums.slice(0, 11)), { silent: true });
  const domRemove = parseBoardDom(harness.getBoardHtml());
  assert.equal(pageFromIndicator(domRemove.prep.indicator).page, pageBefore);

  runtime.destroy();
});

test('no-motion: single-page zone unchanged when a new number arrives', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  runtime.applyPayload(prepPayload([8101]), { silent: true });
  const domOne = parseBoardDom(harness.getBoardHtml());
  assert.equal(domOne.prep.indicator, '');

  runtime.applyPayload(prepPayload([8102, 8101]), { silent: true });
  const domTwo = parseBoardDom(harness.getBoardHtml());
  assert.equal(domTwo.prep.indicator, '');
  assert.equal(domTwo.prep.cells[0], '8102');

  runtime.destroy();
});

test('no-motion: page-turn timer restarts from zero after new-number jump to page 1', async function () {
  const harness = bootMilkshaBoardHarness('', { startMs: 1_700_000_000_000 });
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const nums = [];
  for (let i = 1; i <= 11; i += 1) {
    nums.push(9000 + i);
  }
  runtime.applyPayload(prepPayload(nums), { silent: true });
  await runtime.advanceZonePageForTest('prep');
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page, 1);

  harness.sandbox.__advanceBoardTimers(5000);

  runtime.applyPayload(prepPayload(nums.concat([9099])), { silent: true });
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page, 0);

  harness.sandbox.__advanceBoardTimers(1000);
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page, 0);

  harness.sandbox.__advanceBoardTimers(5000);
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page, 1);

  runtime.destroy();
});

test('motion=on: new number on page 2 does not force page 1 (unchanged motion behavior)', async function () {
  const harness = bootMilkshaBoardHarness('?motion=on');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  runtime.applyPayload([], { silent: true });
  runtime.applyPayload([], { silent: true });

  const nums = [];
  for (let i = 1; i <= 11; i += 1) {
    nums.push(9100 + i);
  }
  runtime.applyPayload(prepPayload(nums), { silent: true });
  await runtime.advanceZonePageForTest('prep');
  assert.equal(pageFromIndicator(parseBoardDom(harness.getBoardHtml()).prep.indicator).page, 1);

  runtime.applyPayload(prepPayload(nums.concat([9199])), { silent: true });
  const dom = parseBoardDom(harness.getBoardHtml());
  assert.equal(pageFromIndicator(dom.prep.indicator).page, 1);

  runtime.destroy();
});
