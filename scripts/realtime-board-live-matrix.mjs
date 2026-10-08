#!/usr/bin/env node
/**
 * Live cloud matrix: branch assets via github.io route, zz-qa-store-a writes.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
} from './lib/github-pages-site-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'realtime-board-self-qa');
const SITE_ROOT = resolveSiteRoot(ROOT);
const STORE = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';
const DENY = 'zz-deny-test';
const DEVICE = 'stb-01';

function loadApiKey() {
  const fromEnv = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const cfgPath = '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_276d.txt';
  try {
    const text = readFileSync(cfgPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
      if (m) {
        return m[1].trim();
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

function boardUrl(storeId) {
  const u = new URL(`${GITHUB_PAGES_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', storeId);
  u.searchParams.set('device', DEVICE);
  return u.toString();
}

async function runTiming(browser, label, branchRoot) {
  const ctx = await browser.newContext();
  await installGithubPagesSiteRoute(ctx, branchRoot);
  await ctx.addInitScript((key) => {
    if (window.MILKSHA_FIREBASE_CONFIG && key) {
      window.MILKSHA_FIREBASE_CONFIG.apiKey = key;
    }
    localStorage.setItem(
      'milksha:cloud-settings',
      JSON.stringify({
        projectId: 'milksha-qms-dev',
        apiKey: key,
        region: 'asia-east1',
      }),
    );
  }, loadApiKey());
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const t0 = Date.now();
  await board.goto(boardUrl(STORE));
  await board.waitForFunction(() => window.receiverCloud?.getRealtimeStats, { timeout: 60000 });
  const boardReadyMs = Date.now() - t0;
  const stats = await board.evaluate(() => window.receiverCloud.getRealtimeStats());
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  const sendAt = Date.now();
  await ctrl.click('[data-testid="btn-send-numbers"]');
  await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 3000 });
  const sendToDisplayMs = Date.now() - sendAt;
  return {
    label,
    boardReadyMs,
    pageOpenToFirstNumberMs: sendToDisplayMs,
    sendToDisplayMs,
    commandMode: stats.commandMode,
    boardListen: stats.boardListen,
    mode: stats.boardListen ? 'realtime' : 'poll',
  };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const apiKey = loadApiKey();
  const report = {
    at: new Date().toISOString(),
    store: STORE,
    apiKeyPresent: Boolean(apiKey),
    branchSiteRoot: SITE_ROOT,
    runs: [],
  };
  if (!apiKey) {
    report.error = 'MILKSHA_FIREBASE_API_KEY missing';
    writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < 3; i += 1) {
      report.runs.push(await runTiming(browser, `branch-chromium-${i + 1}`, SITE_ROOT));
    }
    const legacyCtx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Linux; Android 9; STB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
    });
    await installGithubPagesSiteRoute(legacyCtx, SITE_ROOT);
    const legacyPage = await legacyCtx.newPage();
    await legacyPage.goto(boardUrl(STORE));
    await legacyPage.waitForFunction(() => window.receiverCloud, { timeout: 60000 });
    const legacyStats = await legacyPage.evaluate(() => window.receiverCloud.getRealtimeStats());
    report.legacyUa = { boardListen: legacyStats.boardListen, commandMode: legacyStats.commandMode };
    await legacyCtx.close();
    const denyCtx = await browser.newContext();
    await installGithubPagesSiteRoute(denyCtx, SITE_ROOT);
    const denyPage = await denyCtx.newPage();
    await denyPage.goto(boardUrl(DENY));
    await denyPage.waitForTimeout(8000);
    const paused = await denyPage.locator('#milksha-cloud-paused').textContent().catch(() => '');
    report.isolation = { denyStore: DENY, pausedText: paused.trim() };
    await denyCtx.close();
    report.readsPerHour = {
      pollCommandMode: 'board onSnapshot + pollDevice 5s ≈ 720 device REST/h + board snapshots',
      controlMode: 'board snapshots + pending doc per command only',
      mainBaseline: 'fast poll 0.5s/2s ≈ 1800–3600 board REST/h',
    };
  } finally {
    await browser.close();
  }
  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
