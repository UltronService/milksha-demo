#!/usr/bin/env node
/**
 * Triple-version boot matrix: branch / 5765abf (#32) / 7fb4f9c (pre-#32).
 */
import { chromium, firefox } from 'playwright';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
} from './lib/github-pages-site-route.mjs';
import { CONTROLLER_BOARD_ONLINE_WAIT_JS } from './lib/controller-board-online.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'boot-fast-self-qa');
const BRANCH_ROOT = resolveSiteRoot(ROOT);
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const ROUNDS = Number(process.env.MILKSHA_BOOT_ROUNDS || 5);
const VERSIONS = [
  { key: 'branch', label: 'branch', root: BRANCH_ROOT, sha: () => gitSha('HEAD') },
  { key: 'v5765abf', label: '5765abf', sha: () => '5765abf', archive: '5765abf' },
  { key: 'v7fb4f9c', label: '7fb4f9c', sha: () => '7fb4f9c', archive: '7fb4f9c' },
];

let cachedPublicFirebaseJs = '';

function gitSha(ref) {
  try {
    return execSync(`git rev-parse ${ref}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function materializeTreeAt(sha) {
  const dir = join(tmpdir(), 'milksha-boot-fast-' + sha);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync(`git archive ${sha} | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

function siteRootFor(version) {
  if (version.root) {
    return version.root;
  }
  return materializeTreeAt(version.archive);
}

function boardUrl(storeId) {
  const u = new URL(`${GITHUB_PAGES_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', storeId);
  u.searchParams.set('device', DEVICE);
  return u.toString();
}

async function ensurePublicFirebaseJs() {
  if (cachedPublicFirebaseJs) {
    return cachedPublicFirebaseJs;
  }
  const res = await fetch(`${GITHUB_PAGES_BASE}/config/firebase.js`, { cache: 'no-store' });
  cachedPublicFirebaseJs = await res.text();
  return cachedPublicFirebaseJs;
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

function msSince(t0, ts) {
  return ts != null ? ts - t0 : null;
}

async function waitTimelineKind(board, kind, since, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await board.evaluate(
      ({ k, s }) => {
        const tl = window.__rcvMatrixTimeline || [];
        const row = tl.find((e) => e.kind === k && e.ts >= s);
        return row ? row.ts : 0;
      },
      { k: kind, s: since },
    );
    if (hit > 0) {
      return hit;
    }
    await board.waitForTimeout(200);
  }
  return null;
}

async function runBootRound(browser, versionKey, siteRoot, browserName, roundIndex) {
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(120000);
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  let devLoginDone = null;
  let hbSend = null;
  let hbOk = null;
  board.on('response', async (res) => {
    const u = res.url();
    if (u.includes('devLogin') && res.request().method() === 'POST' && res.ok()) {
      devLoginDone = Date.now();
    }
    if (u.includes('boxHeartbeat') && res.request().method() === 'POST') {
      if (!hbSend) {
        hbSend = Date.now();
      }
      if (res.ok()) {
        hbOk = Date.now();
      }
    }
  });

  const t0 = Date.now();
  const ticketNo = String(9000 + roundIndex * 3 + browserName.length);
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(boardUrl(STORE));
  const receiverReadyAt = await board
    .waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 })
    .then(() => Date.now())
    .catch(() => null);

  const authTimelineAt = await waitTimelineKind(board, 'devlogin_complete', t0, 60000);
  const authCachedAt = await waitTimelineKind(board, 'auth_cached_token', t0, 2000);
  const devLoginCompleteAt = authTimelineAt || authCachedAt || devLoginDone;

  const hbSendTimeline = await waitTimelineKind(board, 'heartbeat_send', t0, 60000);
  const hbOkTimeline = await waitTimelineKind(board, 'heartbeat_ok', t0, 60000);
  const firstHeartbeatSendAt = hbSendTimeline || hbSend;
  const firstHeartbeatOkAt = hbOkTimeline || hbOk;

  const boardFirstPaintMs = await board
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
    .then(() => Date.now() - t0)
    .catch(() => null);

  const realtimeAttachedMs = await board
    .waitForFunction(() => window.receiverCloud?.getRealtimeStats?.()?.boardListen, {
      timeout: 45000,
    })
    .then(() => Date.now() - t0)
    .catch(() => null);

  await ctrlNav;
  const controllerConnectedMs = await ctrl
    .waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 })
    .then(() => Date.now() - t0)
    .catch(() => null);

  const controllerBoardOnlineMs = await ctrl
    .waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, { timeout: 90000 })
    .then(() => Date.now() - t0)
    .catch(() => null);

  const timeline = await board.evaluate(() => window.__rcvMatrixTimeline || []);
  const stats = await board.evaluate(() => window.receiverCloud.getRealtimeStats());
  const tBoardListen = timeline.find((e) => e.kind === 'board_listen_attached');
  const tControlListen = timeline.find((e) => e.kind === 'control_listen_attached');

  const buttonPressedAt = Date.now();
  await ctrl.evaluate(() => {
    const section = document.getElementById('sec-pos');
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
  });
  await ctrl.fill('#fld-no', ticketNo);
  await ctrl.selectOption('#fld-status', 'ready');
  await ctrl.click('#btn-add-ticket');
  await board.waitForSelector('.milksha-ready .milksha-num', { hasText: ticketNo, timeout: 45000 });
  const sendToDisplayMs = Date.now() - buttonPressedAt;

  const snapEvents = timeline.filter((e) => e.kind === 'board_snapshot');
  const lastSnap = snapEvents[snapEvents.length - 1] || null;

  await ctx.close();

  return {
    label: `${versionKey}-${browserName}-${roundIndex}`,
    versionKey,
    browserName,
    roundIndex,
    boardFirstPaintMs,
    realtimeAttachedMs,
    controllerConnectedMs,
    controllerBoardOnlineMs,
    sendToDisplayMs,
    phaseMs: {
      boardGotoToReceiverReady: msSince(t0, receiverReadyAt),
      boardGotoToDevLoginComplete: msSince(t0, devLoginCompleteAt),
      boardGotoToFirstHeartbeatSend: msSince(t0, firstHeartbeatSendAt),
      boardGotoToFirstHeartbeatOk: msSince(t0, firstHeartbeatOkAt),
      boardGotoToControllerConnected: controllerConnectedMs,
      boardGotoToControllerBoardOnline: controllerBoardOnlineMs,
      heartbeatOkToControllerBoardOnline:
        firstHeartbeatOkAt && controllerBoardOnlineMs != null
          ? t0 + controllerBoardOnlineMs - firstHeartbeatOkAt
          : null,
    },
    boardListenAttachedMs: tBoardListen ? tBoardListen.ts - t0 : null,
    controlListenAttachedMs: tControlListen ? tControlListen.ts - t0 : null,
    controlAfterBoardMs: tBoardListen && tControlListen ? tControlListen.ts - tBoardListen.ts : null,
    boardListen: stats.boardListen,
    commandMode: stats.commandMode,
    sendTimeline: {
      lastBoardSnapshot: lastSnap,
      realtimeAttachedMs,
      commandModeAtSend: stats.commandMode,
    },
  };
}

function median(nums) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) {
    return null;
  }
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) {
    return Math.round((arr[mid - 1] + arr[mid]) / 2);
  }
  return arr[mid];
}

function max(nums) {
  const arr = nums.filter((n) => Number.isFinite(n));
  return arr.length ? Math.max(...arr) : null;
}

function summarizeRuns(runs) {
  const pick = (key) => runs.map((r) => r[key]);
  return {
    boardFirstPaintMs: { median: median(pick('boardFirstPaintMs')), max: max(pick('boardFirstPaintMs')) },
    controllerBoardOnlineMs: {
      median: median(pick('controllerBoardOnlineMs')),
      max: max(pick('controllerBoardOnlineMs')),
    },
    sendToDisplayMs: { median: median(pick('sendToDisplayMs')), max: max(pick('sendToDisplayMs')) },
    phaseMedian: {
      boardGotoToDevLoginComplete: median(runs.map((r) => r.phaseMs.boardGotoToDevLoginComplete)),
      boardGotoToFirstHeartbeatOk: median(runs.map((r) => r.phaseMs.boardGotoToFirstHeartbeatOk)),
      heartbeatOkToControllerBoardOnline: median(
        runs.map((r) => r.phaseMs.heartbeatOkToControllerBoardOnline),
      ),
    },
  };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    headSha: gitSha('HEAD'),
    rounds: ROUNDS,
    writeStore: STORE,
    versions: {},
    runs: [],
  };

  for (const version of VERSIONS) {
    report.versions[version.key] = { label: version.label, sha: version.sha() };
    report.versions[version.key].chromium = [];
    report.versions[version.key].firefox = [];
  }

  const siteRoots = {};
  for (const version of VERSIONS) {
    siteRoots[version.key] = siteRootFor(version);
  }

  for (const { name, launcher } of [
    { name: 'chromium', launcher: chromium },
    { name: 'firefox', launcher: firefox },
  ]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const version of VERSIONS) {
        for (let i = 1; i <= ROUNDS; i += 1) {
          const row = await runBootRound(browser, version.key, siteRoots[version.key], name, i);
          report.runs.push(row);
          report.versions[version.key][name].push(row);
        }
      }
    } finally {
      await browser.close();
    }
  }

  report.summary = {};
  for (const version of VERSIONS) {
    report.summary[version.key] = {
      chromium: summarizeRuns(report.versions[version.key].chromium),
      firefox: summarizeRuns(report.versions[version.key].firefox),
    };
  }

  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, headSha: report.headSha, art: ART }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
