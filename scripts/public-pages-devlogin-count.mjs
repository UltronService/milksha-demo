#!/usr/bin/env node
/**
 * Count devLogin on public Pages: paused (5m) vs healthy board+controller (10m).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-devlogin-count');
const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || 'https://ultronservice.github.io/milksha-demo';
const STORE_A = 'zz-qa-store-a';

mkdirSync(ART, { recursive: true });

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

function attachDevLoginCounter(pages) {
  const events = [];
  for (const page of pages) {
    page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('devLogin') || req.method() !== 'POST') {
        return;
      }
      let storeId = '';
      try {
        const body = req.postData() || '';
        const parsed = JSON.parse(body);
        storeId = String(parsed.storeId || '');
      } catch {
        storeId = '';
      }
      events.push({
        at: Date.now(),
        storeId,
        referer: req.headers()['referer'] || '',
      });
    });
  }
  return events;
}

async function waitPausedVisible(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => {
      const paused = document.getElementById('milksha-cloud-paused');
      return paused && !paused.hidden;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

const STORE_DENY = 'zz-deny-test';

async function measurePausedFiveMinutes(browser) {
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const events = attachDevLoginCounter([board]);
  const t0 = Date.now();
  await board.goto(`${PUBLIC_BASE}/?mode=cloud&store=${STORE_DENY}`, { waitUntil: 'domcontentloaded' });
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 }).catch(() => null);
  await waitPausedVisible(board);
  const pausedAt = Date.now();
  const beforeIdle = events.length;
  await board.waitForTimeout(5 * 60 * 1000);
  const idleEvents = events.slice(beforeIdle);
  const diag = await board.evaluate(() => {
    const paused = document.getElementById('milksha-cloud-paused');
    return {
      pausedVisible: Boolean(paused && !paused.hidden),
      pausedText: paused ? (paused.textContent || '').trim() : '',
      authKeys: Object.keys(localStorage).filter((k) => k.startsWith('milksha:auth:')),
    };
  });
  await ctx.close();
  return {
    scenario: 'fresh_paused_zz_deny_test_live403',
    d403Mode: 'live_cloud',
    boardStore: STORE_DENY,
    durationMs: Date.now() - t0,
    idleWindowMs: 5 * 60 * 1000,
    devLoginTotalFromNavigation: beforeIdle,
    devLoginDuring5mIdle: idleEvents.length,
    devLoginDuring5mByStore: idleEvents.reduce((acc, e) => {
      const k = e.storeId || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    pass: idleEvents.length <= 1,
    diag,
    sampleReferers: events.slice(0, 3).map((e) => e.referer),
  };
}

async function measureHealthyTenMinutes(browser) {
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const events = attachDevLoginCounter([board, ctrl]);
  const t0 = Date.now();
  await board.goto(`${PUBLIC_BASE}/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
  await ctrl.goto(`${PUBLIC_BASE}/controller/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
  await board.waitForFunction(
    () => {
      const off = document.getElementById('milksha-cloud-offline');
      const paused = document.getElementById('milksha-cloud-paused');
      return (
        Boolean(window.receiverCloud) &&
        off &&
        off.hidden &&
        paused &&
        paused.hidden
      );
    },
    undefined,
    { timeout: 120000 },
  );
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });
  const readyAt = Date.now();
  const beforeIdle = events.length;
  await board.waitForTimeout(10 * 60 * 1000);
  const idleEvents = events.slice(beforeIdle);
  await ctx.close();
  return {
    scenario: 'healthy_board_controller_zz-qa-store-a',
    durationMs: Date.now() - t0,
    idleWindowMs: 10 * 60 * 1000,
    devLoginUntilReady: beforeIdle,
    devLoginDuring10mIdle: idleEvents.length,
    devLoginDuring10mByStore: idleEvents.reduce((acc, e) => {
      const k = e.storeId || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    pass: idleEvents.length <= 2,
    readyMs: readyAt - t0,
  };
}

async function main() {
  loadApiKey();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    publicBase: PUBLIC_BASE,
    paused5m: null,
    healthy10m: null,
    conclusionLine:
      '待實測：若暫停 5 分鐘 idle devLogin≈0 而 10/3–10/8 總量高，則偏高來自 Cursor QA 多情境重跑，與「連線暫停卡住」非同一迴圈根因。',
  };
  try {
    report.paused5m = await measurePausedFiveMinutes(browser);
  } catch (e) {
    report.paused5m = { pass: false, error: e.message || String(e) };
  }
  try {
    report.healthy10m = await measureHealthyTenMinutes(browser);
  } catch (e) {
    report.healthy10m = { pass: false, error: e.message || String(e) };
  }
  await browser.close();

  const pausedIdle = report.paused5m?.devLoginDuring5mIdle ?? null;
  const healthyIdle = report.healthy10m?.devLoginDuring10mIdle ?? null;
  if (pausedIdle !== null && healthyIdle !== null) {
    report.conclusionLine =
      pausedIdle <= 1 && healthyIdle <= 2
        ? '10/3–10/8 devLogin 約 3,500 次偏高主因是 Cursor 雲端 QA／代理人大量重跑（多 IP、短爆發），與產品在「連線暫停」或正常連線 idle 下的 devLogin 迴圈無關。'
        : 'devLogin 在暫停或長時間 idle 仍偏高，需與 QA 流量一併追查產品重試。';
  }
  report.pass = Boolean(report.paused5m?.pass && report.healthy10m?.pass);
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
