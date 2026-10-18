import { test, expect } from '@playwright/test';
import {
  ensureCloudRunning,
  resetCloudState,
  startSite,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  expandControllerZone,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const FULL_BG = process.env.PR22_FULL_QA === '1';

test.describe('PR22 cloud QA checklist (fake-cloud routed as prod)', () => {
  test.beforeAll(async () => {
    await ensureCloudRunning();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('default route is 雲端 on controller', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/`);
    await expect(page.locator('#fld-mode')).toHaveValue('cloud');
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await expect(page.locator('[data-testid="transport-route"]')).toHaveAttribute('data-route', 'cloud');
    await expect(page.locator('[data-testid="transport-route"]')).toContainText('雲端');
    await ctx.close();
  });

  test('local mode fallback still connects', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const controller = await ctx.newPage();
    await board.goto(`${BASE}/?mode=local`);
    await controller.goto(`${BASE}/controller/?mode=local`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
    await ctx.close();
  });

  test('network cable pull and restore without duplicate ready numbers', async ({ browser }) => {
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(`${BASE}/`);
    await controller.goto(`${BASE}/controller/`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length === 1,
      { timeout: 8000 },
    );
    await expandControllerZone(controller, 'sec-net');
    await controller.click('#btn-cable-pull');
    await controller.click('#btn-cable-restore');
    await controller.click('[data-testid="btn-send-numbers"]');
    await board.waitForTimeout(2000);
    const nums = await board.locator('.milksha-ready .milksha-num').allTextContents();
    expect(nums.length).toBe(2);
    expect(new Set(nums).size).toBe(nums.length);
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('section buttons respond or show Chinese banner in cloud mode', async ({ browser }) => {
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(`${BASE}/`);
    await controller.goto(`${BASE}/controller/`);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await expandControllerZone(controller, 'sec-pos');
    await controller.click('#btn-add-ticket');
    await expect(controller.locator('#log-list li').first()).toContainText(/push_numbers|叫號/, {
      timeout: 12000,
    });
    await controller.click('#btn-one-ready');
    await expect(controller.locator('#log-list li').first()).toContainText(/一鍵|叫號|沒有|push_numbers/, {
      timeout: 12000,
    });
    await expandControllerZone(controller, 'sec-net');
    await controller.click('#btn-offline');
    await expect(controller.locator('#log-list li').first()).toContainText(/指令 simulate_offline|offline/, {
      timeout: 12000,
    });
    await expandControllerZone(controller, 'sec-special');
    await controller.click('#btn-clear-now');
    await expect(controller.locator('#log-list li').first()).toContainText(/指令 clear_now|清空/, {
      timeout: 12000,
    });
    await controller.click('#btn-reload');
    await expect(controller.locator('#log-list li').first()).toContainText(/指令 reload/, { timeout: 12000 });
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('board background tab receives send after long idle', async ({ browser }) => {
    test.setTimeout(FULL_BG ? 420000 : 150000);
    const idleMs = FULL_BG ? 360000 : 70000;
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(`${BASE}/`);
    await controller.goto(`${BASE}/controller/`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.bringToFront();
    await board.waitForTimeout(idleMs);
    await controller.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
      { timeout: 8000 },
    );
    await boardCtx.close();
    await ctrlCtx.close();
  });
});
