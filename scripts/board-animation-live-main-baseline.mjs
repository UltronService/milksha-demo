#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa');
const STORE = 'zz-qa-store-a';
const GITHUB_PAGES_BASE = 'https://ultronservice.github.io/milksha-demo';

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) {
    return null;
  }
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 3000 },
    );
    samples.push({ index: i + 1, clickToReadyNumberVisibleMs: Date.now() - t0 });
    await board.waitForTimeout(120);
  }
  await browser.close();
  const block = {
    route: 'ultronservice.github.io/milksha-demo (main Pages JS, 無 branch site route)',
    samples,
    maxMs: Math.max(...samples.map((s) => s.clickToReadyNumberVisibleMs)),
    medianMs: median(samples.map((s) => s.clickToReadyNumberVisibleMs)),
    measuredAt: new Date().toISOString(),
  };
  const metricsPath = join(ART, 'metrics.json');
  const metrics = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : {};
  metrics.liveCloudMain = block;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(block, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
