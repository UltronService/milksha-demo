#!/usr/bin/env node
/**
 * Live cloud matrix (#32 vs main): public Pages firebase config, instrumented timings + 5m read probe.
 */
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
} from './lib/github-pages-site-route.mjs';
import { CONTROLLER_BOARD_ONLINE_WAIT_JS } from './lib/controller-board-online.mjs';
async function expandControllerZone(page, zoneId) {
  await page.evaluate((id) => {
    const section = document.getElementById(id);
    if (!section) {
      return;
    }
    const btn = section.querySelector('.zone-toggle');
    const body = section.querySelector('.zone-body');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
    }
    if (body) {
      body.hidden = false;
    }
  }, zoneId);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'realtime-board-self-qa');
const BRANCH_ROOT = resolveSiteRoot(ROOT);
const STORES = ['zz-qa-store-a', 'zz-qa-store-b', 'zz-qa-store-c', 'zz-qa-store-d', 'zz-qa-store-e'];
const STORE_A = STORES[0];
const DEVICE = 'stb-01';
const PUBLIC_CONFIG_URL = `${GITHUB_PAGES_BASE}/config/firebase.js`;
const READ_PROBE_SEC = Number(process.env.MILKSHA_MATRIX_READ_SEC || 300);

let cachedPublicFirebaseJs = '';

async function ensurePublicFirebaseJs() {
  if (cachedPublicFirebaseJs) {
    return cachedPublicFirebaseJs;
  }
  const res = await fetch(PUBLIC_CONFIG_URL, { cache: 'no-store' });
  cachedPublicFirebaseJs = await res.text();
  return cachedPublicFirebaseJs;
}

function gitSha(ref) {
  try {
    return execSync(`git rev-parse ${ref}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function materializeMainSiteRoot() {
  const dir = join(ART, '.main-tree');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync('git fetch origin main --quiet', { cwd: ROOT, stdio: 'ignore' });
  execSync(`git archive origin/main | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

function boardUrl(storeId) {
  const u = new URL(`${GITHUB_PAGES_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', storeId);
  u.searchParams.set('device', DEVICE);
  return u.toString();
}

async function installLiveCloudRoutes(ctx, siteRoot) {
  const pubJs = await ensurePublicFirebaseJs();
  await installGithubPagesSiteRoute(ctx, siteRoot);
  await ctx.route('**/config/firebase.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: pubJs,
    });
  });
  await ctx.addInitScript(() => {
    window.__rcvMatrixTimeline = [];
    try {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: cfg.projectId || 'milksha-qms-dev',
          apiKey: cfg.apiKey || '',
          region: cfg.region || 'asia-east1',
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

function uniqueTicketNo(runIndex, browserIndex) {
  return String(8800 + runIndex * 17 + browserIndex * 3);
}

async function measureBoardBootMs(board, tOpen) {
  await board
    .waitForFunction(() => typeof window.receiverCloud?.getRealtimeStats === 'function', {
      timeout: 60000,
    })
    .catch(() => undefined);
  const paintWait = board
    .waitForFunction(
      () => {
        if (document.querySelectorAll('.milksha-ready .milksha-num').length > 0) {
          return true;
        }
        const clock = document.getElementById('milksha-guest-clock');
        if (clock && !clock.hidden) {
          return true;
        }
        const seq = window.receiverCloud?.getLocalSeq?.();
        return typeof seq === 'number' && seq > 0;
      },
      { timeout: 45000 },
    )
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  const realtimeWait = board
    .waitForFunction(() => {
      const s = window.receiverCloud?.getRealtimeStats?.();
      return Boolean(s && s.boardListen);
    }, { timeout: 45000 })
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  const boardFirstPaintMs = await paintWait;
  const realtimeAttachedMs = await realtimeWait;
  const stats0 = await board.evaluate(() =>
    window.receiverCloud.getRealtimeStats
      ? window.receiverCloud.getRealtimeStats()
      : { boardListen: false, commandMode: 'poll' },
  );
  return { boardFirstPaintMs, realtimeAttachedMs, stats0 };
}

async function runInstrumentedSend(browser, label, siteRoot, ticketNo, opts) {
  const expectRealtime = !(opts && opts.mainBaseline);
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(120000);
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  board.setDefaultTimeout(120000);
  ctrl.setDefaultTimeout(120000);
  const restGets = [];
  board.on('request', (req) => {
    const u = req.url();
    if (u.includes('firestore.googleapis.com') && req.method() === 'GET') {
      restGets.push({ ts: Date.now(), path: u.split('/documents/')[1] || u });
    }
  });
  const tOpen = Date.now();
  await board.goto(boardUrl(STORE_A));
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE_A}`);
  const boot = await measureBoardBootMs(board, tOpen);
  const boardFirstPaintMs = boot.boardFirstPaintMs;
  const realtimeAttachedMs = expectRealtime ? boot.realtimeAttachedMs : null;
  const stats0 = boot.stats0;
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  const controllerBoardOnlineMs = await ctrl
    .waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, { timeout: 90000 })
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  await expandControllerZone(ctrl, 'sec-pos');
  const buttonPressedAt = Date.now();
  const devRes = await Promise.all([
    ctrl.waitForResponse(
      (res) => res.url().includes('devCommand') && res.request().method() === 'POST',
      { timeout: 90000 },
    ),
    (async () => {
      await ctrl.fill('#fld-no', ticketNo);
      await ctrl.selectOption('#fld-status', 'ready');
      await ctrl.click('#btn-add-ticket');
    })(),
  ]).then(([res]) => res);
  const devCommandResponseAt = Date.now();
  let devCommandBody = {};
  try {
    devCommandBody = await devRes.json();
  } catch {
    devCommandBody = {};
  }
  await board.waitForSelector('.milksha-ready .milksha-num', { hasText: ticketNo, timeout: 45000 });
  const domVisibleAt = Date.now();
  const timeline = await board.evaluate((since) => {
    const tl = window.__rcvMatrixTimeline || [];
    return tl.filter((e) => e.ts >= since);
  }, buttonPressedAt);
  const snapEvents = timeline.filter((e) => e.kind === 'board_snapshot');
  const lastSnap = snapEvents[snapEvents.length - 1] || null;
  const displayed = await board.locator('.milksha-ready .milksha-num', { hasText: ticketNo }).textContent();
  const stats1 = await board.evaluate(() => {
    if (window.receiverCloud && typeof window.receiverCloud.getRealtimeStats === 'function') {
      return window.receiverCloud.getRealtimeStats();
    }
    return { boardListen: false, commandMode: 'poll' };
  });
  await ctx.close();
  const sendToDisplayMs = domVisibleAt - buttonPressedAt;
  return {
    label,
    ticketNo,
    boardFirstPaintMs,
    realtimeAttachedMs,
    controllerBoardOnlineMs,
    sendToDisplayMs,
    sendToDisplayWithin3s: sendToDisplayMs <= 3000,
    commandMode: stats1.commandMode,
    boardListen: stats1.boardListen,
    boardListenAfterReady: stats0.boardListen,
    timeline: {
      buttonPressedAt,
      devCommandResponseAt,
      devCommandMs: devCommandResponseAt - buttonPressedAt,
      boardSnapshotAt: lastSnap ? lastSnap.ts : null,
      boardSnapshotMeta: lastSnap
        ? {
            fromCache: lastSnap.fromCache,
            hasPendingWrites: lastSnap.hasPendingWrites,
            seq: lastSnap.seq,
            updatedAt: lastSnap.updatedAt,
          }
        : null,
      domVisibleAt,
      domAfterButtonMs: domVisibleAt - buttonPressedAt,
      devCommandBody: {
        commandId: devCommandBody.commandId || devCommandBody.commandID || null,
        boardSeq: devCommandBody.boardSeq ?? null,
      },
    },
    restGetsDuringRun: restGets.length,
    displayedReadyNo: (displayed || '').trim(),
    separateContexts: true,
  };
}

async function runStoreProbe(browser, label, siteRoot, storeId) {
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const tOpen = Date.now();
  await board.goto(boardUrl(storeId));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  const boot = await measureBoardBootMs(board, tOpen);
  const stats = boot.stats0;
  await ctx.close();
  return {
    label,
    storeId,
    boardFirstPaintMs: boot.boardFirstPaintMs,
    realtimeAttachedMs: boot.realtimeAttachedMs,
    boardListen: stats.boardListen,
    commandMode: stats.commandMode,
  };
}

async function measureReadTraffic(browser, label, siteRoot) {
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  let restGet = 0;
  board.on('request', (req) => {
    if (req.url().includes('firestore.googleapis.com') && req.method() === 'GET') {
      restGet += 1;
    }
  });
  await board.goto(boardUrl(STORE_A));
  await board.waitForFunction(() => window.receiverCloud, { timeout: 90000 });
  await board.waitForTimeout(READ_PROBE_SEC * 1000);
  const timeline = await board.evaluate(() => window.__rcvMatrixTimeline || []);
  const onSnapshot = timeline.filter((e) => e.kind === 'board_snapshot').length;
  const stats = await board.evaluate(() =>
    window.receiverCloud.getRealtimeStats ? window.receiverCloud.getRealtimeStats() : { boardListen: false },
  );
  await ctx.close();
  const hours = READ_PROBE_SEC / 3600;
  return {
    label,
    method: 'measured',
    durationSec: READ_PROBE_SEC,
    restGet,
    onSnapshotEvents: onSnapshot,
    boardListen: stats.boardListen,
    perHour: {
      restGet: Math.round(restGet / hours),
      onSnapshotEvents: Math.round(onSnapshot / hours),
    },
  };
}

async function runOfflineConsistency(browser, siteRoot) {
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(120000);
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  board.setDefaultTimeout(120000);
  ctrl.setDefaultTimeout(120000);
  const ticketNo = '8811';
  await board.goto(boardUrl(STORE_A));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE_A}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await expandControllerZone(ctrl, 'sec-pos');
  await ctrl.fill('#fld-no', ticketNo);
  await ctrl.selectOption('#fld-status', 'ready');
  await ctrl.click('#btn-add-ticket');
  await board.waitForSelector(`.milksha-ready .milksha-num`, { hasText: ticketNo, timeout: 15000 });
  const before = ticketNo;
  await ctx.setOffline(true);
  await board.waitForTimeout(30000);
  await ctx.setOffline(false);
  await board.waitForTimeout(8000);
  await board.waitForSelector(`.milksha-ready .milksha-num`, { hasText: before, timeout: 20000 });
  await ctx.close();
  return { method: 'playwright_context_offline_30s', beforeReady: before, ok: true };
}

async function runStoreIsolation(browser, siteRoot) {
  const markerNo = '8822';
  const ctxA = await browser.newContext();
  await installLiveCloudRoutes(ctxA, siteRoot);
  const boardA = await ctxA.newPage();
  const ctrlA = await ctxA.newPage();
  await boardA.goto(boardUrl(STORE_A));
  await boardA.waitForFunction(() => window.receiverCloud, { timeout: 90000 });
  await ctrlA.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE_A}`);
  await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await expandControllerZone(ctrlA, 'sec-pos');
  await ctrlA.fill('#fld-no', markerNo);
  await ctrlA.selectOption('#fld-status', 'ready');
  await ctrlA.click('#btn-add-ticket');
  await boardA.waitForSelector('.milksha-ready .milksha-num', { hasText: markerNo, timeout: 15000 });
  await ctxA.close();
  const ctxB = await browser.newContext();
  await installLiveCloudRoutes(ctxB, siteRoot);
  const pageB = await ctxB.newPage();
  await pageB.goto(boardUrl('zz-qa-store-b'));
  await pageB.waitForFunction(() => window.receiverCloud, { timeout: 90000 });
  await pageB.waitForTimeout(5000);
  const numsOnB = await pageB.locator('.milksha-ready .milksha-num').allTextContents();
  await ctxB.close();
  return {
    markerFromStoreA: markerNo,
    storeAVisibleOnStoreB: numsOnB.some((n) => n.trim() === markerNo),
    isolated: !numsOnB.some((n) => n.trim() === markerNo),
  };
}

async function rerunMainOnly(existing) {
  const mainRoot = materializeMainSiteRoot();
  const report = existing;
  report.main = { chromium: [], firefox: [] };
  const browsers = [
    { name: 'chromium', launcher: chromium, index: 0 },
    { name: 'firefox', launcher: firefox, index: 1 },
  ];
  for (const { name, launcher, index } of browsers) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (let i = 0; i < 3; i += 1) {
        const ticketNo = uniqueTicketNo(i, index);
        report.main[name].push(
          await runInstrumentedSend(
            browser,
            `main-${name}-${i + 1}`,
            mainRoot,
            String(Number(ticketNo) + 1),
            { mainBaseline: true },
          ),
        );
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
}

async function main() {
  mkdirSync(ART, { recursive: true });
  if (process.env.MILKSHA_MATRIX_MAIN_RERUN === '1') {
    const existing = JSON.parse(readFileSync(join(ART, 'live-matrix.json'), 'utf8'));
    await rerunMainOnly(existing);
    console.log(JSON.stringify({ ok: true, rerun: 'main' }, null, 2));
    return;
  }
  const mainRoot = materializeMainSiteRoot();
  const report = {
    at: new Date().toISOString(),
    baseMainSha: gitSha('origin/main'),
    branchSha: gitSha('HEAD'),
    writeStore: STORE_A,
    stores: STORES,
    apiKeySource: 'public-pages-config',
    branchSiteRoot: BRANCH_ROOT,
    mainSiteRoot: mainRoot,
    branch: { chromium: [], firefox: [] },
    main: { chromium: [], firefox: [] },
    storeTiming: {},
    offline30s: null,
    isolation: null,
    legacyUaNote:
      'Playwright 只覆写 User-Agent 字串，仍使用当前 Chromium/Firefox 引擎；非真实 Chrome 78 二进制。',
    legacyChrome78: null,
    readCountsMeasured: {},
    readCountsEstimated: {
      mainPollBaseline: 'board REST poll interval from config (estimate only)',
      pr32WithBoardListen: 'onSnapshot + 60s fallback REST (estimate only)',
      pr18AfterDeploy: 'pending listener removes 5s device poll (estimate only)',
    },
  };
  const browsers = [
    { name: 'chromium', launcher: chromium, index: 0 },
    { name: 'firefox', launcher: firefox, index: 1 },
  ];
  for (const { name, launcher, index } of browsers) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (let i = 0; i < 3; i += 1) {
        const ticketNo = uniqueTicketNo(i, index);
        try {
          report.branch[name].push(
            await runInstrumentedSend(browser, `branch-${name}-${i + 1}`, BRANCH_ROOT, ticketNo),
          );
        } catch (err) {
          report.branch[name].push({
            label: `branch-${name}-${i + 1}`,
            error: err && err.message ? String(err.message) : String(err),
          });
        }
        try {
          report.main[name].push(
            await runInstrumentedSend(
              browser,
              `main-${name}-${i + 1}`,
              mainRoot,
              String(Number(ticketNo) + 1),
              { mainBaseline: true },
            ),
          );
        } catch (err) {
          report.main[name].push({
            label: `main-${name}-${i + 1}`,
            error: err && err.message ? String(err.message) : String(err),
          });
        }
      }
      for (const storeId of STORES.slice(1)) {
        report.storeTiming[`${storeId}-${name}`] = await runStoreProbe(
          browser,
          `${name}-${storeId}`,
          BRANCH_ROOT,
          storeId,
        );
      }
      if (name === 'chromium') {
        report.offline30s = await runOfflineConsistency(browser, BRANCH_ROOT);
        report.isolation = await runStoreIsolation(browser, BRANCH_ROOT);
        const legacyCtx = await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Linux; Android 9; STB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
        });
        await installLiveCloudRoutes(legacyCtx, BRANCH_ROOT);
        const legacyPage = await legacyCtx.newPage();
        const sdkLoads = [];
        legacyPage.on('request', (req) => {
          const u = req.url();
          if (u.includes('gstatic.com/firebasejs/')) {
            sdkLoads.push(u.split('firebasejs/')[1] || u);
          }
        });
        await legacyPage.goto(boardUrl(STORE_A));
        await legacyPage.waitForFunction(() => window.receiverCloud, { timeout: 90000 });
        const stats = await legacyPage.evaluate(() => window.receiverCloud.getRealtimeStats());
        report.legacyChrome78 = { sdkLoads, stats, uaSimulatedOnly: true };
        await legacyCtx.close();
        report.readCountsMeasured.branch = await measureReadTraffic(browser, 'branch-5m', BRANCH_ROOT);
        report.readCountsMeasured.main = await measureReadTraffic(browser, 'main-5m', mainRoot);
      }
    } finally {
      await browser.close();
    }
  }
  report.completed = true;
  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, branchSha: report.branchSha, baseMainSha: report.baseMainSha }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
