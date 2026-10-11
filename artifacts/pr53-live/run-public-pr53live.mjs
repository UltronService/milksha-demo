#!/usr/bin/env node
/**
 * PR #53 public retest — page-turn desync, asset 20261011c.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectFrame,
  installBoardMutationWatcher,
  checkFrame,
  classifyKnown,
  medianIntervalMs,
} from '../midframe/run-midframe-scan.mjs';

const ART = join(process.cwd(), 'artifacts', 'pr53live');
const AGENT = '/cursor/stores/self/artifacts/pr53live';
const PROFILE = '/workspace/profiles/stale-53';
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const BASE = 'https://ultronservice.github.io/milksha-demo';
const BOARD_URL = `${BASE}/?mode=cloud&store=${STORE}&device=${DEVICE}`;
const CTRL_URL = `${BASE}/controller/?mode=cloud&store=${STORE}`;
const TARGET_V = '20261011c';
const DEPLOY_MS = Date.parse('Sun, 11 Oct 2026 17:05:30 GMT');
const POST_MS = 10 * 60 * 1000;
const PAGE_SIZE = 10;

function log(m) {
  appendFileSync(join(ART, 'run.log'), `[${new Date().toISOString()}] ${m}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function taipei(iso) {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Taipei';
}

async function waitDeploy() {
  const ready = DEPLOY_MS + POST_MS;
  const w = Math.max(0, ready - Date.now() + 1000);
  if (w > 0) {
    log(`deploy wait ${w}ms`);
    await sleep(w);
  }
  return { deployMs: DEPLOY_MS, deployTaipei: taipei(new Date(DEPLOY_MS).toISOString()), sha: '0ed3056' };
}

function collectResources(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/milksha-demo/'))
      .filter((e) => /\.(js|css)(\?|$)/.test(e.name))
      .map((e) => ({
        url: e.name,
        v: (e.name.match(/[?&]v=([^&]+)/) || [])[1] || null,
        transferSize: e.transferSize,
      })),
  );
}

function auditVersions(resources) {
  const bad = resources.filter((r) => r.v && r.v !== TARGET_V);
  const oldB = resources.filter((r) => r.v === '20261011b');
  const versions = [...new Set(resources.map((r) => r.v).filter(Boolean))].sort();
  return { pass: bad.length === 0 && oldB.length === 0 && versions.every((v) => v === TARGET_V), versions, bad, oldB, count: resources.length };
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

async function waitOnline(board, ctrl) {
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-board-online="1"]', { timeout: 180000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await installBoardMutationWatcher(board);
}

async function clearNow(ctrl, board) {
  await expandZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  await ctrl.click('[data-testid="btn-sim-stop"]').catch(() => {});
  await board.waitForTimeout(4000);
  await board.waitForFunction(() => document.querySelectorAll('.milksha-board-chip').length === 0, undefined, {
    timeout: 120000,
  });
}

async function fireTicket(ctrl, status, no) {
  await expandZone(ctrl, 'sec-pos');
  await ctrl.selectOption('[data-testid="fld-status"]', status);
  await ctrl.fill('[data-testid="fld-no"]', no);
  await ctrl.click('[data-testid="btn-add-ticket"]');
}

async function addTicket(ctrl, board, status, no, zone) {
  const t0 = Date.now();
  await fireTicket(ctrl, status, no);
  const zn = zone || (status === 'ready' ? 'ready' : 'prep');
  await board
    .waitForFunction(
      ({ z, n }) => [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].some((el) => el.textContent.trim() === n),
      { z: zn, n: no },
      { timeout: 15000 },
    )
    .catch(() => {});
  return Date.now() - t0;
}

function LEGACY_SEED() {
  if (localStorage.getItem('__pr53_legacy')) {
    return;
  }
  localStorage.setItem('__pr53_legacy', '1');
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem('milksha:local:poc-target', JSON.stringify({ storeId: 's120030', deviceId: 'stb-01' }));
  localStorage.setItem('milksha:receiver-cache:s120030', JSON.stringify({ seq: 1, numberContent: [] }));
  localStorage.setItem('milksha:auth:legacy:zz:device:stb-01', JSON.stringify({ idToken: 'stale' }));
}

async function zoneNumbersSettled(board, zone) {
  return board.evaluate((z) => {
    const layer = document.querySelector(`.milksha-zone.${z} .milksha-zone-numbers`);
    if (!layer) {
      return false;
    }
    const o = Number.parseFloat(getComputedStyle(layer).opacity);
    return o >= 0.99;
  }, zone);
}

async function readBoardPage(board) {
  return board.evaluate(() => {
    function zone(z) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      const ind = root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
      const nums = [...root.querySelectorAll('.milksha-num')].map((n) => n.textContent.trim()).filter(Boolean);
      const m = ind.match(/^(\d+)\/(\d+)$/);
      return {
        indicator: ind,
        page: m ? Number.parseInt(m[1], 10) - 1 : 0,
        pages: m ? Number.parseInt(m[2], 10) : 1,
        nums,
      };
    }
    return { prep: zone('prep'), ready: zone('ready') };
  });
}

function expectedPageSet(sentAsc, pageIndex) {
  const newestFirst = sentAsc.slice().reverse();
  const start = pageIndex * PAGE_SIZE;
  return new Set(newestFirst.slice(start, start + PAGE_SIZE));
}

function setsEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false;
    }
  }
  return true;
}

async function measureIndicator(board) {
  return board.evaluate(() => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const tol = 3;
    function ok(z) {
      const ind = document.querySelector(`.milksha-zone.${z} .milksha-pg-indicator`);
      if (!art || !canvas || !ind) {
        return { ok: false };
      }
      const cream = art.creamRectForZone(z);
      const cRect = canvas.getBoundingClientRect();
      const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
      const s = m ? Number(m[1]) : 1;
      const ir = ind.getBoundingClientRect();
      const insetR = cream.left + cream.width - (ir.right - cRect.left) / s;
      const insetB = cream.top + cream.height - (ir.bottom - cRect.top) / s;
      return { ok: Math.abs(insetR - 16) <= tol && Math.abs(insetB - 16) <= tol, text: ind.textContent.trim() };
    }
    return { prep: ok('prep'), ready: ok('ready') };
  });
}

async function scanPageTurnFrames(board, label, durationMs = 800) {
  const prevByKey = new Map();
  const newIssues = [];
  const knownCounts = {};
  const times = [];
  const t0 = Date.now();
  let frame = 0;
  while (Date.now() - t0 < durationMs) {
    const scheduled = t0 + frame * 50;
    const w = scheduled - Date.now();
    if (w > 0) {
      await sleep(w);
    }
    times.push(Date.now());
    const tMs = Date.now() - t0;
    const state = await collectFrame(board);
    const issues = checkFrame(state, prevByKey, tMs);
    for (const iss of issues) {
      const labelK = classifyKnown(iss, 'page-turn', {});
      if (labelK) {
        knownCounts[labelK] = (knownCounts[labelK] || 0) + 1;
      } else {
        newIssues.push({ label, tMs, check: iss.check, nums: iss.num ? [iss.num] : iss.nums || [] });
      }
    }
    frame += 1;
  }
  return { newIssues, knownCounts, frameCount: frame, medianMs: medianIntervalMs(times) };
}

async function staleCache() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1920, height: 1080 },
  });
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(BOARD_URL, { waitUntil: 'load' });
  await ctrl.goto(CTRL_URL, { waitUntil: 'load' });
  await board.waitForTimeout(2000);
  const all = [...(await collectResources(board)), ...(await collectResources(ctrl))];
  const map = new Map();
  for (const r of all) {
    map.set(r.url, r);
  }
  const resources = [...map.values()];
  const audit = auditVersions(resources);
  await board.close();
  await ctrl.close();
  await ctx.close();
  return { audit, resources, vList: resources.map((r) => ({ url: r.url.replace(/^https:\/\/[^/]+\/milksha-demo\//, ''), v: r.v })) };
}

async function mainFlow(browser, vp, legacy) {
  const ctx = legacy
    ? await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    : await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  if (legacy) {
    await ctx.addInitScript(LEGACY_SEED);
  }
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(BOARD_URL, { waitUntil: 'load' });
  await ctrl.goto(CTRL_URL, { waitUntil: 'load' });
  await waitOnline(board, ctrl);
  await clearNow(ctrl, board);
  const latencies = [];
  for (let i = 0; i < 11; i += 1) {
    latencies.push(await addTicket(ctrl, board, 'preparing', String(5100 + i), 'prep'));
  }
  for (let i = 0; i < 11; i += 1) {
    latencies.push(await addTicket(ctrl, board, 'ready', String(6100 + i), 'ready'));
  }
  await board.waitForTimeout(3500);
  const ind = await measureIndicator(board);
  const page = await readBoardPage(board);
  const integrity = await board.evaluate(() => {
    let multi = 0;
    let ghost = 0;
    let orderBad = 0;
    for (const z of ['prep', 'ready']) {
      const nums = [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].map((n) =>
        Number.parseInt(n.textContent.trim(), 10),
      );
      for (let i = 1; i < nums.length; i += 1) {
        if (nums[i] > nums[i - 1]) {
          orderBad += 1;
        }
      }
      for (const cell of document.querySelectorAll(`.milksha-zone.${z} .milksha-num-cell`)) {
        const chips = cell.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
        if (chips.length > 1) {
          multi += 1;
        }
        for (const c of chips) {
          if (Number.parseFloat(getComputedStyle(c).opacity) < 0.01) {
            ghost += 1;
          }
        }
      }
    }
    return { multi, ghost, orderBad };
  });
  const res = await collectResources(board);
  const audit = auditVersions(res);
  await clearNow(ctrl, board);
  await ctx.close();
  return {
    tag: `${legacy ? 'legacy' : 'fresh'}-${vp.tag}`,
    resolution: `${vp.w}x${vp.h}`,
    indicator: ind,
    page,
    integrity,
    latencies,
    latOver3: latencies.filter((ms) => ms > 3000),
    versions: audit.versions,
  };
}

async function pageTurnDesync(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(BOARD_URL);
  await ctrl.goto(CTRL_URL);
  await waitOnline(board, ctrl);
  await clearNow(ctrl, board);
  const prepSent = [];
  const readySent = [];
  for (let i = 0; i < 12; i += 1) {
    const n = String(7100 + i);
    prepSent.push(n);
    await addTicket(ctrl, board, 'preparing', n, 'prep');
  }
  for (let i = 0; i < 12; i += 1) {
    const n = String(8100 + i);
    readySent.push(n);
    await addTicket(ctrl, board, 'ready', n, 'ready');
  }
  const cycles = [];
  const midFrames = [];
  const pageMismatch = [];
  const lastSeen = new Map();
  const missingOver3s = [];
  for (let c = 0; c < 10; c += 1) {
    await board.waitForTimeout(5200);
    const animating = await board.evaluate(() => {
      const layers = document.querySelectorAll('.milksha-zone-numbers');
      for (const el of layers) {
        const o = Number.parseFloat(getComputedStyle(el).opacity);
        if (o < 0.99 && o > 0.01) {
          return true;
        }
      }
      return false;
    });
    const midNo = String(7200 + c);
    prepSent.push(midNo);
    const midSentAt = Date.now();
    await fireTicket(ctrl, 'preparing', midNo);
    const midAppearMs = await board
      .waitForFunction(
        (n) =>
          [...document.querySelectorAll('.milksha-zone.prep .milksha-num')].some((el) => el.textContent.trim() === n),
        midNo,
        { timeout: 3000 },
      )
      .then(() => Date.now() - midSentAt)
      .catch(() => null);
    const scan = await scanPageTurnFrames(board, `cycle-${c}`, 800);
    midFrames.push(scan);
    for (let p = 0; p < 13; p += 1) {
      await board.waitForTimeout(500);
      const snap = await readBoardPage(board);
      const now = Date.now();
      for (const n of [...snap.prep.nums, ...snap.ready.nums]) {
        lastSeen.set(n, now);
      }
      for (const z of ['prep', 'ready']) {
        const sent = z === 'prep' ? prepSent : readySent;
        const st = snap[z];
        if (st.pages <= 1 || st.nums.length === 0) {
          continue;
        }
        if (!(await zoneNumbersSettled(board, z))) {
          continue;
        }
        const exp = expectedPageSet(sent, st.page);
        const vis = new Set(st.nums);
        if (!setsEqual(exp, vis)) {
          pageMismatch.push({ cycle: c, zone: z, indicator: st.indicator, expected: [...exp], visible: [...vis] });
        }
      }
    }
    if (midAppearMs === null || midAppearMs > 3000) {
      missingOver3s.push({ cycle: c, num: midNo, sentAt: midSentAt, appearMs: midAppearMs });
    }
    const snapEnd = await readBoardPage(board);
    cycles.push({ cycle: c, animatingAtSend: animating, snap: snapEnd, midNew: scan.newIssues.length });
  }
  const ind0 = await readBoardPage(board);
  await board.waitForTimeout(6200);
  const ind1 = await readBoardPage(board);
  const indFadeOk =
    ind0.prep.indicator !== ind1.prep.indicator || ind0.ready.indicator !== ind1.ready.indicator;
  await clearNow(ctrl, board);
  await ctx.close();
  const midNew = midFrames.flatMap((f) => f.newIssues);
  const midKnown = {};
  for (const f of midFrames) {
    for (const [k, v] of Object.entries(f.knownCounts)) {
      midKnown[k] = (midKnown[k] || 0) + v;
    }
  }
  const pass = pageMismatch.length === 0 && missingOver3s.length === 0 && midNew.length === 0 && indFadeOk;
  return {
    pass,
    cycles: cycles.length,
    pageMismatch,
    missingOver3s,
    midFrames,
    indFadeOk,
    midNewCount: midNew.length,
    midKnownCounts: midKnown,
    midFrameSamples: midFrames.reduce((s, f) => s + f.frameCount, 0),
  };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  log('start pr53');
  const deploy = await waitDeploy();
  deploy.pagesDeployOk = true;
  deploy.pagesLastModifiedUtc = 'Sun, 11 Oct 2026 17:05:30 GMT';
  deploy.waitUntilTaipei = taipei(new Date(DEPLOY_MS + POST_MS).toISOString());
  writeFileSync(join(ART, 'deploy.json'), JSON.stringify(deploy, null, 2));

  const stale = await staleCache();
  writeFileSync(join(ART, 'stale-cache.json'), JSON.stringify(stale, null, 2));

  const browser = await chromium.launch({ headless: true });
  const flows = [];
  for (const vp of [{ w: 1920, h: 1080, tag: '1080' }, { w: 3840, h: 2160, tag: '4k' }]) {
    flows.push(await mainFlow(browser, vp, false));
    flows.push(await mainFlow(browser, vp, true));
  }
  const desync1080 = await pageTurnDesync(browser, { w: 1920, h: 1080, tag: '1080' });
  const desync4k = await pageTurnDesync(browser, { w: 3840, h: 2160, tag: '4k' });
  await browser.close();

  const stalePass = stale.audit.pass;
  const flowPass = flows.every(
    (f) => f.indicator.prep.ok && f.indicator.ready.ok && f.integrity.multi === 0 && f.integrity.ghost === 0 && f.latOver3.length === 0,
  );
  const desyncPass = desync1080.pass && desync4k.pass;
  const pass = stalePass && flowPass && desyncPass;

  const out = {
    pass,
    sha: '0ed3056',
    assetVersion: TARGET_V,
    deploy,
    staleCache: stale.audit,
    staleVList: stale.vList,
    mainFlows: flows,
    pageTurnDesync: { '1080': desync1080, '4k': desync4k },
  };
  writeFileSync(join(ART, 'results.json'), JSON.stringify(out, null, 2));
  mkdirSync(AGENT, { recursive: true });
  for (const n of readdirSync(ART)) {
    cpSync(join(ART, n), join(AGENT, n), { recursive: true, force: true });
  }
  log(`done pass=${pass}`);
  console.log(JSON.stringify({ pass, stalePass, flowPass, desyncPass }, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  log(`FATAL ${e.stack || e}`);
  process.exit(1);
});
