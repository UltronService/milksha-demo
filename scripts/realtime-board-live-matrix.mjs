#!/usr/bin/env node
/**
 * Live cloud matrix: route branch assets on github.io origin; API key from public Pages config.
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'realtime-board-self-qa');
const SITE_ROOT = resolveSiteRoot(ROOT);
const STORES = ['zz-qa-store-a', 'zz-qa-store-b', 'zz-qa-store-c', 'zz-qa-store-d', 'zz-qa-store-e'];
const STORE_A = STORES[0];
const DEVICE = 'stb-01';
const PUBLIC_CONFIG_URL = `${GITHUB_PAGES_BASE}/config/firebase.js`;

let cachedPublicFirebaseJs = '';

async function ensurePublicFirebaseJs() {
  if (cachedPublicFirebaseJs) {
    return cachedPublicFirebaseJs;
  }
  const res = await fetch(PUBLIC_CONFIG_URL, { cache: 'no-store' });
  cachedPublicFirebaseJs = await res.text();
  return cachedPublicFirebaseJs;
}

async function loadApiKey() {
  const fromEnv = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const res = await fetch(PUBLIC_CONFIG_URL, { cache: 'no-store' });
    const text = await res.text();
    const m = text.match(/apiKey\s*:\s*['"]([^'"]+)['"]/);
    return m ? m[1].trim() : '';
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
  try {
    execSync('git fetch origin main --quiet', { cwd: ROOT, stdio: 'ignore' });
    execSync(`git archive origin/main | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
  } catch {
    execSync(`git archive main | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
  }
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

async function runMainBaselineTiming(browser, label, siteRoot, storeId) {
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const tOpen = Date.now();
  await board.goto(boardUrl(storeId));
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 90000 });
  const boardReadyMs = Date.now() - tOpen;
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${storeId}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  const tSend = Date.now();
  await ctrl.click('[data-testid="btn-send-numbers"]');
  let sendToDisplayMs = 0;
  try {
    await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 3000 });
    sendToDisplayMs = Date.now() - tSend;
  } catch {
    await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 45000 });
    sendToDisplayMs = Date.now() - tSend;
  }
  await ctx.close();
  return {
    label,
    storeId,
    boardReadyMs,
    pageOpenToFirstNumberMs: Date.now() - tOpen,
    sendToDisplayMs,
    sendToDisplayWithin3s: sendToDisplayMs <= 3000,
    commandMode: 'poll',
    boardListen: false,
    mode: 'poll',
    note: 'main branch baseline (REST poll, no getRealtimeStats)',
  };
}

async function runStoreProbe(browser, label, siteRoot, storeId) {
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const tOpen = Date.now();
  await board.goto(boardUrl(storeId));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  await board
    .waitForFunction(
      () => {
        const s = window.receiverCloud?.getRealtimeStats?.();
        return Boolean(s && s.boardListen);
      },
      { timeout: 45000 },
    )
    .catch(() => undefined);
  const boardReadyMs = Date.now() - tOpen;
  const stats = await board.evaluate(() => window.receiverCloud.getRealtimeStats());
  await ctx.close();
  return {
    label,
    storeId,
    boardReadyMs,
    commandMode: stats.commandMode,
    boardListen: stats.boardListen,
    mode: stats.boardListen ? 'realtime' : 'poll',
  };
}

async function runTiming(browser, label, siteRoot, _apiKey, storeId, opts) {
  const requireBoardListen = !(opts && opts.requireBoardListen === false);
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const tOpen = Date.now();
  await board.goto(boardUrl(storeId));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  if (requireBoardListen) {
    await board
      .waitForFunction(
        () => {
          const s = window.receiverCloud?.getRealtimeStats?.();
          return Boolean(s && s.boardListen);
        },
        { timeout: 45000 },
      )
      .catch(() => undefined);
  }
  const boardReadyMs = Date.now() - tOpen;
  const stats = await board.evaluate(() => window.receiverCloud.getRealtimeStats());
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${storeId}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await board.waitForFunction(
    () => document.querySelector('.milksha-ready .milksha-num') || window.receiverCloud?.getRealtimeStats,
    { timeout: 90000 },
  );
  const tSend = Date.now();
  await ctrl.click('[data-testid="btn-send-numbers"]');
  let sendToDisplayMs = 0;
  try {
    await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 3000 });
    sendToDisplayMs = Date.now() - tSend;
  } catch {
    await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 45000 });
    sendToDisplayMs = Date.now() - tSend;
  }
  const pageOpenToFirstNumberMs = Date.now() - tOpen;
  const displayed = await board.locator('.milksha-ready .milksha-num').first().textContent();
  await ctx.close();
  return {
    label,
    storeId,
    boardReadyMs,
    pageOpenToFirstNumberMs,
    sendToDisplayMs,
    sendToDisplayWithin3s: sendToDisplayMs <= 3000,
    commandMode: stats.commandMode,
    boardListen: stats.boardListen,
    mode: stats.boardListen ? 'realtime' : 'poll',
    sampleReadyNo: (displayed || '').trim(),
  };
}

async function runOfflineConsistency(browser, siteRoot) {
  const ctx = await browser.newContext();
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(boardUrl(STORE_A));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE_A}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await ctrl.click('[data-testid="btn-send-numbers"]');
  await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 5000 });
  const before = String((await board.locator('.milksha-ready .milksha-num').first().textContent()) || '').trim();
  await ctx.setOffline(true);
  await board.waitForTimeout(30000);
  const duringOffline = String((await board.locator('.milksha-ready .milksha-num').first().textContent()) || '').trim();
  await ctx.setOffline(false);
  await board.waitForTimeout(8000);
  await expectReadyStable(board, before);
  const after = String((await board.locator('.milksha-ready .milksha-num').first().textContent()) || '').trim();
  await ctx.close();
  return {
    method: 'playwright_context_offline_30s',
    beforeReady: before,
    duringOfflineReady: duringOffline,
    afterRestoreReady: after,
    ok: before === after && after.length > 0,
  };
}

async function expectReadyStable(board, expectedNo) {
  await board.waitForFunction(
    (no) => {
      const el = document.querySelector('.milksha-ready .milksha-num');
      return el && el.textContent && el.textContent.trim() === no;
    },
    expectedNo,
    { timeout: 20000 },
  );
}

async function runStoreIsolation(browser, siteRoot) {
  const ctxA = await browser.newContext();
  await installLiveCloudRoutes(ctxA, siteRoot);
  const boardA = await ctxA.newPage();
  const ctrlA = await ctxA.newPage();
  await boardA.goto(boardUrl(STORE_A));
  await boardA.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  await ctrlA.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE_A}`);
  await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await ctrlA.click('[data-testid="btn-send-numbers"]');
  await boardA.waitForSelector('.milksha-ready .milksha-num', { timeout: 5000 });
  const markerNo = String((await boardA.locator('.milksha-ready .milksha-num').first().textContent()) || '').trim();
  await ctxA.close();

  const ctxB = await browser.newContext();
  await installLiveCloudRoutes(ctxB, siteRoot);
  const pageB = await ctxB.newPage();
  await pageB.goto(boardUrl('zz-qa-store-b'));
  await pageB.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  await pageB.waitForTimeout(5000);
  const numsOnB = await pageB.locator('.milksha-ready .milksha-num').allTextContents();
  const stats = await pageB.evaluate(() => window.receiverCloud.getRealtimeStats());
  await ctxB.close();
  return {
    markerFromStoreA: markerNo,
    storeBReadyNumbers: numsOnB.map((n) => n.trim()).filter(Boolean),
    storeAVisibleOnStoreB: numsOnB.some((n) => n.trim() === markerNo),
    storeBListen: stats.boardListen,
    isolated: !numsOnB.some((n) => n.trim() === markerNo),
  };
}

async function runLegacyProbe(browser, siteRoot) {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 9; STB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
  });
  await installLiveCloudRoutes(ctx, siteRoot);
  const page = await ctx.newPage();
  const evidence = { sdkLoads: [], stats: null, pollFallback: false };
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('gstatic.com/firebasejs/')) {
      evidence.sdkLoads.push(u.split('/').slice(-2).join('/'));
    }
  });
  await page.goto(boardUrl(STORE_A));
  await page.waitForFunction(() => window.receiverCloud, { timeout: 90000 });
  evidence.stats = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
  await page.route('**/firebase-firestore-compat.js**', (route) => route.abort());
  await page.reload();
  await page.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 90000 });
  const afterBlock = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
  evidence.pollFallback = afterBlock.boardListen === false;
  evidence.afterFirestoreBlock = afterBlock;
  await ctx.close();
  return evidence;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const tailOnly = process.env.MILKSHA_MATRIX_TAIL === '1';
  const existingPath = join(ART, 'live-matrix.json');
  const apiKey = await loadApiKey();
  const report = {
    at: new Date().toISOString(),
    writeStore: STORE_A,
    stores: STORES,
    apiKeySource: apiKey ? 'public-pages-config' : 'missing',
    apiKeyPresent: Boolean(apiKey),
    branchSiteRoot: SITE_ROOT,
    runs: [],
    storeTiming: {},
    mainComparison: [],
    offline30s: null,
    isolation: null,
    legacyChrome78: null,
    readsPerHour: {
      mainPollBaseline: 'board REST ~0.5–2s interval ≈ 1800–7200 reads/h per device (main)',
      pr32RealtimeBoardListen:
        'today_board onSnapshot: 1 initial + 1 per board write; device poll 5s if commandMode=poll ≈ +720/h',
      pr32RealtimeControlPending:
        'commandMode=control: pending onSnapshot; heartbeats do not re-read board',
      pr18DeployedNote:
        'After milksha-cloud #18: control/pending listener replaces 5s device poll → ~0 steady device REST',
    },
  };
  if (tailOnly && existsSync(existingPath)) {
    try {
      const prev = JSON.parse(readFileSync(existingPath, 'utf8'));
      report.runs = prev.runs || [];
      report.storeTiming = prev.storeTiming || {};
      report.offline30s = prev.offline30s || null;
      report.isolation = prev.isolation || null;
      report.legacyChrome78 = prev.legacyChrome78 || null;
    } catch {
      /* ignore */
    }
  }
  if (!apiKey) {
    report.error = 'Could not load Firebase Web API key from public Pages config';
    writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  try {
  const mainRoot = materializeMainSiteRoot();
  const browsers = [
    { name: 'chromium', launcher: chromium },
    { name: 'firefox', launcher: firefox },
  ];

  for (const { name, launcher } of browsers) {
    const browser = await launcher.launch({ headless: true });
    try {
      if (!tailOnly || name === 'firefox') {
        for (let i = 0; i < 3; i += 1) {
          report.runs.push(
            await runTiming(browser, `${name}-branch-${i + 1}`, SITE_ROOT, apiKey, STORE_A),
          );
        }
        for (const storeId of STORES.slice(1)) {
          const key = `${storeId}-${name}`;
          report.storeTiming[key] = await runStoreProbe(
            browser,
            `${name}-${storeId}-probe`,
            SITE_ROOT,
            storeId,
          );
        }
      }
      if (name === 'chromium') {
        if (!tailOnly) {
          report.offline30s = await runOfflineConsistency(browser, SITE_ROOT);
          report.isolation = await runStoreIsolation(browser, SITE_ROOT);
          report.legacyChrome78 = await runLegacyProbe(browser, SITE_ROOT);
        }
        for (let i = 0; i < 2; i += 1) {
          report.mainComparison.push(
            await runMainBaselineTiming(browser, `main-chromium-${i + 1}`, mainRoot, STORE_A),
          );
        }
      }
    } finally {
      await browser.close();
    }
  }
  } catch (err) {
    report.fatalError = err && err.message ? String(err.message) : String(err);
  }

  report.completed = true;
  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, runCount: report.runs.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
