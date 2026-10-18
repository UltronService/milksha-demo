import { test, expect } from '@playwright/test';
import { urlsLocalHomePoc, freshContext, waitForReceiverOnline } from './harness.mjs';

test('local quick send: store 1234 and uber 1234 are two ready cells', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  await controller.selectOption('[data-testid="fld-quick-source"]', 'store');
  await controller.fill('[data-testid="fld-quick-no"]', '1234');
  await controller.click('[data-testid="btn-send-numbers"]');
  await controller.selectOption('[data-testid="fld-quick-source"]', 'uber');
  await controller.fill('[data-testid="fld-quick-no"]', '1234');
  await controller.click('[data-testid="btn-send-numbers"]');

  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(2, { timeout: 8000 });
  await ctx.close();
});

test('invalid quick send shows red error and does not add board cell', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  await controller.selectOption('[data-testid="fld-quick-source"]', 'store');
  await controller.fill('[data-testid="fld-quick-no"]', 'abc');
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(controller.locator('[data-testid="quick-send-error"]')).toBeVisible();
  await expect(controller.locator('[data-testid="quick-send-error"]')).toContainText(/4 位數字/);
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0);
  await ctx.close();
});
