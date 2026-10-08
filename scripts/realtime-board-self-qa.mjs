#!/usr/bin/env node
/**
 * Self-QA: realtime onSnapshot vs polling on milksha-qms-dev (zz-qa-* writes only).
 * Requires MILKSHA_FIREBASE_API_KEY. Optional MILKSHA_QA_STORE (default zz-qa-store-a).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'realtime-board-self-qa');
const STORE = String(process.env.MILKSHA_QA_STORE || 'zz-qa-store-a').trim();
const DEVICE = 'stb-01';
const API_KEY = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
const PORT = Number(process.env.MILKSHA_SELF_QA_PORT || 8878);

function mime(path) {
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

function startStatic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const filePath = join(ROOT, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
      try {
        const st = statSync(filePath);
        if (!st.isFile()) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': mime(filePath) });
        res.end(readFileSync(filePath));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function injectApiKey(page) {
  if (!API_KEY) {
    return;
  }
  await page.addInitScript((key) => {
    if (window.MILKSHA_FIREBASE_CONFIG) {
      window.MILKSHA_FIREBASE_CONFIG.apiKey = key;
    }
  }, API_KEY);
}

async function runBoardTiming(browser, label) {
  const page = await browser.newPage();
  await injectApiKey(page);
  const base = `http://127.0.0.1:${PORT}/`;
  const tOpen = Date.now();
  await page.goto(`${base}?mode=cloud&store=${STORE}&device=${DEVICE}`);
  await page.waitForFunction(() => window.receiverCloud && window.receiverCloud.getRealtimeStats, {
    timeout: 45000,
  });
  const boardFirstPaintMs = await page
    .waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length > 0,
      { timeout: 45000 },
    )
    .then(() => Date.now() - tOpen)
    .catch(() => Date.now() - tOpen);
  const realtimeAttachedMs = await page
    .waitForFunction(() => window.receiverCloud.getRealtimeStats().boardListen, { timeout: 45000 })
    .then(() => Date.now() - tOpen)
    .catch(() => null);
  const stats0 = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
  await page.waitForTimeout(25000);
  const statsAfter = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
  await page.close();
  return { label, boardFirstPaintMs, realtimeAttachedMs, stats0, statsAfter };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    store: STORE,
    device: DEVICE,
    apiKeyPresent: Boolean(API_KEY),
    note: 'Full send timing requires controller pairing; this script records realtime listener mode and read counters.',
  };
  if (!API_KEY) {
    report.error = 'MILKSHA_FIREBASE_API_KEY required for live cloud';
    writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const server = await startStatic();
  const browser = await chromium.launch({ headless: true });
  try {
    report.listenerProbe = await runBoardTiming(browser, 'realtime-probe');
    report.readEstimatePerHour = {
      boardSnapshot: 'initial + each today_board change + ~60 fallback REST polls/h',
      controlPendingMode:
        'commandMode=control: snapshot per pending write/delete (not heartbeat)',
      commandPollMode:
        'commandMode=poll: device poll every 5s ≈ 720 REST reads/h (until control/pending deployed)',
    };
  } finally {
    await browser.close();
    server.close();
  }
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
