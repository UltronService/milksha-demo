#!/usr/bin/env node
/**
 * Live milksha-qms-dev self-QA (legacy localStorage + two-store). Writes zz-qa-* only.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandControllerZone, startSite, PORT_SITE } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'legacy-settings-fix-self-qa');
const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';
const LIVE_SEND_TIMEOUT_MS = 30000;

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
      localStorage.setItem('milksha:controller-pos-sign-key', 'fake-milksha-pos-sign-key-for-tests');
    } catch {
      /* ignore */
    }
  }, apiKey);
}

const LEGACY_SEED = () => {
  if (localStorage.getItem('__legacy_live_seed')) {
    return;
  }
  localStorage.setItem('__legacy_live_seed', '1');
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
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
    'milksha:local:poc-target',
    JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', pinnedAt: Date.now() }),
  );
  localStorage.setItem(
    'milksha:local:device:s120030:stb-old-99',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
  );
  localStorage.setItem(
    'milksha:receiver-cache:s120030',
    JSON.stringify({
      seq: 9999,
      numberContent: [{ number: '9999' }],
      businessDate: '2099-01-01',
    }),
  );
  localStorage.setItem('milksha:auth:legacy:zz:device:stb-01', JSON.stringify({ idToken: 'stale-token' }));
  localStorage.setItem('milksha:auth:old-key:s120030:device:stb-old-99', JSON.stringify({ idToken: 'x' }));
  try {
    sessionStorage.setItem('__legacy_storage_before', JSON.stringify(snapshotStorage()));
  } catch {
    /* ignore */
  }
  function snapshotStorage() {
    const out = { localStorage: {}, authKeys: [] };
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) {
        out.localStorage[k] = localStorage.getItem(k);
        if (k.indexOf('milksha:auth:') === 0) {
          out.authKeys.push(k);
        }
      }
    }
    return out;
  }
};

async function snapshotPage(page) {
  return page.evaluate(() => {
    const ls = {};
    const authKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) {
        ls[k] = localStorage.getItem(k);
        if (k.indexOf('milksha:auth:') === 0) {
          authKeys.push(k);
        }
      }
    }
    return {
      ls,
      authKeys,
      deviceId: localStorage.getItem('milksha:deviceId'),
      settings: localStorage.getItem('milksha:cloud-settings'),
      poc: localStorage.getItem('milksha:local:poc-target'),
      s120Cache: localStorage.getItem('milksha:receiver-cache:s120030'),
    };
  });
}

async function waitBoardOnline(page, timeoutMs = 90000) {
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

async function waitControllerOnline(page, timeoutMs = 120000) {
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: timeoutMs });
}

async function countReady(board) {
  return board.locator('.milksha-ready .milksha-num').count();
}

async function sendAndMeasure(board, controller) {
  const before = await countReady(board);
  const t0 = Date.now();
  await controller.click('[data-testid="btn-send-numbers"]');
  await board.waitForFunction(
    (prev) => document.querySelectorAll('.milksha-ready .milksha-num').length > prev,
    before,
    { timeout: LIVE_SEND_TIMEOUT_MS },
  );
  const latencyMs = Date.now() - t0;
  const nums = await board.evaluate(() => {
    const out = [];
    document.querySelectorAll('.milksha-ready .milksha-num').forEach((el) => out.push(el.textContent));
    return out;
  });
  return { latencyMs, nums, readyCount: nums.length };
}

async function clearStore(controller, board) {
  await expandControllerZone(controller, 'sec-special');
  await controller.click('[data-testid="btn-clear-now"]');
  if (board) {
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
      { timeout: 30000 },
    );
  } else {
    await controller.waitForTimeout(2000);
  }
}

async function runLegacyScenarioA(browser, apiKey) {
  const ctx = await browser.newContext();
  await installBundledCloudInit(ctx, apiKey);
  await ctx.addInitScript(LEGACY_SEED);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  let devLoginCount = 0;
  for (const p of [board, controller]) {
    await p.route('**/devLogin', async (route) => {
      devLoginCount += 1;
      await route.continue();
    });
  }
  await board.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const before = await board.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('__legacy_storage_before') || 'null');
    } catch {
      return null;
    }
  });
  await waitBoardOnline(board);
  await controller.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
  await waitControllerOnline(controller);
  const afterBoard = await snapshotPage(board);
  const afterCtrl = await snapshotPage(controller);
  const devLoginProbe = await fetch('https://asia-east1-milksha-qms-dev.cloudfunctions.net/devLogin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: STORE_A, role: 'device', deviceId: 'stb-01' }),
  });
  const devLoginBody = await devLoginProbe.json().catch(() => ({}));
  await ctx.close();
  return {
    ok:
      afterBoard.settings &&
      !afterBoard.settings.includes('legacy-key') &&
      afterBoard.deviceId === 'stb-01' &&
      afterBoard.poc === null &&
      devLoginProbe.ok,
    before,
    afterBoard,
    afterCtrl,
    devLoginHttp: { status: devLoginProbe.status, ok: devLoginProbe.ok, code: devLoginBody.code || null },
    devLoginCallsDuringBoot: devLoginCount,
  };
}

async function runLegacyScenarioB(browser, apiKey) {
  const ctx = await browser.newContext();
  await installBundledCloudInit(ctx, apiKey);
  await ctx.addInitScript(LEGACY_SEED);
  const home = await ctx.newPage();
  await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await waitBoardOnline(home);
  const homeNums = await home.locator('.milksha-ready .milksha-num').count();
  const homeStore = await home.evaluate(() => {
    const p = new URLSearchParams(location.search);
    return p.get('store') || 'c030020';
  });

  const boardA = await ctx.newPage();
  const boardB = await ctx.newPage();
  const ctrlA = await ctx.newPage();
  const ctrlB = await ctx.newPage();
  await Promise.all([
    boardA.goto(`${BASE}/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' }),
    boardB.goto(`${BASE}/?mode=cloud&store=${STORE_B}`, { waitUntil: 'domcontentloaded' }),
    ctrlA.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' }),
    ctrlB.goto(`${BASE}/controller/?mode=cloud&store=${STORE_B}`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitBoardOnline(boardA);
  await waitBoardOnline(boardB);
  await waitControllerOnline(ctrlA);
  await waitControllerOnline(ctrlB);

  const rounds = [];
  for (let r = 1; r <= 3; r += 1) {
    const bBeforeA = await countReady(boardB);
    const aBeforeA = await countReady(boardA);
    const resA = await sendAndMeasure(boardA, ctrlA);
    const bAfterA = await countReady(boardB);
    const leakAonB = bAfterA > bBeforeA;
    const resB = await sendAndMeasure(boardB, ctrlB);
    const aAfterB = await countReady(boardA);
    const leakBonA = aAfterB > aBeforeA + 1;
    const pass =
      resA.latencyMs <= 3000 &&
      resB.latencyMs <= 3000 &&
      !leakAonB &&
      !leakBonA;
    rounds.push({
      round: r,
      storeA: resA,
      storeB: resB,
      pass,
      leakAonB,
      leakBonA,
      counts: { aBeforeA, bBeforeA, bAfterA, aAfterB },
    });
    await clearStore(ctrlA, boardA);
    await clearStore(ctrlB, boardB);
    await boardA.waitForTimeout(800);
    await boardB.waitForTimeout(800);
  }

  await boardA.context().setOffline(true);
  await boardA.waitForSelector('#milksha-cloud-offline:not([hidden])', { timeout: 60000 });
  const offlineText = await boardA.locator('#milksha-cloud-offline').innerText();
  await boardA.context().setOffline(false);
  await boardA.waitForFunction(
    () => {
      const off = document.getElementById('milksha-cloud-offline');
      return Boolean(off && off.hidden);
    },
    { timeout: 90000 },
  );
  await ctrlA.click('[data-testid="btn-send-numbers"]');
  await boardA.waitForSelector('.milksha-ready .milksha-num', { timeout: 15000 });

  const forbidden = await ctx.newPage();
  let devLogin403 = 0;
  await forbidden.route('**/devLogin', async (route) => {
    const body = route.request().postData() || '';
    if (!body.includes('s999999')) {
      await route.continue();
      return;
    }
    devLogin403 += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
    });
  });
  await forbidden.goto(`${BASE}/?store=s999999`, { waitUntil: 'domcontentloaded' });
  await forbidden.waitForFunction(
    () => typeof window.__forceReceiverAuthRecheck === 'function',
    { timeout: 45000 },
  );
  await forbidden.evaluate(() => window.__forceReceiverAuthRecheck({ clearSession: true }));
  await forbidden.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 90000 });
  const pausedText = await forbidden.locator('#milksha-cloud-paused').innerText();
  await forbidden.waitForTimeout(5000);

  await ctx.close();
  return {
    ok: rounds.every((x) => x.pass) && offlineText.trim() === '離線' && pausedText.trim() === '連線暫停' && devLogin403 <= 4,
    homeReadOnly: { store: homeStore, readyCount: homeNums },
    rounds,
    offlineText: offlineText.trim(),
    pausedText: pausedText.trim(),
    devLogin403DuringForbidden: devLogin403,
  };
}

async function runFreshScenarioC(browser, apiKey) {
  const ctx = await browser.newContext();
  await installBundledCloudInit(ctx, apiKey);
  const boardA = await ctx.newPage();
  const boardB = await ctx.newPage();
  const ctrlA = await ctx.newPage();
  const ctrlB = await ctx.newPage();
  await Promise.all([
    boardA.goto(`${BASE}/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' }),
    boardB.goto(`${BASE}/?mode=cloud&store=${STORE_B}`, { waitUntil: 'domcontentloaded' }),
    ctrlA.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' }),
    ctrlB.goto(`${BASE}/controller/?mode=cloud&store=${STORE_B}`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitBoardOnline(boardA);
  await waitBoardOnline(boardB);
  await waitControllerOnline(ctrlA);
  await waitControllerOnline(ctrlB);
  const rounds = [];
  for (let r = 1; r <= 3; r += 1) {
    const bBeforeA = await countReady(boardB);
    const aBeforeA = await countReady(boardA);
    const resA = await sendAndMeasure(boardA, ctrlA);
    const bAfterA = await countReady(boardB);
    const resB = await sendAndMeasure(boardB, ctrlB);
    const aAfterB = await countReady(boardA);
    const pass =
      resA.latencyMs <= 3000 &&
      resB.latencyMs <= 3000 &&
      bAfterA <= bBeforeA &&
      aAfterB <= aBeforeA + 1;
    rounds.push({ round: r, storeA: resA, storeB: resB, pass });
    await clearStore(ctrlA, boardA);
    await clearStore(ctrlB, boardB);
    await boardA.waitForTimeout(800);
  }
  await ctx.close();
  return { ok: rounds.every((x) => x.pass), rounds };
}

async function main() {
  const apiKey = loadApiKey();
  mkdirSync(ART, { recursive: true });
  await startSite();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    apiKeyFingerprint: apiKey.slice(0, 6) + '…' + apiKey.slice(-4),
    items: [],
  };

  let a;
  try {
    a = await runLegacyScenarioA(browser, apiKey);
  } catch (e) {
    a = { ok: false, error: e.message || String(e) };
  }
  report.items.push({ id: 'A', name: 'Legacy seed live login + storage migration', result: a.ok ? 'PASS' : 'FAIL', ...a });

  let b;
  try {
    b = await runLegacyScenarioB(browser, apiKey);
  } catch (e) {
    b = { ok: false, error: e.message || String(e) };
  }
  report.items.push({ id: 'B', name: 'Legacy browser continuous two-store x3 + offline/403', result: b.ok ? 'PASS' : 'FAIL', ...b });

  let c;
  try {
    c = await runFreshScenarioC(browser, apiKey);
  } catch (e) {
    c = { ok: false, error: e.message || String(e) };
  }
  report.items.push({
    id: 'C',
    name: 'Fresh browser live two-store x3',
    result: c.ok ? 'PASS' : 'FAIL',
    ...c,
  });

  let unitPass = 0;
  let unitFail = 0;
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync('npm test', { cwd: ROOT, encoding: 'utf8' });
    const mPass = out.match(/# pass (\d+)/);
    const mFail = out.match(/# fail (\d+)/);
    unitPass = mPass ? Number(mPass[1]) : 0;
    unitFail = mFail ? Number(mFail[1]) : 0;
  } catch (e) {
    unitFail = 1;
  }
  report.items.push({
    id: 'D',
    name: 'Unit + e2e (see CI); unit counts from local npm test',
    result: unitFail === 0 ? 'PASS' : 'FAIL',
    unit: { pass: unitPass, fail: unitFail },
    e2eNote: 'Full npm run test:e2e counts recorded in CI / local e2e-summary.json',
  });

  writeFileSync(join(ART, 'live-self-qa-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ART, 'self-qa-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  const failed = report.items.filter((i) => i.result !== 'PASS');
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
