#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'artifacts', 'number-spec-v2', 'screenshots');
const port = process.env.MILKSHA_E2E_PORT || '8877';

mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, ['tests/e2e/web-server.mjs'], {
  cwd: root,
  env: { ...process.env, MILKSHA_E2E_PORT: port },
  stdio: 'inherit',
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer() {
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(base);
      if (res.ok) {
        return base;
      }
    } catch (_e) {
      await sleep(500);
    }
  }
  throw new Error('web-server did not start');
}

const PAYLOAD = [
  { source_type: 'From_FoodPanda_OK', number: '#130,vke3-2643-dy6y' },
  { source_type: 'From_Store_OK', number: '   ' },
  { source_type: 'From_FoodPanda_Preparing', number: '#130,va' },
  { source_type: 'From_FoodPanda_Preparing', number: '#130,vb' },
  { source_type: 'From_Store_Preparing', number: '<b>13</b>' },
  { source_type: 'From_milksha_point_Preparing', number: '迷客夏珍奶好' },
  { source_type: 'From_Store_Preparing', number: '12345😀' },
];

try {
  const base = await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(base + '?mode=local', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS?.runtime?.applyPayload);
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, PAYLOAD);
  await page.waitForSelector('.milksha-board-chip');
  await page.screenshot({ path: join(outDir, 'board-number-spec-v2-1920.png'), fullPage: false });
  await browser.close();
  console.log('saved', join(outDir, 'board-number-spec-v2-1920.png'));
} finally {
  server.kill('SIGTERM');
}
