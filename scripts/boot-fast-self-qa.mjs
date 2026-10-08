#!/usr/bin/env node
/**
 * Boot-fast QA: branch vs main @5765abf (pre-fix realtime gate), public Pages route.
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
const BASELINE_SHA = '5765abf';
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

function gitSha(ref) {
  try {
    return execSync(`git rev-parse ${ref}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function materializeTreeAt(sha, dirName) {
  const dir = join(tmpdir(), 'milksha-boot-fast-' + dirName);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync(`git archive ${sha} | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
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

async function runBootRound(browser, label, siteRoot, ticketNo) {
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(120000);
  await installLiveCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const tOpen = Date.now();
  await board.goto(boardUrl(STORE));
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
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
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  const realtimeAttachedMs = await board
    .waitForFunction(() => window.receiverCloud?.getRealtimeStats?.()?.boardListen, {
      timeout: 45000,
    })
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  const controllerBoardOnlineMs = await ctrl
    .waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, { timeout: 90000 })
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  const stats = await board.evaluate(() => window.receiverCloud.getRealtimeStats());
  const timeline = await board.evaluate(() => window.__rcvMatrixTimeline || []);
  const tBoardListen = timeline.find((e) => e.kind === 'board_listen_attached');
  const tControlListen = timeline.find((e) => e.kind === 'control_listen_attached');
  const boardListenAttachedMs = tBoardListen ? tBoardListen.ts - tOpen : null;
  const controlListenAttachedMs = tControlListen ? tControlListen.ts - tOpen : null;
  const controlAfterBoardMs =
    tBoardListen && tControlListen ? tControlListen.ts - tBoardListen.ts : null;
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
  await ctx.close();
  return {
    label,
    boardFirstPaintMs,
    realtimeAttachedMs,
    controllerBoardOnlineMs,
    sendToDisplayMs,
    boardListen: stats.boardListen,
    commandMode: stats.commandMode,
    firebaseAuthSyncFailed: stats.firebaseAuthSyncFailed ?? null,
    boardListenAttachedMs,
    controlListenAttachedMs,
    controlAfterBoardMs,
  };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const baselineRoot = materializeTreeAt(BASELINE_SHA, '.baseline-5765abf');
  const report = {
    at: new Date().toISOString(),
    headSha: gitSha('HEAD'),
    baselineSha: BASELINE_SHA,
    writeStore: STORE,
    branch: { chromium: [], firefox: [] },
    baseline5765abf: { chromium: [], firefox: [] },
  };
  const browsers = [
    { name: 'chromium', launcher: chromium, index: 0 },
    { name: 'firefox', launcher: firefox, index: 1 },
  ];
  for (const { name, launcher, index } of browsers) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (let i = 0; i < 3; i += 1) {
        const ticketNo = String(8900 + i * 11 + index);
        report.branch[name].push(
          await runBootRound(browser, `branch-${name}-${i + 1}`, BRANCH_ROOT, ticketNo),
        );
        report.baseline5765abf[name].push(
          await runBootRound(
            browser,
            `baseline-${name}-${i + 1}`,
            baselineRoot,
            String(Number(ticketNo) + 1),
          ),
        );
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(join(ART, 'live-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, headSha: report.headSha, art: ART }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
