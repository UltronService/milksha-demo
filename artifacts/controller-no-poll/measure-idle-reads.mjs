/**
 * Count Firestore REST GETs (fake-cloud) for today_board + devices/{deviceId} while controller idle.
 *
 * Usage:
 *   node artifacts/controller-no-poll/measure-idle-reads.mjs --idle-sec=60
 *   MILKSHA_SITE_ROOT=artifacts/controller-no-poll/main-worktree node ...  # measure main controller bundle
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  PORT_SITE,
  PORT_CLOUD,
  restartCloud,
  startSite,
  resetCloudState,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  connectController,
} from '../../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const OUT_DIR = dirname(fileURLToPath(import.meta.url));

function gitHead(cwd) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: cwd || ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function siteRootPath() {
  const fromEnv = process.env.MILKSHA_SITE_ROOT;
  return fromEnv ? join(fromEnv) : ROOT;
}

function parseIdleSec() {
  const arg = process.argv.find((a) => a.startsWith('--idle-sec='));
  if (!arg) {
    return 60;
  }
  const n = Number(arg.split('=')[1]);
  return Number.isFinite(n) && n >= 10 ? n : 60;
}

async function readFakeCloudDocCounts() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/controllerDocGetCounts`);
  if (!res.ok) {
    throw new Error('controllerDocGetCounts unavailable (restart fake-cloud from this repo)');
  }
  return res.json();
}

function perHour(count, idleSec) {
  return Math.round((count * 3600) / idleSec);
}

function deltaCounts(after, before) {
  return {
    board: Math.max(0, after.board - before.board),
    device: Math.max(0, after.device - before.device),
    combined: Math.max(0, after.combined - before.combined),
  };
}

async function runMeasure(idleSec) {
  const site = siteRootPath();
  const savedSiteRoot = process.env.MILKSHA_SITE_ROOT;
  delete process.env.MILKSHA_SITE_ROOT;
  await restartCloud();
  await resetCloudState({ seedDevice: true });
  process.env.MILKSHA_SITE_ROOT = site;
  await startSite();
  if (savedSiteRoot !== undefined) {
    process.env.MILKSHA_SITE_ROOT = savedSiteRoot;
  }
  const browser = await chromium.launch();
  const ctx = await isolatedCloudContext(browser);
  const board = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await board.goto(
    `http://127.0.0.1:${PORT_SITE}/?mode=cloud&store=${encodeURIComponent(STORE)}`,
  );
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });

  const page = await ctx.newPage();
  await installBundledCloudRouteShim(page);

  const url = `http://127.0.0.1:${PORT_SITE}/controller/?mode=cloud&store=${encodeURIComponent(STORE)}`;
  await page.goto(url);
  await connectController(page, 'cloud');
  const connected = await page.evaluate(() => {
    const el = document.getElementById('online-state');
    return el && el.getAttribute('data-connected') === '1';
  });
  if (!connected) {
    throw new Error('controller not connected before idle window');
  }
  await page.waitForFunction(
    () => {
      const el = document.getElementById('online-state');
      return el && String(el.textContent || '').includes('在線');
    },
    { timeout: 45000 },
  );
  await board.close();
  await page.waitForTimeout(5000);
  const before = await readFakeCloudDocCounts();
  const t0 = Date.now();
  await page.waitForTimeout(idleSec * 1000);
  const elapsedMs = Date.now() - t0;
  const after = await readFakeCloudDocCounts();
  const firestoreRestGetCounts = deltaCounts(after, before);

  const telemetry = await page.evaluate(() => {
    return {
      realtimeConnected: window.__controllerTelemetry
        ? window.__controllerTelemetry.realtimeConnected
        : null,
      stats: window.__controller && window.__controller.getCloudRealtimeStats
        ? window.__controller.getCloudRealtimeStats()
        : null,
    };
  });

  await ctx.close();
  await browser.close();

  const sitePath = siteRootPath();
  const total = firestoreRestGetCounts.combined;
  return {
    repoGitHead: gitHead(ROOT),
    siteGitHead: gitHead(sitePath),
    siteRoot: sitePath,
    storeId: STORE,
    deviceId: DEVICE,
    idleSec,
    elapsedMs,
    measuredWindow: 'idle_after_connect',
    measurementSource: 'fake-cloud /test/controllerDocGetCounts (Firestore REST GET proxy)',
    firestoreRestGetCounts,
    combinedBoardDeviceGets: total,
    extrapolatedReadsPerHour: {
      board: perHour(firestoreRestGetCounts.board, idleSec),
      device: perHour(firestoreRestGetCounts.device, idleSec),
      combined: perHour(total, idleSec),
    },
    telemetry,
  };
}

const idleSec = parseIdleSec();
const result = await runMeasure(idleSec);
mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(
  OUT_DIR,
  `measure-idle-reads-site-${result.siteGitHead}-repo-${result.repoGitHead}.json`,
);
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.error(`wrote ${outPath}`);
