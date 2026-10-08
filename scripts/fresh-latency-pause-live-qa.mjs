#!/usr/bin/env node
/**
 * Live Pages timing + pause repro (zz-qa-store-a writes only).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startSite,
  restartCloud,
  resetCloudState,
  installBundledCloudRouteShim,
} from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'fresh-latency-pause-self-qa');
const PAGES = process.env.MILKSHA_PAGES_BASE || 'https://ultronservice.github.io/milksha-demo';
const STORE = 'zz-qa-store-a';

function isLocalPages() {
  return PAGES.includes('127.0.0.1') || PAGES.includes('localhost');
}

function loadApiKey() {
  const fromEnv = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const cfgPath =
    process.env.MILKSHA_WEB_CONFIG ||
    '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_276d.txt';
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

function classifyResource(url) {
  const u = String(url);
  if (u.includes('devLogin')) {
    return 'devLogin';
  }
  if (u.includes('signInWithCustomToken')) {
    return 'signInWithCustomToken';
  }
  if (u.includes('boxHeartbeat')) {
    return 'boxHeartbeat';
  }
  if (u.includes('devCommand')) {
    return 'devCommand';
  }
  if (u.includes('firestore.googleapis.com')) {
    return 'firestore';
  }
  return 'other';
}

async function measureFiveSends(browser, apiKey) {
  const ctx = await browser.newContext();
  if (apiKey && !isLocalPages()) {
    await ctx.addInitScript((key) => {
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
        apiKey: key,
        projectId: 'milksha-qms-dev',
        defaultCloudMode: true,
        functionsBaseUrl: 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/',
      });
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({ projectId: 'milksha-qms-dev', apiKey: key, region: 'asia-east1' }),
      );
    }, apiKey);
  }
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  if (isLocalPages()) {
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);
  }
  let devLoginCalls = 0;
  const onDevLogin = (req) => {
    if (req.url().includes('devLogin') && req.method() === 'POST') {
      devLoginCalls += 1;
    }
  };
  board.on('request', onDevLogin);
  ctrl.on('request', onDevLogin);

  const resources = [];
  const onResponse = (res) => {
    const url = res.url();
    const phase = classifyResource(url);
    if (phase === 'other') {
      return;
    }
    resources.push({
      phase,
      url,
      status: res.status(),
      start: res.request().timing()?.startTime || 0,
    });
  };
  board.on('response', onResponse);
  ctrl.on('response', onResponse);

  const t0 = Date.now();
  const boardUrl = isLocalPages()
    ? `${PAGES}/?store=${STORE}`
    : `${PAGES}/?mode=cloud&store=${STORE}`;
  const ctrlUrl = isLocalPages()
    ? `${PAGES}/controller/?store=${STORE}`
    : `${PAGES}/controller/?mode=cloud&store=${STORE}`;
  await board.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await ctrl.goto(ctrlUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  const tBoardReady = Date.now();
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
  await ctrl.waitForFunction(
    () => {
      const el = document.getElementById('transport-route');
      return el && el.getAttribute('data-board-online') === '1';
    },
    { timeout: 120000 },
  );
  const tCtrlReady = Date.now();

  const sends = [];
  for (let i = 0; i < 5; i += 1) {
    await ctrl.waitForFunction(
      () => {
        const b = document.getElementById('btn-send-numbers');
        return b && !b.disabled;
      },
      { timeout: 30000 },
    );
    const before = await board.locator('.milksha-ready .milksha-num').count();
    const clickAt = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (prev) => document.querySelectorAll('.milksha-ready .milksha-num').length > prev,
      before,
      { timeout: 90000 },
    );
    sends.push({ index: i + 1, latencyMs: Date.now() - clickAt });
    await board.waitForTimeout(400);
  }

  await ctx.close();
  return {
    bootMs: { boardReady: tBoardReady - t0, controllerReady: tCtrlReady - t0 },
    devLoginCallsDuringSession: devLoginCalls,
    sends,
    resources,
  };
}

async function measureEarlyClick(browser, apiKey) {
  const ctx = await browser.newContext();
  if (apiKey && !isLocalPages()) {
    await ctx.addInitScript((key) => {
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
        apiKey: key,
        projectId: 'milksha-qms-dev',
        defaultCloudMode: true,
        functionsBaseUrl: 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/',
      });
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({ projectId: 'milksha-qms-dev', apiKey: key, region: 'asia-east1' }),
      );
    }, apiKey);
  }
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  if (isLocalPages()) {
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);
  }
  const boardUrl = isLocalPages()
    ? `${PAGES}/?store=${STORE}`
    : `${PAGES}/?mode=cloud&store=${STORE}`;
  const ctrlUrl = isLocalPages()
    ? `${PAGES}/controller/?store=${STORE}`
    : `${PAGES}/controller/?mode=cloud&store=${STORE}`;
  const t0 = Date.now();
  await Promise.all([
    board.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }),
    ctrl.goto(ctrlUrl, { waitUntil: 'domcontentloaded', timeout: 120000 }),
  ]);
  const clickAt = Date.now();
  await ctrl.click('[data-testid="btn-send-numbers"]');
  const before = await board.locator('.milksha-ready .milksha-num').count();
  let firstNumberMs = null;
  try {
    await board.waitForFunction(
      (prev) => document.querySelectorAll('.milksha-ready .milksha-num').length > prev,
      before,
      { timeout: 120000 },
    );
    firstNumberMs = Date.now() - clickAt;
  } catch {
    firstNumberMs = null;
  }
  await ctx.close();
  return { pageOpenMs: clickAt - t0, clickToFirstNumberMs: firstNumberMs };
}

async function pauseReproFresh(browser) {
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  let devLoginCalls = 0;
  await board.route('**/devLogin', async (route) => {
    const body = route.request().postData() || '';
    if (!body.includes('s999999')) {
      await route.continue();
      return;
    }
    devLoginCalls += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
    });
  });
  await board.goto(`${PAGES}/?mode=cloud&store=s999999`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 }).catch(() => null);
  await board.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 90000 });
  const text = await board.locator('#milksha-cloud-paused').innerText();
  await ctx.close();
  return { devLoginCalls, pausedText: text.trim(), pass: text.trim() === '連線暫停' && devLoginCalls >= 1 };
}

async function pauseReproExistingSession(browser) {
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  let devLoginCalls = 0;
  await board.route('**/devLogin', async (route) => {
    devLoginCalls += 1;
    await route.continue();
  });
  await board.route('**/*boxHeartbeat*', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
    });
  });
  await board.goto(`${PAGES}/?mode=cloud&store=${STORE}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  await board.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith('milksha:auth:')),
    { timeout: 60000 },
  );
  await board.evaluate(() => {
    if (window.receiverCloud && window.receiverCloud.sendHeartbeat) {
      return window.receiverCloud.sendHeartbeat();
    }
    return null;
  });
  await board.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 60000 });
  const text = await board.locator('#milksha-cloud-paused').innerText();
  await ctx.close();
  return { devLoginCalls, pausedText: text.trim(), pass: text.trim() === '連線暫停' && devLoginCalls === 0 };
}

function launchBrowser() {
  const local = PAGES.includes('127.0.0.1') || PAGES.includes('localhost');
  return chromium.launch({
    headless: true,
    args: local
      ? ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
      : [],
  });
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const apiKey = loadApiKey();
  if (isLocalPages()) {
    await restartCloud();
    await startSite();
    await resetCloudState({ seedDevice: true });
  }
  const browser = await launchBrowser();
  const report = {
    generatedAt: new Date().toISOString(),
    pages: PAGES,
    store: STORE,
    apiKeyConfigured: Boolean(apiKey),
    timing: null,
    earlyClick: null,
    pauseFreshStore: null,
    pauseExistingSession: null,
  };
  try {
    report.timing = await measureFiveSends(browser, apiKey);
  } catch (e) {
    report.timing = { error: e.message || String(e) };
  }
  try {
    report.earlyClick = await measureEarlyClick(browser, apiKey);
  } catch (e) {
    report.earlyClick = { error: e.message || String(e) };
  }
  try {
    report.pauseFreshStore = await pauseReproFresh(browser);
  } catch (e) {
    report.pauseFreshStore = { pass: false, error: e.message || String(e) };
  }
  try {
    report.pauseExistingSession = await pauseReproExistingSession(browser);
  } catch (e) {
    report.pauseExistingSession = { pass: false, error: e.message || String(e) };
  }
  report.firstSendMs = report.timing && report.timing.sends ? report.timing.sends[0]?.latencyMs ?? null : null;
  report.pass = {
    firstSendUnder3s: report.firstSendMs != null && report.firstSendMs <= 3000,
    pauseFresh: Boolean(report.pauseFreshStore && report.pauseFreshStore.pass),
    pauseExisting: Boolean(report.pauseExistingSession && report.pauseExistingSession.pass),
  };
  writeFileSync(join(ART, 'live-self-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  const localBranch = PAGES.includes('127.0.0.1') || PAGES.includes('localhost');
  if (
    !report.pass.firstSendUnder3s ||
    !report.pass.pauseFresh ||
    (!report.pass.pauseExisting && !localBranch)
  ) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
