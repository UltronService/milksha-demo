import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, waitForReceiverOnline } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test('one quick send click adds exactly one ready number', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  await board.goto(`${BASE}/`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  let applyCount = 0;
  await board.evaluate(() => {
    const rt = window.QMS.runtime;
    const prev = rt.applyPayload.bind(rt);
    window.__qaApplyCount = 0;
    rt.applyPayload = function (...args) {
      window.__qaApplyCount += 1;
      return prev(...args);
    };
  });

  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 8000 });
  await expect(board.locator('.milksha-prep .milksha-num')).toHaveCount(0);

  const posCalls = await controller.evaluate(() => {
    return window.__controllerTelemetry?.lastPosResponse?.isSuccess;
  });
  expect(posCalls).toBe(true);

  await ctx.close();
});

test('ten quick sends yield ten ready numbers; clear board works', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(() => {
    localStorage.setItem('milksha:deviceId', 'stb-old-99');
  });
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  await board.goto(`${BASE}/`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  for (let i = 0; i < 10; i += 1) {
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(i + 1, { timeout: 8000 });
  }

  await controller.locator('[data-testid="zone-toggle-pos"]').click();
  await controller.click('[data-testid="btn-clear-board"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 8000 });
  await ctx.close();
});
