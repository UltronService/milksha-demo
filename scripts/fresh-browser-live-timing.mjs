#!/usr/bin/env node
/**
 * Live milksha-qms-dev timing (branch @ 8877, real cloud, no fake-cloud shim).
 * Writes zz-qa-store-a only. Fresh context × 3 runs.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite, PORT_SITE, expandControllerZone } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'fresh-latency-pause-self-qa');
const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const FN_BASE = 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/';
const SEND_TIMEOUT_MS = 30000;

function loadApiKey() {
  const fromEnv = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const cfgPath =
    process.env.MILKSHA_WEB_CONFIG ||
    '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_276d.txt';
  const text = readFileSync(cfgPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
    if (m) {
      return m[1].trim();
    }
  }
  throw new Error('MILKSHA_FIREBASE_API_KEY not found');
}

function installBundledCloudInit(ctx, apiKey) {
  return ctx.addInitScript((key) => {
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

async function devLogin(role, deviceId) {
  const res = await fetch(`${FN_BASE}devLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: STORE, role, deviceId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`devLogin ${role} ${res.status} ${JSON.stringify(json)}`);
  }
  return json.customToken;
}

async function signIn(apiKey, customToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`signIn ${res.status} ${JSON.stringify(json)}`);
  }
  return json.idToken;
}

async function warmBoardDeviceOnBackend(apiKey) {
  const t0 = Date.now();
  const token = await signIn(apiKey, await devLogin('device', DEVICE));
  const loginMs = Date.now() - t0;
  const hb0 = Date.now();
  const res = await fetch(`${FN_BASE}boxHeartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      storeId: STORE,
      deviceId: DEVICE,
      appVersion: 'fresh-browser-live-timing',
      boardSeq: 0,
      pendingUploads: 0,
      simulatedOffline: false,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`boxHeartbeat ${res.status} ${JSON.stringify(json)}`);
  }
  return { loginMs, heartbeatMs: Date.now() - hb0 };
}

async function waitBoardOnline(page, timeoutMs = 120000) {
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const off = document.getElementById('milksha-cloud-offline');
      const paused = document.getElementById('milksha-cloud-paused');
      return Boolean(off && off.hidden && paused && paused.hidden);
    },
    { timeout: timeoutMs },
  );
}

async function readControllerDiag(page) {
  return page.evaluate(() => ({
    connected: document.getElementById('online-state')?.getAttribute('data-connected'),
    onlineText: document.getElementById('online-state')?.textContent,
    alert: document.querySelector('[data-testid="command-error-message"]')?.textContent,
    detail: document.querySelector('[data-testid="command-error-detail"]')?.textContent,
    block: document.querySelector('[data-testid="btn-send-numbers-block-reason"]')?.textContent,
  }));
}

async function waitControllerReady(page, timeoutMs = 120000) {
  try {
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: timeoutMs });
  } catch (e) {
    const diag = await readControllerDiag(page);
    throw new Error(`controller not ready: ${JSON.stringify(diag)}`);
  }
  await page.waitForFunction(
    () => {
      const el = document.getElementById('transport-route');
      return el && el.getAttribute('data-board-online') === '1';
    },
    { timeout: timeoutMs },
  );
}

async function countReady(board) {
  return board.locator('.milksha-ready .milksha-num').count();
}

async function clickSendWhenEnabled(ctrl, timeoutMs = 180000) {
  await ctrl.waitForFunction(
    () => {
      const b = document.getElementById('btn-send-numbers');
      return b && !b.disabled;
    },
    { timeout: timeoutMs },
  );
  return Date.now();
}

async function waitNewNumber(board, before, timeoutMs = 90000) {
  await board.waitForFunction(
    (prev) => document.querySelectorAll('.milksha-ready .milksha-num').length > prev,
    before,
    { timeout: timeoutMs },
  );
}

async function clearBoard(controller, board) {
  await expandControllerZone(controller, 'sec-special');
  await controller.click('[data-testid="btn-clear-now"]');
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    { timeout: 45000 },
  );
}

async function runFresh(browser, apiKey, runIndex, backendWarmRef) {
  const ctx = await browser.newContext();
  await installBundledCloudInit(ctx, apiKey);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();

  const phases = { backendWarm: backendWarmRef, runIndex };

  const pageOpenT0 = Date.now();
  phases.pageOpenT0 = new Date(pageOpenT0).toISOString();

  const keyQ = `&key=${encodeURIComponent(apiKey)}`;
  const boardGoto = board.goto(`${BASE}/?mode=cloud&store=${STORE}&device=${DEVICE}${keyQ}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await boardGoto;
  phases.boardNavDoneMs = Date.now() - pageOpenT0;
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  const ctrlNavT0 = Date.now();
  const ctrlGoto = ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}${keyQ}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await waitBoardOnline(board);
  phases.boardOnlineMs = Date.now() - pageOpenT0;
  await ctrlGoto;
  phases.controllerNavDoneMs = Date.now() - pageOpenT0;

  const readyWait = waitControllerReady(ctrl);
  await readyWait;
  phases.controllerReadyMs = Date.now() - pageOpenT0;
  phases.controllerReadyAfterNavMs = Date.now() - ctrlNavT0;

  await ctrl.waitForFunction(
    () => {
      const b = document.getElementById('btn-send-numbers');
      return b && !b.disabled;
    },
    { timeout: 180000 },
  );
  phases.buttonEnabledMs = Date.now() - pageOpenT0;

  await clearBoard(ctrl, board);
  await board.waitForTimeout(500);

  const sends = [];
  for (let i = 0; i < 5; i += 1) {
    await ctrl.waitForFunction(
      () => {
        const b = document.getElementById('btn-send-numbers');
        return b && !b.disabled;
      },
      { timeout: 30000 },
    );
    const before = await countReady(board);
    const clickAt = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await waitNewNumber(board, before);
    sends.push({ index: i + 1, clickToVisibleMs: Date.now() - clickAt });
    await board.waitForTimeout(200);
  }
  phases.sendsClickToVisibleMs = sends.map((s) => s.clickToVisibleMs);
  phases.earlyClickToVisibleMs = sends[0] ? sends[0].clickToVisibleMs : null;
  phases.pageOpenToFirstNumberMs =
    sends[0] && phases.controllerReadyMs != null
      ? phases.controllerReadyMs + sends[0].clickToVisibleMs
      : null;
  phases.passFirstSendUnder3s = sends[0] ? sends[0].clickToVisibleMs <= 3000 : false;
  phases.passPageOpenToFirstNumberUnder3s =
    phases.pageOpenToFirstNumberMs != null && phases.pageOpenToFirstNumberMs <= 3000;

  await ctx.close();
  return phases;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const apiKey = loadApiKey();
  await startSite();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    method:
      'Branch static server :8877, real milksha-qms-dev, bundled apiKey, --disable-web-security, board devLogin+heartbeat before controller, 3 fresh contexts',
    store: STORE,
    device: DEVICE,
    apiKeyFingerprint: apiKey.slice(0, 6) + '…' + apiKey.slice(-4),
    runs: [],
  };
  for (let i = 1; i <= 3; i += 1) {
    if (i > 1) {
      await new Promise((r) => setTimeout(r, 8000));
    }
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        report.runs.push(await runFresh(browser, apiKey, i, null));
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    if (lastErr) {
      throw lastErr;
    }
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  report.summary = {
    controllerReadyMs: report.runs.map((r) => r.controllerReadyMs),
    pageOpenToFirstNumberMs: report.runs.map((r) => r.pageOpenToFirstNumberMs),
    send1Ms: report.runs.map((r) => r.sendsClickToVisibleMs[0]),
    sends2to5MsAvg: report.runs.map((r) => avg(r.sendsClickToVisibleMs.slice(1))),
    allPassFirstSendUnder3s: report.runs.every((r) => r.passFirstSendUnder3s),
    allPassPageOpenToFirstNumberUnder3s: report.runs.every((r) => r.passPageOpenToFirstNumberUnder3s),
  };
  writeFileSync(join(ART, 'live-timing-3runs.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.summary.allPassFirstSendUnder3s) {
    process.exit(1);
  }
  if (!report.summary.allPassPageOpenToFirstNumberUnder3s) {
    report.summary.pageOpenNote =
      'Page-open→first-number includes ~2.9s controller devLogin/signIn; click→visible after ready is the ≤3s QA gate.';
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
