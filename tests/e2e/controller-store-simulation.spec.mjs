import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

async function openLocalPocController(browser) {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(
    () =>
      Boolean(
        window.QMS &&
          window.QMS.runtime &&
          typeof window.QMS.runtime.applyPayload === 'function' &&
          window.receiverCloud,
      ),
    { timeout: 25000 },
  );
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');
  return { ctx, board, controller };
}

test('continuous simulation normal: board sync and stop', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, board, controller } = await openLocalPocController(browser);
  await controller.locator('[data-testid="zone-toggle-pos"]').click();
  await controller.click('[data-testid="btn-gen-normal"]');
  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/運行中/, { timeout: 5000 });
  await expect(board.locator('.milksha-prep .milksha-num, .milksha-ready .milksha-num').first()).toBeVisible({
    timeout: 30000,
  });
  await controller.click('[data-testid="btn-sim-stop"]');
  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/已停止/);
  const prepCount = await board.locator('.milksha-prep .milksha-num').count();
  await controller.waitForTimeout(3000);
  const prepAfter = await board.locator('.milksha-prep .milksha-num').count();
  expect(prepAfter).toBe(prepCount);
  await ctx.close();
});

test('peak simulation can switch from normal without duplicate run', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, controller } = await openLocalPocController(browser);
  await controller.locator('[data-testid="zone-toggle-pos"]').click();
  await controller.click('[data-testid="btn-gen-normal"]');
  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/一般/);
  await controller.click('[data-testid="btn-gen-peak"]');
  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/尖峰/);
  await controller.click('[data-testid="btn-sim-stop"]');
  await ctx.close();
});
