#!/usr/bin/env node
/**
 * Read-only: one fresh-context b-style timing with network phase marks (zz-qa-store-a).
 * Does not write stores other than zz-qa-*.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
  siteRouteActive,
} from './lib/github-pages-site-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ROOT = resolveSiteRoot(ROOT);
const USE_ROUTE = siteRouteActive();
const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || GITHUB_PAGES_BASE;
const STORE = 'zz-qa-store-a';
const OUT = join(ROOT, 'artifacts', 'pr27-investigate', 'b-press-to-display-forensics.json');

function loadApiKey() {
  const k = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (k) {
    return k;
  }
  throw new Error('MILKSHA_FIREBASE_API_KEY required');
}

function injectFirebase(siteRoot, apiKey) {
  spawnSync('node', [join(ROOT, 'scripts', 'inject-firebase-config.mjs'), join(siteRoot, 'config', 'firebase.js')], {
    env: { ...process.env, MILKSHA_FIREBASE_API_KEY: apiKey },
    stdio: 'pipe',
  });
}

async function main() {
  const apiKey = loadApiKey();
  if (USE_ROUTE) {
    injectFirebase(SITE_ROOT, apiKey);
  }
  const marks = [];
  const mark = (name) => marks.push({ name, atMs: Date.now() });
  const t0 = Date.now();
  mark('start');

  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const ctx = await browser.newContext();
  if (USE_ROUTE) {
    await installGithubPagesSiteRoute(ctx, SITE_ROOT);
  }
  const ctrl = await ctx.newPage();
  const board = await ctx.newPage();

  await ctrl.route('**/devCommand**', async (route) => {
    mark('devCommand_request');
    const res = await route.fetch();
    mark('devCommand_response');
    await route.fulfill({ response: res });
  });
  await board.route('**/today_board**', async (route) => {
    mark('today_board_read_request');
    const res = await route.fetch();
    mark('today_board_read_response');
    await route.fulfill({ response: res });
  });

  const ctrlUrl = `${PUBLIC_BASE}/controller/?mode=cloud&store=${STORE}`;
  const boardUrl = `${PUBLIC_BASE}/?mode=cloud&store=${STORE}`;
  await ctrl.goto(ctrlUrl, { waitUntil: 'domcontentloaded' });
  mark('controller_dom');
  await board.goto(boardUrl, { waitUntil: 'domcontentloaded' });
  mark('board_dom');
  await board.waitForFunction(
    () => {
      const off = document.getElementById('milksha-cloud-offline');
      const paused = document.getElementById('milksha-cloud-paused');
      const authed = Object.keys(localStorage).some(
        (k) => k.startsWith('milksha:auth:') && k.includes('zz-qa-store-a'),
      );
      return Boolean(window.receiverCloud) && authed && off?.hidden && paused?.hidden;
    },
    { timeout: 120000 },
  );
  mark('board_ready');
  await ctrl.waitForFunction(() => {
    const btn = document.getElementById('btn-send-numbers');
    return btn && !btn.disabled;
  });
  mark('send_enabled');
  const pressAt = Date.now();
  mark('press');
  await ctrl.click('[data-testid="btn-send-numbers"]');
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
    { timeout: 15000 },
  );
  mark('dom_ready_count');
  const report = {
    generatedAt: new Date().toISOString(),
    store: STORE,
    pagesRoute: USE_ROUTE,
    pressToDomMs: Date.now() - pressAt,
    marks: marks.map((m) => ({ ...m, deltaMs: m.atMs - t0 })),
    boardLocalSeq: await board.evaluate(() => window.receiverCloud?.getLocalSeq?.() ?? null),
    note: 'Compare devCommand_response→today_board_read_*→dom_ready_count deltas for phase split.',
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
