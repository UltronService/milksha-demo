#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(readFileSync(join(ROOT, 'controller/store-simulation.js'), 'utf8'), sandbox);
const Sim = sandbox.QMS.Controller.StoreSimulation;

function rngFactory(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const thirtyMin = 30 * 60 * 1000;
for (const mode of ['normal', 'peak']) {
  const a = Sim.runSimulationAnalysis(mode, thirtyMin, {
    now: () => 0,
    rng: rngFactory(mode === 'normal' ? 101 : 202),
  });
  console.log(
    JSON.stringify({
      mode,
      arrivalGapMs: a.arrivalGapMs,
      skipRatio: +(a.skipRatio * 100).toFixed(1),
      boardMedian: a.boardCount.median,
      boardP05: a.boardCount.p05,
      boardP95: a.boardCount.p95,
      sends30min: a.sendEstimate,
    }),
  );
}
