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
  const cellOpenRe = /<div class="milksha-num-cell"[^>]*>/g;
  let openMatch;
  while ((openMatch = cellOpenRe.exec(zoneHtml)) !== null) {
    const from = openMatch.index;
    const nextOpen = zoneHtml.indexOf('<div class="milksha-num-cell"', from + 1);
    const inner = nextOpen < 0 ? zoneHtml.slice(from) : zoneHtml.slice(from, nextOpen);
    const idMatch = inner.match(/data-item-id="([^"]+)"/);
    const numMatch = inner.match(/class="milksha-num">([^<]+)/);
    const chipCount = inner.includes('data-item-id=') ? 1 : 0;
    cells.push({
      itemId: idMatch ? idMatch[1] : null,
      number: numMatch ? numMatch[1].trim() : null,
      chipCount: chipCount,
    });
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
  const m = String(text).match(/^(\d+)\//);
  return m ? Number(m[1]) - 1 : 0;
}

function visibleNumbersForZone(snapshotItems, page) {
  const pageSize = 10;
  const start = page * pageSize;
  return snapshotItems.slice(start, start + pageSize).map(function (it) {
    return String(it.number);
  });
}

function cellIntegrityViolations(dom) {
  const bad = [];
  for (const zoneKey of ['prep', 'ready']) {
    const z = dom[zoneKey];
    for (let i = 0; i < z.cells.length; i += 1) {
      const c = z.cells[i];
      if (c.chipCount > 1) {
        bad.push({ zone: zoneKey, slot: i, kind: 'multi-chip', chipCount: c.chipCount });
      }
      if (c.chipCount === 1 && c.number && !/^\d{1,4}$/.test(c.number)) {
        bad.push({ zone: zoneKey, slot: i, kind: 'bad-number', number: c.number });
      }
    }
  }
  return bad;
}

function zoneMixViolations(dom, snap) {
  const bad = [];
  const prepPage = pageFromIndicator(dom.prep.indicator);
  const readyPage = pageFromIndicator(dom.ready.indicator);
  const expectPrep = visibleNumbersForZone(snap.preparing, prepPage);
  const expectReady = visibleNumbersForZone(snap.ready, readyPage);
  const actualPrep = dom.prep.cells.map(function (c) {
    return c.number;
  });
  const actualReady = dom.ready.cells.map(function (c) {
    return c.number;
  });
  if (JSON.stringify(actualPrep) !== JSON.stringify(padCells(expectPrep))) {
    bad.push({ zone: 'prep', expect: expectPrep, actual: actualPrep });
  }
  if (JSON.stringify(actualReady) !== JSON.stringify(padCells(expectReady))) {
    bad.push({ zone: 'ready', expect: expectReady, actual: actualReady });
  }
  return bad;
}

function padCells(nums) {
  const out = new Array(10).fill(null);
  for (let i = 0; i < nums.length && i < 10; i += 1) {
    out[i] = nums[i];
  }
  return out;
}

function staticMotionViolations(html) {
  const bad = [];
  if (/milksha-board-chip--layer-float/.test(html)) {
    bad.push({ kind: 'float-layer' });
  }
  if (/data-page-turn-anim=/.test(html) || /data-column-move-anim=/.test(html)) {
    bad.push({ kind: 'anim-flag-on-layer' });
  }
  if (/style="[^"]*opacity:\s*0/.test(html)) {
    bad.push({ kind: 'inline-opacity-zero' });
  }
  if (/style="[^"]*transform:\s*scale\(/.test(html)) {
    bad.push({ kind: 'inline-scale' });
  }
  return bad;
}

function bootMilkshaBoardHarness(locationSearch) {
  const dom = {};
  const root = { className: '', innerHTML: '', style: { setProperty: function () {} } };
  dom['board-root'] = root;
  let waapiCalls = 0;

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
      return setInterval(fn, ms);
    },
    Date: Date,
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
    __waapiCalls: function () {
      return waapiCalls;
    },
    Element: function () {},
  };
  sandbox.Element.prototype = { animate: function () {
    waapiCalls += 1;
    return { cancel: function () {}, finish: function () {} };
  } };
  if (typeof sandbox.Element.prototype.animate !== 'function') {
    sandbox.Element.prototype.animate = function () {
      waapiCalls += 1;
      return { cancel: function () {}, finish: function () {} };
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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'landscape-art-layout.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'source-icons-layout.js'), 'utf8'), sandbox);
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
  return { sandbox: sandbox, dom: dom, getBoardHtml: function () {
    return dom['milksha-board'].innerHTML;
  } };
}

async function sampleBoardDuring(harness, runtime, trigger, opts) {
  const intervalMs = opts && opts.intervalMs ? opts.intervalMs : 50;
  const samples = opts && opts.samples ? opts.samples : 40;
  const violations = [];
  let sampling = true;

  const poll = (async function () {
    for (let i = 0; i < samples && sampling; i += 1) {
      const html = harness.getBoardHtml();
      const dom = parseBoardDom(html);
      const snap = runtime.getSnapshot();
      violations.push(...cellIntegrityViolations(dom));
      violations.push(...zoneMixViolations(dom, snap));
      violations.push(...staticMotionViolations(html));
      await new Promise(function (r) {
        setTimeout(r, intervalMs);
      });
    }
  })();

  await trigger();
  await poll;
  sampling = false;
  const html = harness.getBoardHtml();
  const dom = parseBoardDom(html);
  const snap = runtime.getSnapshot();
  violations.push(...cellIntegrityViolations(dom));
  violations.push(...zoneMixViolations(dom, snap));
  violations.push(...staticMotionViolations(html));
  return violations;
}

test('default URL: at most one chip per cell while add, ready, remove, page turn, clear', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const violations = await sampleBoardDuring(harness, runtime, async function () {
    runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '4101' }], { silent: true });
    runtime.applyPayload(
      [
        { source_type: 'From_Store_Preparing', number: '4101' },
        { source_type: 'From_Store_Preparing', number: '4102' },
      ],
      { silent: true },
    );
    runtime.applyPayload(
      [
        { source_type: 'From_Store_OK', number: '4101' },
        { source_type: 'From_Store_Preparing', number: '4102' },
      ],
      { silent: true },
    );
    runtime.applyPayload([{ source_type: 'From_Store_OK', number: '4102' }], { silent: true });
    const manyPrep = [];
    for (let n = 1; n <= 11; n += 1) {
      manyPrep.push({ source_type: 'From_Store_Preparing', number: String(5000 + n) });
    }
    runtime.applyPayload(manyPrep, { silent: true });
    await runtime.advanceZonePageForTest('prep');
    runtime.applyPayload([], { silent: true });
  });

  const chipViolations = violations.filter(function (v) {
    return v.kind === 'multi-chip';
  });
  assert.equal(chipViolations.length, 0, JSON.stringify(chipViolations));
  assert.equal(runtime.getAnimSkipReason(), 'motion-off');
  runtime.destroy();
});

test('default URL: prep and ready never mix vs getSnapshot on every sample', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const violations = await sampleBoardDuring(harness, runtime, async function () {
    runtime.applyPayload(
      [
        { source_type: 'From_Store_Preparing', number: '6101' },
        { source_type: 'From_Store_OK', number: '7101' },
      ],
      { silent: true },
    );
    runtime.applyPayload(
      [
        { source_type: 'From_Store_Preparing', number: '6101' },
        { source_type: 'From_Store_Preparing', number: '6102' },
        { source_type: 'From_Store_OK', number: '7101' },
        { source_type: 'From_Store_OK', number: '7102' },
      ],
      { silent: true },
    );
  });

  const mix = violations.filter(function (v) {
    return v.zone === 'prep' || v.zone === 'ready';
  });
  assert.equal(mix.length, 0, JSON.stringify(mix));
  runtime.destroy();
});

test('default URL: number visible within 3s and DOM matches snapshot right after apply', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const t0 = Date.now();
  runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8201' }], { silent: true });
  assert.ok(Date.now() - t0 < 3000);
  const html = harness.getBoardHtml();
  assert.match(html, /8201/);
  const dom = parseBoardDom(html);
  const snap = runtime.getSnapshot();
  assert.equal(zoneMixViolations(dom, snap).length, 0);
  assert.equal(runtime.getAnimSkipReason(), 'motion-off');
  runtime.destroy();
});

test('default URL: no float layers, anim flags, or faded/scaled inline styles through page turn', async function () {
  const harness = bootMilkshaBoardHarness('');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });

  const prep = [];
  for (let n = 1; n <= 12; n += 1) {
    prep.push({ source_type: 'From_Store_Preparing', number: String(9000 + n) });
  }
  runtime.applyPayload(prep, { silent: true });

  const beforeHtml = harness.getBoardHtml();
  const beforeDom = parseBoardDom(beforeHtml);
  const indBefore = beforeDom.prep.indicator;

  await runtime.advanceZonePageForTest('prep');

  const afterHtml = harness.getBoardHtml();
  const afterDom = parseBoardDom(afterHtml);
  assert.notEqual(afterDom.prep.indicator, indBefore);
  assert.equal(staticMotionViolations(afterHtml).length, 0);
  assert.equal(zoneMixViolations(afterDom, runtime.getSnapshot()).length, 0);
  runtime.destroy();
});

test('motion=on: primed board uses animate path; anim module pulse still runs opacity', async function () {
  const harness = bootMilkshaBoardHarness('?motion=on');
  const runtime = harness.sandbox.QMS.bootMilkshaBoard(minimalBrand(), {
    document: harness.sandbox.document,
    window: harness.sandbox,
  });
  runtime.applyPayload([], { silent: true });
  runtime.applyPayload([], { silent: true });
  runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5101' }]);
  assert.equal(runtime.getAnimSkipReason(), 'animate');

  const animCode = fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8');
  const animSandbox = { globalThis: {}, window: null };
  animSandbox.globalThis = animSandbox;
  animSandbox.window = animSandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'),
    animSandbox,
  );
  vm.runInNewContext(animCode, animSandbox);
  const Anim = animSandbox.QMS.MilkshaBoardAnim;

  const el = {
    style: { opacity: '', transform: '', transformOrigin: '' },
    classList: { contains: () => true },
    setAttribute: function () {},
    getAttribute: function () {
      return 'store:9001';
    },
    animate: function (_kf, _opt) {
      const anim = {
        _cancelled: false,
        onfinish: null,
        oncancel: null,
        cancel: function () {
          if (anim._cancelled) {
            return;
          }
          anim._cancelled = true;
          if (anim.oncancel) {
            anim.oncancel();
          }
        },
        finish: function () {
          if (anim._cancelled) {
            return;
          }
          if (anim.onfinish) {
            anim.onfinish();
          }
        },
      };
      el._lastAnim = anim;
      el.style.opacity = '0';
      return anim;
    },
    getAnimations: function () {
      if (!el._lastAnim || el._lastAnim._cancelled) {
        return [];
      }
      return [el._lastAnim];
    },
  };
  const done = Anim.animateReadyPulse(el, 1.3, 300, 3000, 300, 1, function () {
    return 1;
  });
  assert.equal(el.style.opacity, '0');
  el._lastAnim.cancel();
  await done;
  assert.equal(el.style.opacity, '1');
  runtime.destroy();
});
