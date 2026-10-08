#!/usr/bin/env node
/**
 * Post-merge public GitHub Pages QA (PR #27+). Writes zz-qa-* only; c030020 read-only checks.
 * Fixes Playwright waitForFunction(arg vs options) and board-empty sync after clear_now.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
  siteRouteActive,
} from './lib/github-pages-site-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ROOT = resolveSiteRoot(ROOT);
const USE_PAGES_SITE_ROUTE = siteRouteActive();
const PATCH_RUNTIME = !USE_PAGES_SITE_ROUTE && process.env.MILKSHA_QA_PATCH_RUNTIME === '1';
const RUNTIME_JS_PATH = join(SITE_ROOT, 'js/receiver/cloud-runtime.js');
const ART = join(ROOT, 'artifacts', 'pr27live');
const SHOTS = join(ART, 'screenshots');
const LOG = join(ART, 'run.log');
const RESULTS = join(ART, 'results.json');

const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || GITHUB_PAGES_BASE;
const BOARD_HOME = `${PUBLIC_BASE}/`;
const CTRL = `${PUBLIC_BASE}/controller/`;

function boardUrlForStore(storeId) {
  const u = new URL(`${PUBLIC_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  if (storeId) {
    u.searchParams.set('store', storeId);
  }
  return u.toString();
}

function ctrlUrlForStore(storeId) {
  const u = new URL(CTRL);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', storeId);
  return u.toString();
}

function injectFirebaseConfigIntoSiteRoot(siteRoot, apiKey) {
  if (!apiKey || !siteRoot) {
    return;
  }
  const target = join(siteRoot, 'config', 'firebase.js');
  spawnSync('node', [join(ROOT, 'scripts', 'inject-firebase-config.mjs'), target], {
    env: {
      ...process.env,
      MILKSHA_FIREBASE_API_KEY: apiKey,
      MILKSHA_DEV_POS_SIGN_SECRET:
        process.env.MILKSHA_DEV_POS_SIGN_SECRET || 'fake-milksha-pos-sign-key-for-tests',
    },
    stdio: 'pipe',
  });
}

async function prepareContextRouting(ctx, apiKey) {
  if (USE_PAGES_SITE_ROUTE) {
    injectFirebaseConfigIntoSiteRoot(SITE_ROOT, apiKey);
    await installGithubPagesSiteRoute(ctx, SITE_ROOT);
    return;
  }
  if (PUBLIC_BASE.includes('127.0.0.1')) {
    await installBundledCloudInit(ctx, apiKey);
  }
  await installPagesAssetRouting(ctx);
}
const STORE_MAIN = 'c030020';
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';
const FN_HOST = 'https://asia-east1-milksha-qms-dev.cloudfunctions.net';
/** Backend 9940daf: permanent deny list; never auto-registers. */
const STORE_DENY = 'zz-deny-test';
const D_LIVE_NOTE =
  'Live devLogin 403 store_not_allowed on public board ?mode=cloud&store=zz-deny-test (backend 9940daf)';
const D_ROUTE_SUPPLEMENT_NOTE =
  'Supplement: route-simulated 403 on c030020 board URL (no extra store opens)';

mkdirSync(SHOTS, { recursive: true });

async function installSimulated403DevLogin(page, storeId, errorCode = 'store_not_allowed') {
  await page.route('**/devLogin', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = route.request().postData() || '';
    if (storeId && !body.includes(storeId)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: errorCode, message: `${errorCode} simulated` }),
    });
  });
}

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

async function installBundledCloudInit(ctx, apiKey) {
  await ctx.addInitScript((key) => {
    const cfg = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
      projectId: 'milksha-qms-dev',
      apiKey: key,
      region: 'asia-east1',
      defaultCloudMode: true,
      useEmulator: false,
      gateway: '',
      functionsBaseUrl: 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/',
    });
    window.MILKSHA_FIREBASE_CONFIG = cfg;
    try {
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: key,
          region: 'asia-east1',
          useEmulator: false,
          gateway: '',
          emulatorPrefix: '',
        }),
      );
      const pos =
        (window.MILKSHA_FIREBASE_CONFIG && window.MILKSHA_FIREBASE_CONFIG.posSignSecret) ||
        'fake-milksha-pos-sign-key-for-tests';
      localStorage.setItem('milksha:controller-pos-sign-key', pos);
    } catch {
      /* ignore */
    }
  }, apiKey);
}

function loadApiKey() {
  const fromEnv = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const cfgPath =
    process.env.MILKSHA_WEB_CONFIG ||
    '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_d1a4.txt';
  const text = readFileSync(cfgPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
    if (m) {
      return m[1].trim();
    }
  }
  throw new Error('MILKSHA_FIREBASE_API_KEY not found');
}

function oldSettingsSeedSource() {
  return `(() => {
    localStorage.setItem('milksha:deviceId', 'stb-old-99');
    localStorage.setItem(
      'milksha:local:poc-target',
      JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', pinnedAt: Date.now() }),
    );
    localStorage.setItem(
      'milksha:local:device:s120030:stb-old-99',
      JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
    );
    localStorage.setItem(
      'milksha:cloud-settings',
      JSON.stringify({
        projectId: 'milksha-qms-dev',
        apiKey: 'legacy-key',
        accessCode: 'legacy-code',
        region: 'asia-east1',
      }),
    );
    localStorage.setItem(
      'milksha:receiver-cache:s120030',
      JSON.stringify({
        seq: 99,
        numberContent: [{ source_type: 'From_Store_OK', number: '9999' }],
        businessDate: '2099-01-01',
        boardUpdatedAt: new Date().toISOString(),
      }),
    );
  })();`;
}

async function snap(page, filePath) {
  try {
    await page.screenshot({ path: filePath, timeout: 8000, animations: 'disabled' });
  } catch (e) {
    log(`screenshot skip ${filePath}: ${e.message || e}`);
  }
}

async function expandControllerZone(page, zoneId) {
  await page.evaluate((id) => {
    const section = document.getElementById(id);
    if (!section) return;
    const btn = section.querySelector('.zone-toggle');
    const body = section.querySelector('.zone-body');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (body) body.hidden = false;
  }, zoneId);
}

async function waitBoardCloudReady(page, expectedStore = STORE_MAIN, timeoutMs = 120000) {
  await page.waitForFunction(
    () => Boolean(window.receiverCloud) && window.MILKSHA_FIREBASE_CONFIG?.projectId === 'milksha-qms-dev',
    undefined,
    { timeout: timeoutMs },
  );
  await page.waitForFunction(
    (store) => {
      const off = document.getElementById('milksha-cloud-offline');
      const paused = document.getElementById('milksha-cloud-paused');
      const authed = Object.keys(localStorage).some(
        (k) => k.startsWith('milksha:auth:') && k.includes(store),
      );
      return authed && off && off.hidden && paused && paused.hidden;
    },
    expectedStore,
    { timeout: timeoutMs },
  );
}

async function waitBoardEmpty(board, timeoutMs = 90000) {
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    undefined,
    { timeout: timeoutMs },
  );
}

/** DOM has ≥min ready numbers; no post-wait (used for sendToDisplayMs SLA). */
async function waitBoardMinReadyMeasure(board, min = 1, timeoutMs = 90000) {
  await board.waitForFunction(
    (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
    min,
    { timeout: timeoutMs },
  );
  const localSeq = await board.evaluate(() =>
    window.receiverCloud?.getLocalSeq ? window.receiverCloud.getLocalSeq() : null,
  );
  return { count: await board.locator('.milksha-ready .milksha-num').count(), localSeq };
}

async function waitBoardMinReady(board, min = 1, timeoutMs = 90000) {
  const first = await waitBoardMinReadyMeasure(board, min, timeoutMs);
  await board.waitForTimeout(400);
  const count = await board.locator('.milksha-ready .milksha-num').count();
  if (count < min) {
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      min,
      { timeout: 30000 },
    );
  }
  const localSeq = await board.evaluate(() =>
    window.receiverCloud?.getLocalSeq ? window.receiverCloud.getLocalSeq() : null,
  );
  return { count: await board.locator('.milksha-ready .milksha-num').count(), localSeq };
}

async function clearBoardViaController(controller, board, label) {
  await expandControllerZone(controller, 'sec-special');
  await controller.click('[data-testid="btn-clear-now"]');
  await waitBoardEmpty(board);
  log(`${label}: clear_now synced`);
}

async function readSendBlockReason(ctrl) {
  return ctrl.evaluate(() => {
    const btn = document.getElementById('btn-send-numbers');
    const reason = document.querySelector('[data-testid="btn-send-numbers-block-reason"]');
    return {
      disabled: Boolean(btn?.disabled),
      reason: (reason?.textContent || '').trim(),
    };
  });
}

async function waitSendEnabled(ctrl, timeoutMs = 120000) {
  await ctrl.waitForFunction(
    () => {
      const btn = document.getElementById('btn-send-numbers');
      return btn && !btn.disabled;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

function record(results, contextName, checkId, pass, detail) {
  results.lines.push({ context: contextName, check: checkId, pass, ...detail });
}

async function runIsolationRounds(tabA, tabB, ctrlA, ctrlB, contextName) {
  const rounds = [];
  for (let r = 1; r <= 3; r += 1) {
    await clearBoardViaController(ctrlA, tabA, `${contextName}-c${r}-preclear-a`);
    await clearBoardViaController(ctrlB, tabB, `${contextName}-c${r}-preclear-b`);
    await tabA.waitForTimeout(300);
    await tabB.waitForTimeout(300);
    const bBeforeA = await tabB.locator('.milksha-ready .milksha-num').count();
    const tA = Date.now();
    await ctrlA.click('[data-testid="btn-send-numbers"]');
    await waitBoardMinReady(tabA, 1);
    const sendAMs = Date.now() - tA;
    const bAfterA = await tabB.locator('.milksha-ready .milksha-num').count();
    const tB = Date.now();
    await ctrlB.click('[data-testid="btn-send-numbers"]');
    await waitBoardMinReady(tabB, 1);
    const sendBMs = Date.now() - tB;
    await waitBoardMinReady(tabA, 1, 45000);
    const aCount = await tabA.locator('.milksha-ready .milksha-num').count();
    const bCount = await tabB.locator('.milksha-ready .milksha-num').count();
    const pass = bAfterA === bBeforeA && aCount >= 1 && bCount >= 1;
    rounds.push({ round: r, bBeforeA, bAfterA, aCount, bCount, sendAMs, sendBMs, pass });
    if (!pass) {
      return { pass: false, rounds };
    }
  }
  await clearBoardViaController(ctrlA, tabA, `${contextName}-c-final-a`);
  await clearBoardViaController(ctrlB, tabB, `${contextName}-c-final-b`);
  return { pass: true, rounds };
}

async function installPagesAssetRouting(ctx) {
  if (USE_PAGES_SITE_ROUTE) {
    await installGithubPagesSiteRoute(ctx, SITE_ROOT);
    return;
  }
  if (!PATCH_RUNTIME) {
    return;
  }
  const body = readFileSync(RUNTIME_JS_PATH, 'utf8');
  await ctx.route(/cloud-runtime\.js(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body,
    });
  });
}

function runtimeSha16() {
  try {
    const body = readFileSync(RUNTIME_JS_PATH, 'utf8');
    return createHash('sha256').update(body).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

async function runContext(browser, contextName, seedOld, apiKey) {
  const results = { context: contextName, lines: [] };
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await prepareContextRouting(ctx, apiKey);
  if (seedOld) {
    await ctx.addInitScript(oldSettingsSeedSource());
  }

  try {
    const boardA = await ctx.newPage();
    boardA.setDefaultTimeout(120000);
    await boardA.goto(boardUrlForStore(STORE_MAIN), { waitUntil: 'domcontentloaded' });
    try {
      await waitBoardCloudReady(boardA);
      const boardMeta = await boardA.evaluate(() => {
        const runtime = window.QMS?.runtime;
        const s = runtime?.getSnapshot?.() || { ready: [], preparing: [] };
        const nums = (s.ready || []).map((x) => String(x.number || x.no || ''));
        const authKeys = Object.keys(localStorage).filter((k) => k.startsWith('milksha:auth:'));
        return {
          projectId: window.MILKSHA_FIREBASE_CONFIG?.projectId,
          hasS120Auth: authKeys.some((k) => k.includes('s120030')),
          storeFromAuth: authKeys.some((k) => k.includes('c030020')) ? 'c030020' : '',
          shows9999: nums.includes('9999'),
        };
      });
      const pass =
        boardMeta.projectId === 'milksha-qms-dev' &&
        !boardMeta.shows9999 &&
        !boardMeta.hasS120Auth &&
        boardMeta.storeFromAuth === 'c030020';
      await snap(boardA, join(SHOTS, `${contextName}-a-home.png`));
      record(results, contextName, 'a', pass, boardMeta);
    } catch (e) {
      await snap(boardA, join(SHOTS, `${contextName}-a-fail.png`));
      record(results, contextName, 'a', false, { error: e.message || String(e) });
    }
    await boardA.close().catch(() => {});

    const ctrlMain = await ctx.newPage();
    const boardB = await ctx.newPage();
    ctrlMain.setDefaultTimeout(120000);
    boardB.setDefaultTimeout(120000);
    let sendToDisplayMs = null;
    let pageOpenToFirstNumberMs = null;
    try {
      await ctrlMain.goto(ctrlUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await ctrlMain.waitForFunction(
        (id) => document.getElementById('fld-store')?.value === id,
        STORE_A,
        { timeout: 30000 },
      );
      const pre = await readSendBlockReason(ctrlMain);
      const preReasonOk = /連線中…|等待看板連線…/.test(pre.reason);
      const preDisabledOk = pre.disabled && preReasonOk;
      await snap(ctrlMain, join(SHOTS, `${contextName}-b-send-disabled.png`));
      const boardNavStart = Date.now();
      await boardB.goto(boardUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await waitBoardCloudReady(boardB, STORE_A);
      await waitSendEnabled(ctrlMain);
      const pressAt = Date.now();
      await ctrlMain.click('[data-testid="btn-send-numbers"]');
      await waitBoardMinReadyMeasure(boardB, 1, 8000);
      const displayAt = Date.now();
      sendToDisplayMs = displayAt - pressAt;
      pageOpenToFirstNumberMs = displayAt - boardNavStart;
      await snap(boardB, join(SHOTS, `${contextName}-b-send.png`));
      await clearBoardViaController(ctrlMain, boardB, 'b');
      const pass = preDisabledOk && sendToDisplayMs <= 3000;
      record(results, contextName, 'b', pass, {
        store: STORE_A,
        preDisabled: pre.disabled,
        preBlockReason: pre.reason,
        sendToDisplayMs,
        pageOpenToFirstNumberMs,
        cleared: true,
      });
    } catch (e) {
      await snap(ctrlMain, join(SHOTS, `${contextName}-b-fail-ctrl.png`));
      await snap(boardB, join(SHOTS, `${contextName}-b-fail-board.png`));
      record(results, contextName, 'b', false, {
        sendToDisplayMs,
        pageOpenToFirstNumberMs,
        error: e.message || String(e),
      });
      try {
        await clearBoardViaController(ctrlMain, boardB, 'b-recovery');
      } catch {
        /* ignore */
      }
    }
    await boardB.close().catch(() => {});
    await ctrlMain.close().catch(() => {});

    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const ctrlA = await ctx.newPage();
    const ctrlB = await ctx.newPage();
    for (const p of [tabA, tabB, ctrlA, ctrlB]) {
      p.setDefaultTimeout(120000);
    }
    try {
      await tabA.goto(boardUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await tabB.goto(boardUrlForStore(STORE_B), { waitUntil: 'domcontentloaded' });
      await waitBoardCloudReady(tabA, STORE_A);
      await waitBoardCloudReady(tabB, STORE_B);
      await ctrlA.goto(ctrlUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await ctrlB.goto(ctrlUrlForStore(STORE_B), { waitUntil: 'domcontentloaded' });
      await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
      await ctrlB.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
      const iso = await runIsolationRounds(tabA, tabB, ctrlA, ctrlB, contextName);
      await snap(tabA, join(SHOTS, `${contextName}-c-tab-a.png`));
      await snap(tabB, join(SHOTS, `${contextName}-c-tab-b.png`));
      record(results, contextName, 'c', iso.pass, { rounds: iso.rounds });
    } catch (e) {
      record(results, contextName, 'c', false, { error: e.message || String(e) });
    }
    await tabA.close().catch(() => {});
    await tabB.close().catch(() => {});
    await ctrlA.close().catch(() => {});
    await ctrlB.close().catch(() => {});

    const dCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await prepareContextRouting(dCtx, apiKey);
    const dPage = await dCtx.newPage();
    dPage.setDefaultTimeout(120000);
    let devLoginCalls = 0;
    let routeSupplement = null;
    try {
      dPage.on('response', async (res) => {
        if (!res.url().includes('devLogin') || res.request().method() !== 'POST') {
          return;
        }
        const body = res.request().postData() || '';
        if (!body.includes(STORE_DENY)) {
          return;
        }
        devLoginCalls += 1;
      });
      await dPage.goto(`${BOARD_HOME}?mode=cloud&store=${STORE_DENY}`, {
        waitUntil: 'domcontentloaded',
      });
      await dPage.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 });
      await dPage.waitForFunction(
        () => {
          const paused = document.getElementById('milksha-cloud-paused');
          return paused && !paused.hidden;
        },
        undefined,
        { timeout: 90000 },
      );
      const pausedText = await dPage.locator('#milksha-cloud-paused').innerText();
      const callsAtPause = devLoginCalls;
      await dPage.waitForTimeout(60000);
      const callsIn60 = devLoginCalls - callsAtPause;
      const pass = pausedText.trim() === '連線暫停' && devLoginCalls >= 1 && callsIn60 === 0;
      await snap(dPage, join(SHOTS, `${contextName}-d-zz-deny-test.png`));

      const routeCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      await prepareContextRouting(routeCtx, apiKey);
      const routePage = await routeCtx.newPage();
      let routeDevLogin = 0;
      try {
        await installSimulated403DevLogin(routePage, STORE_MAIN, 'store_not_allowed');
        routePage.on('request', (req) => {
          if (req.url().includes('devLogin') && req.method() === 'POST') {
            routeDevLogin += 1;
          }
        });
        await routePage.goto(`${BOARD_HOME}?mode=cloud&store=${STORE_MAIN}`, {
          waitUntil: 'domcontentloaded',
        });
        await routePage.waitForFunction(
          () => {
            const paused = document.getElementById('milksha-cloud-paused');
            return paused && !paused.hidden;
          },
          undefined,
          { timeout: 60000 },
        );
        const routePaused = (await routePage.locator('#milksha-cloud-paused').innerText()).trim();
        routeSupplement = {
          pass: routePaused === '連線暫停' && routeDevLogin >= 1,
          d403Mode: 'route_simulated',
          boardStore: STORE_MAIN,
          pausedText: routePaused,
          devLoginTotal: routeDevLogin,
          note: D_ROUTE_SUPPLEMENT_NOTE,
        };
      } catch (routeErr) {
        routeSupplement = {
          pass: false,
          error: routeErr.message || String(routeErr),
          note: D_ROUTE_SUPPLEMENT_NOTE,
        };
      }
      await routeCtx.close().catch(() => {});

      record(results, contextName, 'd', pass, {
        pausedText: pausedText.trim(),
        devLoginTotal: devLoginCalls,
        devLoginDuring60s: callsIn60,
        d403Mode: 'live_cloud',
        boardStore: STORE_DENY,
        backendDeploy: '9940daf',
        note: D_LIVE_NOTE,
        routeSupplement,
      });
    } catch (e) {
      await snap(dPage, join(SHOTS, `${contextName}-d-fail.png`));
      record(results, contextName, 'd', false, {
        boardStore: STORE_DENY,
        devLoginTotal: devLoginCalls,
        error: e.message || String(e),
        routeSupplement,
      });
    }
    await dCtx.close().catch(() => {});

    const eBoard = await ctx.newPage();
    const eCtrl = await ctx.newPage();
    eBoard.setDefaultTimeout(120000);
    eCtrl.setDefaultTimeout(120000);
    try {
      await eBoard.goto(boardUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await waitBoardCloudReady(eBoard, STORE_A);
      await eCtrl.goto(ctrlUrlForStore(STORE_A), { waitUntil: 'domcontentloaded' });
      await eCtrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
      await ctx.setOffline(true);
      await eBoard.waitForFunction(
        () => {
          const el = document.getElementById('milksha-cloud-offline');
          return el && !el.hidden;
        },
        undefined,
        { timeout: 30000 },
      );
      const offlineText = await eBoard.locator('#milksha-cloud-offline').innerText();
      await ctx.setOffline(false);
      await eBoard.evaluate(() => {
        if (window.receiverCloud?.scheduleCloudResync) {
          window.receiverCloud.scheduleCloudResync('qa-online');
        }
      });
      await eBoard.waitForFunction(
        () => {
          const el = document.getElementById('milksha-cloud-offline');
          return el && el.hidden;
        },
        undefined,
        { timeout: 45000 },
      );
      const before = await eBoard.locator('.milksha-ready .milksha-num').count();
      await eCtrl.click('[data-testid="btn-send-numbers"]');
      await eBoard.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length > n,
        before,
        { timeout: 45000 },
      );
      await snap(eBoard, join(SHOTS, `${contextName}-e-offline-recover.png`));
      await clearBoardViaController(eCtrl, eBoard, 'e');
      record(results, contextName, 'e', offlineText.trim() === '離線', {
        offlineText: offlineText.trim(),
        recoveredSend: true,
      });
    } catch (e) {
      await snap(eBoard, join(SHOTS, `${contextName}-e-fail.png`));
      record(results, contextName, 'e', false, { error: e.message || String(e) });
      try {
        await clearBoardViaController(eCtrl, eBoard, 'e-recovery');
      } catch {
        /* ignore */
      }
    }
    await eBoard.close().catch(() => {});
    await eCtrl.close().catch(() => {});
  } finally {
    await ctx.close();
  }

  return results;
}

async function verifyC030020Empty(browser, apiKey) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await prepareContextRouting(ctx, apiKey);
  const page = await ctx.newPage();
  await page.goto(boardUrlForStore(STORE_MAIN), { waitUntil: 'domcontentloaded' });
  try {
    await waitBoardCloudReady(page);
    await waitBoardEmpty(page);
    const count = await page.locator('.milksha-ready .milksha-num').count();
    await snap(page, join(SHOTS, 'final-c030020-empty.png'));
    await ctx.close();
    return { empty: count === 0, readyCount: count };
  } catch (e) {
    await snap(page, join(SHOTS, 'final-c030020-not-empty.png'));
    await ctx.close();
    return { empty: false, error: e.message || String(e) };
  }
}

async function smokeCloudFromNode() {
  const res = await fetch(`${FN_HOST}/devLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: STORE_A, role: 'device', deviceId: 'stb-01' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`cloudfunctions blocked: devLogin ${res.status} ${body}`);
  }
}

async function main() {
  writeFileSync(LOG, '');
  const apiKey = loadApiKey();
  log('PR #27 public Pages QA');
  log(
    `base=${PUBLIC_BASE} pagesSiteRoute=${USE_PAGES_SITE_ROUTE} siteRoot=${SITE_ROOT} runtimeSha=${runtimeSha16()} legacySingleFilePatch=${PATCH_RUNTIME}`,
  );
  await smokeCloudFromNode();

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  const report = {
    at: new Date().toISOString(),
    publicBase: PUBLIC_BASE,
    mergeCommit: 'a82cb9b',
    pagesSiteRoute: USE_PAGES_SITE_ROUTE,
    siteRoot: USE_PAGES_SITE_ROUTE ? SITE_ROOT : null,
    runtimeSha16: runtimeSha16(),
    runtimePatch: PATCH_RUNTIME,
    script: 'scripts/public-pages-pr27-live-qa.mjs',
    contexts: [],
    c030020Final: null,
  };

  for (const [name, seed] of [
    ['fresh', false],
    ['old-settings', true],
  ]) {
    log(`context ${name}`);
    report.contexts.push(await runContext(browser, name, seed, apiKey));
    writeFileSync(RESULTS, JSON.stringify(report, null, 2));
  }

  report.c030020Final = await verifyC030020Empty(browser, apiKey);
  await browser.close();
  writeFileSync(RESULTS, JSON.stringify(report, null, 2));
  log(`wrote ${RESULTS}`);

  const failed = report.contexts.flatMap((c) => c.lines).filter((l) => !l.pass);
  if (!report.c030020Final.empty || failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  log(`FATAL ${e.message || e}`);
  process.exit(1);
});
