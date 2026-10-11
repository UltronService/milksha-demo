#!/usr/bin/env node
/**
 * PR #46 public retest — column-move + stale cache profile-old.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ART = join(process.cwd(), 'artifacts', 'pr46live');
const AGENT = '/cursor/stores/self/artifacts/pr46live';
const PROFILE = join(ART, 'profile-old');
const SHOTS = join(ART, 'screenshots');
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const BASE = 'https://ultronservice.github.io/milksha-demo';
const BOARD_URL = `${BASE}/?mode=cloud&store=${STORE}&device=${DEVICE}`;
const CTRL_URL = `${BASE}/controller/?mode=cloud&store=${STORE}`;
const DEPLOY_MS = Date.parse('Sun, 11 Oct 2026 10:30:50 GMT');
const POST_MS = 10 * 60 * 1000;
const TARGET_V = '20261011b';

function log(m) {
  appendFileSync(join(ART, 'run.log'), `[${new Date().toISOString()}] ${m}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function vFrom(url) {
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

async function waitDeploy() {
  const ready = DEPLOY_MS + POST_MS;
  const w = Math.max(0, ready - Date.now() + 2000);
  if (w > 0) {
    log(`wait ${w}ms`);
    await sleep(w);
  }
}

async function expandZone(ctrl, id) {
  await ctrl.evaluate((sid) => {
    const s = document.getElementById(sid);
    s?.querySelector('.zone-toggle')?.setAttribute('aria-expanded', 'true');
    const b = s?.querySelector('.zone-body');
    if (b) {
      b.hidden = false;
    }
  }, id);
}

async function clearNow(ctrl, board) {
  await expandZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  await ctrl.waitForTimeout(4000);
  await board.waitForFunction(() => document.querySelectorAll('.milksha-board-chip').length === 0, undefined, {
    timeout: 120000,
  });
}

async function waitOnline(board, ctrl) {
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-board-online="1"]', { timeout: 180000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
}

function collectResources(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/milksha-demo/'))
      .filter((e) => /\.(js|css)(\?|$)/.test(e.name))
      .map((e) => ({ url: e.name, transferSize: e.transferSize, v: (e.name.match(/[?&]v=([^&]+)/) || [])[1] || null })),
  );
}

function auditResources(all) {
  const bad = all.filter((r) => r.v && (r.v === '20261011a' || /^20261009|^20261006/.test(r.v)));
  const notB = all.filter((r) => r.v && r.v !== TARGET_V);
  return { pass: bad.length === 0 && notB.length === 0, bad, notB, count: all.length };
}

async function readSlots(board, zone) {
  return board.evaluate((z) => {
    const root = document.querySelector(`.milksha-zone.${z}`);
    const cells = [...root.querySelectorAll('.milksha-num-cell')];
    const clones = [...document.querySelectorAll(`[data-column-move-exit-clone]`)].map((el) => {
      const r = el.getBoundingClientRect();
      const o = Number.parseFloat(getComputedStyle(el).opacity);
      return {
        num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
        x: r.left,
        y: r.top,
        opacity: o,
      };
    });
    const slots = cells.map((cell, i) => {
      const chip = cell.querySelector('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
      const r = chip ? chip.getBoundingClientRect() : null;
      const o = chip ? Number.parseFloat(getComputedStyle(chip).opacity) : 0;
      const tr = chip ? getComputedStyle(chip).transform : '';
      let scale = 1;
      const m = tr && tr !== 'none' ? tr.match(/matrix\(([^)]+)\)/) : null;
      if (m) {
        scale = Number.parseFloat(m[1].split(',')[0]) || 1;
      }
      return {
        i,
        num: chip?.querySelector('.milksha-num')?.textContent?.trim() || '',
        x: r?.left ?? null,
        y: r?.top ?? null,
        opacity: o,
        scale,
        visible: Boolean(chip && o > 0.01),
      };
    });
    return { slots, clones };
  }, zone);
}

function analyzeTransition(samples, trackedNum) {
  const pts = [];
  for (const s of samples) {
    const fromSlots = s.snap.slots.filter((x) => x.num === trackedNum && x.visible);
    const fromClones = s.snap.clones.filter((x) => x.num === trackedNum && x.opacity > 0.01);
    const p = fromSlots[0] || fromClones[0];
    if (p && p.x != null) {
      pts.push({ t: s.t, x: p.x, y: p.y });
    }
  }
  if (pts.length < 3) {
    return { pass: false, reason: 'too-few-samples', pts };
  }
  let horizBad = false;
  for (let i = 1; i < pts.length; i += 1) {
    if (Math.abs(pts[i].x - pts[i - 1].x) > 1.5 && pts[i].y !== null) {
      horizBad = true;
    }
  }
  const ys = pts.map((p) => p.y);
  const downFirst = ys.some((y, i) => i > 0 && y > pts[i - 1].y + 2);
  return { pass: !horizBad && downFirst, horizBad, downFirst, pts };
}

async function sendOne(ctrl, board, status, no, latencies) {
  await expandZone(ctrl, 'sec-pos');
  await ctrl.selectOption('[data-testid="fld-status"]', status);
  await ctrl.fill('[data-testid="fld-no"]', String(no));
  const t0 = Date.now();
  await ctrl.click('[data-testid="btn-add-ticket"]');
  const zone = status === 'ready' ? 'ready' : 'prep';
  await board
    .waitForFunction(
      ({ z, n }) =>
        [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].some((el) => el.textContent.trim() === n),
      { z: zone, n: String(no) },
      { timeout: 5000 },
    )
    .catch(() => {});
  latencies.push(Date.now() - t0);
}

async function runColumnTests(board, ctrl, label) {
  const transitions = [];
  const latencies = [];
  await clearNow(ctrl, board);
  for (const zone of ['prep', 'ready']) {
    const status = zone === 'prep' ? 'preparing' : 'ready';
    const base = zone === 'prep' ? 7001 : 8001;
    for (let n = 1; n <= 11; n += 1) {
      const no = base + n - 1;
      if (n >= 6 && n <= 10) {
        const before = await readSlots(board, zone);
        const trackedNum = before.slots[4]?.num || '';
        const samples = [];
        await sendOne(ctrl, board, status, no, latencies);
        for (let t = 0; t <= 600; t += 16) {
          const snap = await readSlots(board, zone);
          samples.push({ t, snap });
          await board.waitForTimeout(16);
        }
        const analysis = analyzeTransition(samples, trackedNum);
        transitions.push({ zone, step: `${n - 1}->${n}`, trackedNum, analysis, samples: samples.length });
      } else {
        await sendOne(ctrl, board, status, no, latencies);
      }
      await board.waitForTimeout(2000);
    }
    if (zone === 'ready') {
      const newest = String(base + 10);
      let maxScale = 1;
      for (let i = 0; i < 80; i += 1) {
        const s = await board.evaluate((num) => {
          const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
          const c = chips.find((el) => el.querySelector('.milksha-num')?.textContent?.trim() === num);
          if (!c) {
            return 1;
          }
          const tr = getComputedStyle(c).transform;
          const m = tr.match(/matrix\(([^)]+)\)/);
          return m ? Number.parseFloat(m[1].split(',')[0]) : 1;
        }, newest);
        maxScale = Math.max(maxScale, s);
        await board.waitForTimeout(50);
      }
      transitions.push({ zone: 'ready', pulseCheck: { num: newest, maxScale, pass: maxScale > 1.25 } });
    }
  }
  const integrity = await board.evaluate(() => {
    const issues = [];
    for (const z of ['prep', 'ready']) {
      const nums = [];
      for (const cell of document.querySelectorAll(`.milksha-zone.${z} .milksha-num-cell`)) {
        const chips = cell.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
        const ns = [...cell.querySelectorAll('.milksha-num')].map((n) => n.textContent.trim());
        if (chips.length > 1 || ns.length > 1) {
          issues.push({ z, kind: 'multi' });
        }
        for (const n of ns.filter(Boolean)) {
          nums.push(n);
        }
      }
      const ordered = [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].map((n) =>
        Number.parseInt(n.textContent.trim(), 10),
      );
      for (let i = 1; i < ordered.length; i += 1) {
        if (ordered[i] > ordered[i - 1]) {
          issues.push({ z, kind: 'order' });
        }
      }
      const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
      if (dup.length) {
        issues.push({ z, kind: 'dup', dup });
      }
    }
    return issues;
  });
  await board.waitForTimeout(2500);
  const ghost = await board.evaluate(() => {
    const bad = [];
    for (const chip of document.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)')) {
      const o = Number.parseFloat(getComputedStyle(chip).opacity);
      if (chip.closest('.milksha-num-cell') && o < 0.01) {
        bad.push(chip.querySelector('.milksha-num')?.textContent?.trim());
      }
    }
    return bad;
  });
  return { label, transitions, latencies, integrity, ghost, latOver3: latencies.filter((ms) => ms > 3000) };
}

async function peakScan(board, ctrl) {
  await expandZone(ctrl, 'sec-pos');
  await ctrl.locator('[data-testid="btn-gen-peak"]').click();
  await ctrl.evaluate(() => window.__controller?.startStoreSimulation?.('peak'));
  let flags = 0;
  let samples = 0;
  const end = Date.now() + 5 * 60 * 1000;
  while (Date.now() < end) {
    const f = await board.evaluate(() => {
      let n = 0;
      const four = /^\d{4}$/;
      const all = [];
      for (const z of ['prep', 'ready']) {
        for (const cell of document.querySelectorAll(`.milksha-zone.${z} .milksha-num-cell`)) {
          const chips = cell.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
          const nums = [...cell.querySelectorAll('.milksha-num')].map((x) => x.textContent.trim());
          if (chips.length > 1 || nums.length > 1) {
            n += 1;
          }
          for (const t of nums.filter(Boolean)) {
            if (!four.test(t)) {
              n += 1;
            }
            all.push(t);
          }
          for (const chip of chips) {
            if (Number.parseFloat(getComputedStyle(chip).opacity) < 0.01) {
              n += 1;
            }
          }
        }
      }
      if (new Set(all).size !== all.length) {
        n += 1;
      }
      return n;
    });
    flags += f;
    samples += 1;
    await board.waitForTimeout(1000);
  }
  await ctrl.click('[data-testid="btn-sim-stop"]').catch(() => {});
  const c0 = await ctrl.evaluate(() => window.__controller?.getSimulationSendCount?.() ?? 0);
  await board.waitForTimeout(60000);
  const c1 = await ctrl.evaluate(() => window.__controller?.getSimulationSendCount?.() ?? 0);
  return { samples, flags, quietOk: c0 === c1 };
}

async function copyAgent() {
  mkdirSync(AGENT, { recursive: true });
  execSync(
    `rsync -a --exclude 'profile-old' /workspace/artifacts/pr46live/ ${AGENT}/`,
    { stdio: 'inherit' },
  );
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  log('start pr46');
  await waitDeploy();

  const persistent = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1920, height: 1080 },
  });
  const b1 = await persistent.newPage();
  const c1 = await persistent.newPage();
  await b1.goto(BOARD_URL, { waitUntil: 'load' });
  await c1.goto(CTRL_URL, { waitUntil: 'load' });
  await waitOnline(b1, c1);
  const staleRes = [...(await collectResources(b1)), ...(await collectResources(c1))];
  const staleAudit = auditResources(staleRes);
  writeFileSync(join(ART, 'stale-cache-reopen.json'), JSON.stringify({ staleAudit, resources: staleRes }, null, 2));

  const col1080 = await runColumnTests(b1, c1, 'persistent-1920');
  await b1.screenshot({ path: join(SHOTS, 'persistent-1920.png'), fullPage: true });
  await b1.close();
  await c1.close();
  await persistent.close();

  const browser = await chromium.launch({ headless: true });
  const fresh = await browser.newContext({ viewport: { width: 3840, height: 2160 } });
  const b2 = await fresh.newPage();
  const c2 = await fresh.newPage();
  await b2.goto(BOARD_URL);
  await c2.goto(CTRL_URL);
  await waitOnline(b2, c2);
  const freshRes = [...(await collectResources(b2)), ...(await collectResources(c2))];
  const freshAudit = auditResources(freshRes);
  const col4k = await runColumnTests(b2, c2, 'fresh-3840');
  await b2.screenshot({ path: join(SHOTS, 'fresh-3840.png'), fullPage: true });
  await expandZone(c2, 'sec-connect');
  const storeOk = await c2.evaluate(() => {
    const sel = document.getElementById('fld-store');
    return Boolean(sel && sel.options.length > 0);
  });
  const ind = await b2.evaluate(() => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    if (!art || !canvas) {
      return false;
    }
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    const s = m ? Number(m[1]) : 1;
    function ok(z) {
      const ind = document.querySelector(`.milksha-zone.${z} .milksha-pg-indicator`);
      const cream = art.creamRectForZone(z);
      const cRect = canvas.getBoundingClientRect();
      const ir = ind?.getBoundingClientRect();
      if (!ind || !ir) {
        return false;
      }
      const insetR = cream.left + cream.width - (ir.right - cRect.left) / s;
      const insetB = cream.top + cream.height - (ir.bottom - cRect.top) / s;
      return Math.abs(insetR - 16) <= 3 && Math.abs(insetB - 16) <= 3;
    }
    return ok('prep') && ok('ready');
  });
  const regression = { storeOk, indicatorOk: ind, latOver3: [...col1080.latOver3, ...col4k.latOver3] };
  writeFileSync(join(ART, 'regression-4k-post-column.json'), JSON.stringify(regression, null, 2));
  const peak = await peakScan(b2, c2);
  await clearNow(c2, b2);
  const empty = await b2.evaluate(
    () =>
      document.querySelectorAll('.milksha-prep .milksha-num').length === 0 &&
      document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
  );
  await b2.close();
  await c2.close();
  await fresh.close();
  await browser.close();

  const transPass = [...col1080.transitions, ...col4k.transitions]
    .filter((t) => t.analysis)
    .every((t) => t.analysis.pass);
  const pulsePass = [...col1080.transitions, ...col4k.transitions]
    .filter((t) => t.pulseCheck)
    .every((t) => t.pulseCheck.pass);
  const pass =
    staleAudit.pass &&
    transPass &&
    pulsePass &&
    col1080.integrity.length === 0 &&
    col1080.ghost.length === 0 &&
    col4k.integrity.length === 0 &&
    col4k.ghost.length === 0 &&
    peak.flags === 0 &&
    peak.quietOk &&
    storeOk &&
    ind &&
    empty;

  const out = {
    pass,
    sha: '4146812',
    assetVersion: TARGET_V,
    staleCache: staleAudit,
    columnTests: { persistent1920: col1080, fresh3840: col4k },
    peak,
    regression,
    teardown: { empty },
  };
  writeFileSync(join(ART, 'results.json'), JSON.stringify(out, null, 2));
  copyAgent();
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  log(`FATAL ${e.stack || e}`);
  process.exit(1);
});
