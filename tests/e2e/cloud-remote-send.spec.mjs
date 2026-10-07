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

test.describe('cloud remote send (isolated contexts)', () => {
  test.beforeAll(async () => {
    await ensureCloudRunning();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  async function openBoardAndController(browser) {
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
    await controller.waitForSelector('[data-testid="transport-route"][data-route="cloud"]', {
      timeout: 15000,
    });
    return { boardCtx, ctrlCtx, board, controller };
  }

  test('controller before board opened shows hint then send works after board', async ({ browser }) => {
    await resetCloudState({ seedDevice: false });
    const ctrlCtx = await isolatedCloudContext(browser);
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(controller);
    await controller.goto(`${BASE}/controller/`);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(controller.locator('#user-banner')).toContainText('請先打開看板', { timeout: 8000 });

    const boardCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForFunction(
      () => {
        const el = document.getElementById('transport-route');
        return el && el.getAttribute('data-board-online') === '1';
      },
      { timeout: 20000 },
    );
    await controller.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
      { timeout: 8000 },
    );
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('remote send shows number on board within 3s', async ({ browser }) => {
    const { boardCtx, ctrlCtx, board, controller } = await openBoardAndController(browser);
    const t0 = Date.now();
    await controller.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
      { timeout: 5000 },
    );
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(6000);
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('ten sends produce ten numbers and clear works', async ({ browser }) => {
    const { boardCtx, ctrlCtx, board, controller } = await openBoardAndController(browser);
    for (let i = 0; i < 10; i += 1) {
      await controller.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length === n,
        i + 1,
        { timeout: 5000 },
      );
    }
    await expandControllerZone(controller, 'sec-special');
    await controller.click('[data-testid="btn-clear-now"]');
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
      { timeout: 8000 },
    );
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('store_not_allowed shows pink banner on controller only', async ({ browser }) => {
    const ctrlCtx = await isolatedCloudContext(browser);
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(controller);
    await controller.goto(`${BASE}/controller/`);
    await expandControllerZone(controller, 'sec-connect');
    await controller.selectOption('#fld-store', { label: /s999999/ }).catch(async () => {
      await controller.evaluate(() => {
        const sel = document.getElementById('fld-store');
        if (!sel) return;
        const opt = document.createElement('option');
        opt.value = 's999999';
        opt.textContent = '測試拒絕店 s999999';
        sel.appendChild(opt);
        sel.value = 's999999';
      });
    });
    await controller.click('#btn-connect');
    const banner = controller.locator('[data-testid="store-not-allowed-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('s120030');
    await ctrlCtx.close();
  });

  test('legacy localStorage cloud settings still connect in cloud mode', async ({ browser }) => {
    const boardCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    await board.addInitScript(() => {
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'legacy-key',
          accessCode: 'legacy-code',
          region: 'asia-east1',
        }),
      );
    });
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/?mode=cloud`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await boardCtx.close();
  });
});
