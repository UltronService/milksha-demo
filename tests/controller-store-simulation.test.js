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
    requestAnimationFrame: function (fn) {
      fn();
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'milksha-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoard;
}

function loadSimulation() {
  const sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/store-simulation.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/store-simulation-host.js'), 'utf8'), sandbox);
  return {
    Sim: sandbox.QMS.Controller.StoreSimulation,
    Host: sandbox.QMS.Controller.StoreSimulationHost,
  };
}

function sourceNumberPattern(sourceKey) {
  if (sourceKey === 'store') {
    return /^\d{4}$/;
  }
  if (sourceKey === 'point') {
    return /^\d{3,4}$/;
  }
  if (sourceKey === 'fp') {
    return /^\d{4,6}$/;
  }
  if (sourceKey === 'uber') {
    return /^[0-9A-Z]{4,6}$/;
  }
  if (sourceKey === 'udd') {
    return /^[0-9A-Z]{4,6}$/;
  }
  return /^.+$/;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test('allocateNumberForSource: ~1000 draws per non-store source match cloud rules', function () {
  const { Sim } = loadSimulation();
  const MB = loadMilkshaBoard();
  const rng = mulberry32(20261015);
  const state = Sim.createSimulationState({ lastIssuedNumber: 0 });
  /** point has only 1000 slots (000–999); stay under saturation so sim does not store-fallback. */
  const drawCounts = { point: 500, fp: 1000, uber: 1000, udd: 1000 };
  const sources = ['point', 'fp', 'uber', 'udd'];
  for (let s = 0; s < sources.length; s += 1) {
    const sk = sources[s];
    const used = new Set();
    const nDraws = drawCounts[sk];
    for (let i = 0; i < nDraws; i += 1) {
      const no = Sim.allocateNumberForSource(sk, state, used, rng);
      assert.match(no, sourceNumberPattern(sk));
      assert.equal(MB.normalizeBoardDisplayNumber(no, sk), no);
      used.add(Sim.ticketCompositeKey(sk, no));
    }
  }
});

test('regression: too-short udd numbers are rejected before push', function () {
  const { Sim } = loadSimulation();
  const legacySamples = ['abc', '12', 'ABCDEFG'];
  legacySamples.forEach(function (badNo) {
    const check = Sim.validateTicketsForBoardPush([
      { no: badNo, status: 'preparing', sourceKey: 'udd' },
    ]);
    assert.equal(check.ok, false, 'udd ticket must not use invalid length: ' + badNo);
    assert.equal(check.reason, 'invalid-number');
  });
  const src = fs.readFileSync(path.join(ROOT, 'controller/store-simulation.js'), 'utf8');
  assert.equal(src.includes('randomAlnumNumber'), true);
});

test('validateTicketsForBoardPush rejects bad simulator-shaped rows', function () {
  const { Sim } = loadSimulation();
  assert.equal(
    Sim.validateTicketsForBoardPush([{ no: '0001', status: 'preparing', sourceKey: 'store' }]).ok,
    true,
  );
  assert.equal(Sim.validateTicketsForBoardPush([{ no: '123', status: 'ready', sourceKey: 'store' }]).ok, false);
  assert.equal(
    Sim.validateTicketsForBoardPush([
      { no: '0001', status: 'preparing', sourceKey: 'store' },
      { no: '0001', status: 'preparing', sourceKey: 'store' },
    ]).reason,
    'duplicate-in-list',
  );
  assert.equal(
    Sim.validateTicketsForBoardPush([
      { no: '0001', status: 'preparing', sourceKey: 'store' },
      { no: '0001', status: 'ready', sourceKey: 'store' },
    ]).reason,
    'same-ticket-prep-and-ready',
  );
  assert.equal(
    Sim.validateTicketsForBoardPush([
      { no: '0002', status: 'preparing', sourceKey: 'store' },
      { no: '0002', status: 'ready', sourceKey: 'store' },
    ]).reason,
    'same-ticket-prep-and-ready',
  );
});

test('validateTicketsForBoardPush allows same number on different sources', function () {
  const { Sim } = loadSimulation();
  const check = Sim.validateTicketsForBoardPush([
    { no: '1234', status: 'preparing', sourceKey: 'store' },
    { no: '12340', status: 'ready', sourceKey: 'uber' },
    { no: 'C7458', status: 'preparing', sourceKey: 'uber' },
    { no: '091', status: 'ready', sourceKey: 'point' },
  ]);
  assert.equal(check.ok, true);
});

test('recordsToTickets output always passes validateTicketsForBoardPush', function () {
  const { Sim } = loadSimulation();
  const state = Sim.createSimulationState({ lastIssuedNumber: 0 });
  const rng = mulberry32(99);
  Sim.startOrSwitchSimulation(state, 'peak', 1_000_000, [], rng);
  for (let t = 0; t < 500; t += 1) {
    Sim.reconcileSimulation(state, 1_000_000 + t * 8000, rng);
    const tickets = Sim.recordsToTickets(state.records, 1_000_000 + t * 8000);
    const check = Sim.validateTicketsForBoardPush(tickets);
    assert.equal(check.ok, true, JSON.stringify({ t: t, check: check, tickets: tickets.slice(0, 5) }));
  }
});

test('10k reconcile steps: validateTicketsForBoardPush always ok, prep and ready disjoint per source+no', function () {
  const { Sim } = loadSimulation();
  const MB = loadMilkshaBoard();
  const state = Sim.createSimulationState({ lastIssuedNumber: 0 });
  const rng = mulberry32(4242);
  Sim.startOrSwitchSimulation(state, 'peak', 1_000_000, [], rng);
  for (let t = 0; t < 10000; t += 1) {
    Sim.reconcileSimulation(state, 1_000_000 + t * 500, rng);
    const now = 1_000_000 + t * 500;
    const tickets = Sim.recordsToTickets(state.records, now);
    const check = Sim.validateTicketsForBoardPush(tickets);
    assert.equal(check.ok, true, JSON.stringify({ t, check }));
    const ready = new Set();
    const prep = new Set();
    const batchIds = new Set();
    for (let i = 0; i < tickets.length; i += 1) {
      const row = tickets[i];
      const sk = row.sourceKey || 'store';
      assert.match(row.no, sourceNumberPattern(sk));
      assert.equal(MB.normalizeBoardDisplayNumber(row.no, sk), row.no);
      const id = sk + ':' + row.no;
      assert.ok(!batchIds.has(id), 'duplicate source+no in batch ' + id);
      batchIds.add(id);
      if (sk === 'store') {
        assert.notEqual(row.no, '0000');
        assert.ok(parseInt(row.no, 10) >= 1);
      }
      if (row.status === 'ready') {
        assert.ok(!prep.has(id), 'overlap prep/ready ' + id);
        ready.add(id);
      } else {
        assert.ok(!ready.has(id), 'overlap ready/prep ' + id);
        prep.add(id);
      }
    }
  }
});

test('wrap 9999 to 0001 without colliding with on-board numbers', function () {
  const { Sim } = loadSimulation();
  assert.equal(Sim.wrapOrderCounter(10000), 1);
  assert.equal(Sim.formatOrderNo(Sim.wrapOrderCounter(10000)), '0001');
  const state = Sim.createSimulationState({ lastIssuedNumber: 9998 });
  const n1 = Sim.allocateNextNumber(state, new Set(), function () {
    return 0.99;
  });
  assert.equal(n1, '9999');
  const stateWrap = Sim.createSimulationState({ lastIssuedNumber: 9999 });
  const nWrap = Sim.allocateNextNumber(stateWrap, new Set(), function () {
    return 0.99;
  });
  assert.equal(nWrap, '0001');
  const state2 = Sim.createSimulationState({ lastIssuedNumber: 9999 });
  const n2 = Sim.allocateNextNumber(state2, new Set(['store:0001']), function () {
    return 0.99;
  });
  assert.equal(n2, '0002');
});

test('jittered intervals stay within 50%-150% of mean', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(42);
  const mean = 20000;
  for (let i = 0; i < 200; i += 1) {
    const ms = Sim.jitteredMs(mean, rng);
    assert.ok(ms >= mean * 0.5 - 1);
    assert.ok(ms <= mean * 1.5 + 1);
  }
});

test('allocate skips without duplicating on-board store tickets and wraps at 9999', function () {
  const { Sim } = loadSimulation();
  const state = Sim.createSimulationState({ lastIssuedNumber: 9998 });
  const used = new Set(['store:9999', 'store:0001']);
  const no = Sim.allocateNextNumber(state, used, function () {
    return 0.99;
  });
  assert.ok(!used.has('store:' + no));
  const wrapState = Sim.createSimulationState({ lastIssuedNumber: 9999 });
  const noWrap = Sim.allocateNextNumber(wrapState, new Set(), function () {
    return 0.5;
  });
  assert.equal(noWrap, '0001');
});

test('pickSourceKey is weighted toward store', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(20261014);
  let storeHits = 0;
  const n = 4000;
  for (let i = 0; i < n; i += 1) {
    if (Sim.pickSourceKey(rng) === 'store') {
      storeHits += 1;
    }
  }
  const ratio = storeHits / n;
  assert.ok(ratio > 0.55, 'store ratio ' + ratio);
  assert.ok(ratio < 0.85, 'store ratio ' + ratio);
});

test('all five sources appear over many reconcile steps (normal and peak)', function () {
  const { Sim } = loadSimulation();
  for (const mode of ['normal', 'peak']) {
    const state = Sim.createSimulationState({ lastIssuedNumber: 0 });
    const rng = mulberry32(mode === 'normal' ? 11 : 12);
    Sim.startOrSwitchSimulation(state, mode, 1_000_000, [], rng);
    const seen = new Set();
    for (let t = 0; t < 800; t += 1) {
      Sim.reconcileSimulation(state, 1_000_000 + t * 12000, rng);
      state.records.forEach(function (rec) {
        seen.add(rec.sourceKey);
      });
    }
    assert.equal(seen.size, Sim.SOURCE_KEYS.length, mode + ' missing sources: ' + JSON.stringify([...seen]));
  }
});

test('ready order can differ from arrival order', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(99);
  const state = Sim.createSimulationState();
  const t0 = 1000000;
  Sim.startOrSwitchSimulation(state, 'peak', t0, [], rng);
  for (let step = 0; step < 30; step += 1) {
    Sim.reconcileSimulation(state, t0 + step * 4000, rng);
  }
  const readyOrder = state.records
    .filter(function (r) {
      return r.readyAtMs < t0 + 30 * 4000;
    })
    .sort(function (a, b) {
      return a.readyAtMs - b.readyAtMs;
    })
    .map(function (r) {
      return r.no;
    });
  const enterOrder = state.records
    .slice()
    .sort(function (a, b) {
      return a.enteredAtMs - b.enteredAtMs;
    })
    .map(function (r) {
      return r.no;
    });
  assert.ok(readyOrder.length >= 2);
  assert.ok(enterOrder.length >= 2);
  assert.notDeepEqual(readyOrder.slice(0, 2), enterOrder.slice(0, 2));
});

test('stop leaves tickets unchanged on next reconcile', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(1);
  const state = Sim.createSimulationState();
  const t0 = 0;
  Sim.startOrSwitchSimulation(state, 'normal', t0, [], rng);
  Sim.reconcileSimulation(state, t0 + 25000, rng);
  const snap = Sim.recordsToTickets(state.records, t0 + 25000);
  Sim.stopSimulation(state, 'user_stop', t0 + 25000);
  const after = Sim.reconcileSimulation(state, t0 + 120000, rng);
  assert.deepEqual(after.tickets, snap);
});

test('mode switch does not run duplicate engines', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(3);
  const state = Sim.createSimulationState();
  const t0 = 0;
  Sim.startOrSwitchSimulation(state, 'normal', t0, [], rng);
  Sim.startOrSwitchSimulation(state, 'peak', t0 + 1000, [], rng);
  assert.equal(state.running, true);
  assert.equal(state.mode, 'peak');
  const at = Sim.nextWakeAtMs(state, t0 + 1000);
  assert.ok(at != null);
});

test('24h fake clock: board count bounded and internal records pruned', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(20261009);
  const dayMs = 24 * 60 * 60 * 1000;
  const normal = Sim.runSimulationAnalysis('normal', dayMs, {
    now: function () {
      return 0;
    },
    rng: rng,
  });
  assert.ok(normal.boardCount.median >= 2);
  assert.ok(normal.boardCount.p95 <= 12);
  assert.ok(normal.maxInternalRecords < 80);
  const peak = Sim.runSimulationAnalysis('peak', dayMs, {
    now: function () {
      return 0;
    },
    rng: mulberry32(20261010),
  });
  assert.ok(peak.boardCount.median >= 10);
  assert.ok(peak.maxInternalRecords < 250);
});

test('send host retries then recovers on next change', async function () {
  const { Host } = loadSimulation();
  let calls = 0;
  let now = 1000;
  const tickets = [];
  const host = Host.createStoreSimulationHost({
    now: function () {
      return now;
    },
    rng: function () {
      return 0.3;
    },
    storeId: function () {
      return 'zz-qa-store-a';
    },
    projectId: function () {
      return 'milksha-qms-dev';
    },
    getTickets: function () {
      return tickets.slice();
    },
    setTickets: function (list) {
      tickets.length = 0;
      list.forEach(function (t) {
        tickets.push(t);
      });
    },
    sendBoard: function () {
      calls += 1;
      if (calls <= 2) {
        return Promise.reject(new Error('net'));
      }
      return Promise.resolve({ isSuccess: true });
    },
    showBanner: function () {},
    onStatus: function () {},
  });
  host.start('normal');
  await new Promise(function (r) {
    setTimeout(r, 2500);
  });
  now += 60000;
  host.wake(true);
  await new Promise(function (r) {
    setTimeout(r, 2500);
  });
  assert.ok(calls >= 3);
  assert.equal(host.isRunning(), true);
  host.dispose();
});

test('simulation eligibility allows any store on milksha-qms-dev', function () {
  const { Sim } = loadSimulation();
  assert.equal(Sim.simulationEligibility('c030020', 'milksha-qms-dev').allowed, true);
  assert.equal(Sim.simulationEligibility('s120030', 'milksha-qms-dev').allowed, true);
  assert.equal(Sim.simulationEligibility('zz-qa-store-a', 'milksha-qms-dev').allowed, true);
  assert.equal(Sim.simulationEligibility('zz-qa-store-a', 'prod').allowed, false);
});

test('no 30-minute auto stop: still running after 2h fake clock', function () {
  const { Sim } = loadSimulation();
  const rng = mulberry32(8080);
  const state = Sim.createSimulationState();
  const t0 = 0;
  const twoHours = 2 * 60 * 60 * 1000;
  Sim.startOrSwitchSimulation(state, 'normal', t0, [], rng);
  let now = t0;
  while (now < twoHours) {
    Sim.reconcileSimulation(state, now, rng);
    const wake = Sim.nextWakeAtMs(state, now);
    if (wake == null) {
      break;
    }
    now = Math.min(twoHours, wake);
  }
  assert.equal(state.running, true);
  assert.notEqual(state.stoppedReason, 'auto_max_duration');
  assert.equal(Sim.MAX_RUN_MS, undefined);
});

test('host onPageHide does not stop continuous simulation', function () {
  const { Host } = loadSimulation();
  let now = 5000;
  const tickets = [];
  const host = Host.createStoreSimulationHost({
    now: function () {
      return now;
    },
    rng: function () {
      return 0.42;
    },
    storeId: function () {
      return 'zz-qa-store-a';
    },
    projectId: function () {
      return 'milksha-qms-dev';
    },
    getTickets: function () {
      return tickets.slice();
    },
    setTickets: function (list) {
      tickets.length = 0;
      list.forEach(function (t) {
        tickets.push(t);
      });
    },
    sendBoard: function () {
      return Promise.resolve({ isSuccess: true });
    },
    showBanner: function () {},
    onStatus: function () {},
  });
  host.start('normal');
  assert.equal(host.isRunning(), true);
  host.onPageHide();
  assert.equal(host.isRunning(), true, 'page hide must not auto-stop store simulation');
  host.dispose();
});

test('10m fake clock yields non-store sources on simulated ticket list', function () {
  const { Sim } = loadSimulation();
  const MB = loadMilkshaBoard();
  const rng = mulberry32(20261016);
  const tenMin = 10 * 60 * 1000;
  const state = Sim.createSimulationState();
  Sim.startOrSwitchSimulation(state, 'peak', 0, [], rng);
  let now = 0;
  const sourceCounts = { store: 0, point: 0, fp: 0, uber: 0, udd: 0 };
  while (now < tenMin) {
    Sim.reconcileSimulation(state, now, rng);
    const wake = Sim.nextWakeAtMs(state, now);
    if (wake == null) {
      break;
    }
    now = Math.min(tenMin, wake);
  }
  (state.records || []).forEach(function (rec) {
    const sk = rec.sourceKey || 'store';
    sourceCounts[sk] = (sourceCounts[sk] || 0) + 1;
    assert.equal(MB.normalizeBoardDisplayNumber(rec.no, sk), rec.no);
  });
  assert.ok(sourceCounts.store > 0);
  assert.ok(sourceCounts.udd > 0, 'udd should appear within 10m peak simulation');
  assert.ok(sourceCounts.uber > 0, 'uber should appear within 10m peak simulation');
});

test('store-simulation module has no store blocklist or max-run constants', function () {
  const src = fs.readFileSync(path.join(ROOT, 'controller/store-simulation.js'), 'utf8');
  const host = fs.readFileSync(path.join(ROOT, 'controller/store-simulation-host.js'), 'utf8');
  const patterns = [
    'MAX_RUN_MS',
    'auto_max_duration',
    'FORBIDDEN_STORE',
    '禁止啟動',
    '30 * 60 * 1000',
    '1800000',
  ];
  patterns.forEach(function (p) {
    assert.equal(src.includes(p), false, 'store-simulation.js must not contain ' + p);
    assert.equal(host.includes(p), false, 'store-simulation-host.js must not contain ' + p);
  });
});
