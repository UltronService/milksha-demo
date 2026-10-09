'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

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

test('allocate skips without duplicating on-board numbers and wraps at 9999', function () {
  const { Sim } = loadSimulation();
  const state = Sim.createSimulationState({ lastIssuedNumber: 9998 });
  const used = new Set(['9999', '0001']);
  const no = Sim.allocateNextNumber(state, used, function () {
    return 0.99;
  });
  assert.ok(!used.has(no));
  const wrapState = Sim.createSimulationState({ lastIssuedNumber: 9999 });
  const noWrap = Sim.allocateNextNumber(wrapState, new Set(), function () {
    return 0.5;
  });
  assert.equal(noWrap, '0001');
});

test('all five sources appear over many picks', function () {
  const { Sim } = loadSimulation();
  const seen = new Set();
  const rng = mulberry32(7);
  for (let i = 0; i < 80; i += 1) {
    seen.add(Sim.pickSourceKey(rng));
  }
  assert.equal(seen.size, Sim.SOURCE_KEYS.length);
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
