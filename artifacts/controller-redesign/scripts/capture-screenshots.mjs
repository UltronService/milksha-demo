#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const artDir = join(root, 'artifacts', 'controller-redesign');
const port = process.env.MILKSHA_E2E_PORT || '8877';
const base = `http://127.0.0.1:${port}`;

mkdirSync(artDir, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['tests/e2e/web-server.mjs'], {
      cwd: root,
      env: { ...process.env, MILKSHA_E2E_PORT: port },
      stdio: 'inherit',
    });
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${base}/controller/`);
        if (res.ok) {
          clearInterval(timer);
          resolve(child);
        }
      } catch {
        /* retry */
      }
    }, 250);
    child.on('error', reject);
  });
}

async function shot(page, name) {
  await page.screenshot({ path: join(artDir, name), fullPage: true });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto(`${base}/controller/?mode=cloud&noCloudWarm=1`);
  await page.waitForSelector('[data-testid="fld-store"]');
  await shot(page, 'state-disconnected.png');

  await page.goto(`${base}/controller/?mode=local`);
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
  await shot(page, 'state-normal-connected.png');

  await page.locator('[data-testid="btn-send-numbers"]').click();
  await page.waitForTimeout(600);
  await shot(page, 'state-success-bar.png');

  await page.evaluate(() => {
    window.__controller.setDevCommandHandler(async () => {
      const err = new Error('mock send fail');
      err.status = 500;
      throw err;
    });
  });
  await page.locator('[data-testid="btn-send-numbers"]').click();
  await page.waitForTimeout(400);
  await shot(page, 'state-send-error.png');

  await page.locator('[data-testid="btn-clear-board-main"]').click();
  await shot(page, 'state-clear-confirm-dialog.png');

  await page.locator('[data-testid="btn-clear-cancel"]').click();
  await page.locator('[data-testid="zone-toggle-test-tools"]').click();
  await shot(page, 'state-test-section-open.png');

  await browser.close();
  server.kill('SIGTERM');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
