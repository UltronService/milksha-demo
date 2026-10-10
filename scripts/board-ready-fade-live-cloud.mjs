#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa');
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';

async function main() {
  const { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } = await import(
    '../tests/e2e/board-animation-live-setup.mjs'
  );
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${DEVICE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  const samples = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 3000 },
    );
    samples.push({ index: i + 1, clickToReadyNumberVisibleMs: Date.now() - t0 });
    await board.waitForTimeout(150);
  }
  await browser.close();
  const block = { store: STORE, samples };
  writeFileSync(join(ART, 'live-cloud-samples.json'), JSON.stringify(block, null, 2));
  console.log(JSON.stringify(block, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
