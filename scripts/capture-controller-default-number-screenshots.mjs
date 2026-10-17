#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'artifacts', 'controller-default-number');
const port = process.env.MILKSHA_E2E_PORT || '8878';

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
  const base = `http://127.0.0.1:${port}/controller/`;
  for (let i = 0; i < 60; i += 1) {
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

try {
  const base = await waitForServer();
  const browser = await chromium.launch();
  const widths = [
    { name: '1920', width: 1920, height: 1080 },
    { name: '768', width: 768, height: 1024 },
    { name: '375', width: 375, height: 812 },
  ];
  for (const vp of widths) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${base}?mode=local`);
    await page.waitForSelector('[data-testid="quick-send-rule-note"]');
    await page.selectOption('[data-testid="fld-quick-source"]', 'fp');
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(outDir, `controller-quick-send-${vp.name}.png`),
      fullPage: false,
    });
    await page.close();
  }
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
