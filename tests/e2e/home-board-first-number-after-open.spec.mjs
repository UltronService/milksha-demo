import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restartCloud,
  startSite,
  stopSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 'zz-qa-store-a';

test.describe('home board before first today_board exists', () => {
  test.beforeAll(async () => {
    process.env.MILKSHA_SITE_ROOT = SITE_ROOT;
    execSync('fuser -k 8877/tcp 2>/dev/null || true', { stdio: 'ignore' });
    await restartCloud();
    stopSite();
    await startSite();
  });

  test('fake-cloud: board open then first send shows number within 3s', async ({ browser }) => {
    test.setTimeout(60000);
    await resetCloudState({ seedDevice: true });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);

    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 3000,
    });
    const elapsedMs = Date.now() - t0;
    expect(elapsedMs).toBeLessThan(3000);
    await ctx.close();
  });
});
