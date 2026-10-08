#!/usr/bin/env node
/**
 * Public Pages investigation: fresh a–e + d→c pollution probe (zz-qa writes only).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-investigate');
const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || 'https://ultronservice.github.io/milksha-demo';
const BOARD_HOME = `${PUBLIC_BASE}/`;
const CTRL = `${PUBLIC_BASE}/controller/`;
const STORE_MAIN = 'c030020';
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';
const FN_HOST = 'https://asia-east1-milksha-qms-dev.cloudfunctions.net';

mkdirSync(join(ART, 'screenshots'), { recursive: true });
const LOG = join(ART, 'run.log');

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
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

async function pageDiag(page) {
  return page.evaluate(() => {
    const paused = document.getElementById('milksha-cloud-paused');
    const offline = document.getElementById('milksha-cloud-offline');
    const authKeys = Object.keys(localStorage).filter((k) => k.startsWith('milksha:auth:'));
    const peerKey = Object.keys(localStorage).find((k) => k.includes('devlogin-peer'));
    return {
      url: location.href,
      pausedVisible: Boolean(paused && !paused.hidden),
      offlineVisible: Boolean(offline && !offline.hidden),
      readyCount: document.querySelectorAll('.milksha-ready .milksha-num').length,
      authKeys,
      peerLock: peerKey ? localStorage.getItem(peerKey) : null,
      uploadHalted: Boolean(
        window.receiverCloud &&
          window.receiverCloud._debugUploadHalted !== undefined &&
          window.receiverCloud._debugUploadHalted(),
      ),
      sessionHalted: Boolean(
        window.receiverCloud &&
          window.receiverCloud.transport &&
          window.receiverCloud.transport.session &&
          window.receiverCloud.transport.session.isUploadHalted &&
          window.receiverCloud.transport.session.isUploadHalted(),
      ),
    };
  });
}

async function waitBoardCloudReady(page, expectedStore, timeoutMs = 120000) {
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

async function clearBoardViaController(controller, board, label) {
  await expandControllerZone(controller, 'sec-special');
  const before = await board.locator('.milksha-ready .milksha-num').count();
  await controller.click('[data-testid="btn-clear-now"]');
  await board.waitForFunction(
    (prev) => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    before,
    { timeout: 90000 },
  );
  log(`${label}: board empty`);
}

async function runIsolationRounds(tabA, tabB, ctrlA, ctrlB, label, report) {
  const rounds = [];
  for (let r = 1; r <= 3; r += 1) {
    const roundTag = `${label}-r${r}`;
    try {
      await clearBoardViaController(ctrlA, tabA, `${roundTag}-clear-a`);
      await clearBoardViaController(ctrlB, tabB, `${roundTag}-clear-b`);
      const bBeforeA = await tabB.locator('.milksha-ready .milksha-num').count();
      const tSendA = Date.now();
      await ctrlA.click('[data-testid="btn-send-numbers"]');
      await tabA.waitForFunction(
        () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
        undefined,
        { timeout: 90000 },
      );
      const sendAMs = Date.now() - tSendA;
      const bAfterA = await tabB.locator('.milksha-ready .milksha-num').count();
      const tSendB = Date.now();
      await ctrlB.click('[data-testid="btn-send-numbers"]');
      await tabB.waitForFunction(
        () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
        undefined,
        { timeout: 90000 },
      );
      const sendBMs = Date.now() - tSendB;
      const aCount = await tabA.locator('.milksha-ready .milksha-num').count();
      const bCount = await tabB.locator('.milksha-ready .milksha-num').count();
      const ok = bAfterA === bBeforeA && aCount >= 1 && bCount >= 1;
      rounds.push({ round: r, bBeforeA, bAfterA, aCount, bCount, sendAMs, sendBMs, pass: ok });
      if (!ok) {
        report.lastDiag = {
          tabA: await pageDiag(tabA),
          tabB: await pageDiag(tabB),
        };
        return { pass: false, rounds, failRound: r, reason: 'isolation-leak' };
      }
    } catch (e) {
      report.lastDiag = {
        tabA: await pageDiag(tabA),
        tabB: await pageDiag(tabB),
        ctrlA: await pageDiag(ctrlA),
        ctrlB: await pageDiag(ctrlB),
      };
      return { pass: false, rounds, failRound: r, error: e.message || String(e) };
    }
  }
  return { pass: true, rounds };
}

async function runFullFlow(browser, contextName, seedOld) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (seedOld) {
    await ctx.addInitScript(oldSettingsSeedSource());
  }
  const out = { context: contextName, checks: {} };
  try {
    const home = await ctx.newPage();
    await home.goto(BOARD_HOME, { waitUntil: 'domcontentloaded' });
    await waitBoardCloudReady(home, STORE_MAIN);
    out.checks.a = { pass: true };
    await home.close();

    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const ctrlA = await ctx.newPage();
    const ctrlB = await ctx.newPage();
    await tabA.goto(`${BOARD_HOME}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
    await tabB.goto(`${BOARD_HOME}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
    await waitBoardCloudReady(tabA, STORE_A);
    await waitBoardCloudReady(tabB, STORE_B);
    await ctrlA.goto(`${CTRL}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
    await ctrlB.goto(`${CTRL}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
    await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
    await ctrlB.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
    const iso = await runIsolationRounds(tabA, tabB, ctrlA, ctrlB, contextName, out);
    out.checks.c = iso;
    await tabA.close();
    await tabB.close();
    await ctrlA.close();
    await ctrlB.close();

    const deny = await ctx.newPage();
    let devLoginCalls = 0;
    deny.on('request', (req) => {
      if (req.url().includes('devLogin')) {
        devLoginCalls += 1;
      }
    });
    await deny.goto(`${BOARD_HOME}?mode=cloud&store=s999999`, { waitUntil: 'domcontentloaded' });
    await deny.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 90000 });
    const denyDiag = await pageDiag(deny);
    out.checks.d = { pass: denyDiag.pausedVisible, devLoginCalls, denyDiag };
    await deny.close();
  } finally {
    await ctx.close();
  }
  return out;
}

/** Same context: open s999999 first, then zz-qa boards — probe cross-store pause bleed. */
async function runDThenCProbe(browser, runIndex) {
  const ctx = await browser.newContext();
  const report = { runIndex, pass: false };
  try {
    const deny = await ctx.newPage();
    await deny.goto(`${BOARD_HOME}?mode=cloud&store=s999999`, { waitUntil: 'domcontentloaded' });
    await deny.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 90000 });
    report.afterDeny = await pageDiag(deny);
    await deny.close();

    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const ctrlA = await ctx.newPage();
    const ctrlB = await ctx.newPage();
    await tabA.goto(`${BOARD_HOME}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
    await tabB.goto(`${BOARD_HOME}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    try {
      await waitBoardCloudReady(tabA, STORE_A, 120000);
      await waitBoardCloudReady(tabB, STORE_B, 120000);
      report.readyMs = Date.now() - t0;
      await ctrlA.goto(`${CTRL}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
      await ctrlB.goto(`${CTRL}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
      const iso = await runIsolationRounds(tabA, tabB, ctrlA, ctrlB, `d-then-c-${runIndex}`, report);
      report.isolation = iso;
      report.pass = iso.pass;
    } catch (e) {
      report.error = e.message || String(e);
      report.readyMs = Date.now() - t0;
      report.tabADiag = await pageDiag(tabA);
      report.tabBDiag = await pageDiag(tabB);
    }
  } finally {
    await ctx.close();
  }
  return report;
}

async function runFreshCOnly(browser, runIndex) {
  const ctx = await browser.newContext();
  const report = { runIndex, pass: false };
  try {
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const ctrlA = await ctx.newPage();
    const ctrlB = await ctx.newPage();
    await tabA.goto(`${BOARD_HOME}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
    await tabB.goto(`${BOARD_HOME}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
    await waitBoardCloudReady(tabA, STORE_A);
    await waitBoardCloudReady(tabB, STORE_B);
    await ctrlA.goto(`${CTRL}?store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
    await ctrlB.goto(`${CTRL}?store=${STORE_B}`, { waitUntil: 'domcontentloaded' });
    await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
    await ctrlB.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
    const iso = await runIsolationRounds(tabA, tabB, ctrlA, ctrlB, `c-only-${runIndex}`, report);
    report.isolation = iso;
    report.pass = iso.pass;
  } catch (e) {
    report.error = e.message || String(e);
  } finally {
    await ctx.close();
  }
  return report;
}

async function main() {
  writeFileSync(LOG, '');
  loadApiKey();
  log(`public base ${PUBLIC_BASE}`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  const report = {
    generatedAt: new Date().toISOString(),
    publicBase: PUBLIC_BASE,
    mergeCommit: 'a82cb9b',
    freshCOnly: [],
    dThenC: [],
    fullFlows: [],
  };

  for (let i = 1; i <= 3; i += 1) {
    log(`fresh c-only run ${i}`);
    report.freshCOnly.push(await runFreshCOnly(browser, i));
  }
  for (let i = 1; i <= 3; i += 1) {
    log(`d-then-c probe ${i}`);
    report.dThenC.push(await runDThenCProbe(browser, i));
  }
  log('full flow fresh');
  report.fullFlows.push(await runFullFlow(browser, 'fresh', false));
  log('full flow old-settings');
  report.fullFlows.push(await runFullFlow(browser, 'old-settings', true));

  await browser.close();
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  log(`wrote ${join(ART, 'report.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
