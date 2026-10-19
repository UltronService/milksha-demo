import { test, expect } from '@playwright/test';
import { clickControllerDevButton, clickControllerDevButtonByTestId, freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

test('local quick send: store 1234 and uber AB12C are two ready cells', async ({ browser }) => {
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
  await clickControllerDevButtonByTestId(controller, 'btn-send-numbers');
  await controller.selectOption('[data-testid="fld-quick-source"]', 'uber');
  await controller.fill('[data-testid="fld-quick-no"]', 'AB12C');
  await clickControllerDevButtonByTestId(controller, 'btn-send-numbers');

  await expect(board.locator('.milksha-ready .milksha-num', { hasText: '1234' })).toHaveCount(1, {
    timeout: 8000,
  });
  await expect(board.locator('.milksha-ready .milksha-num', { hasText: 'AB12C' })).toHaveCount(1, {
    timeout: 8000,
  });
  await ctx.close();
});

test('v2 quick send: non-digit store number sends and renders on board', async ({ browser }) => {
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
  const ruleNote = controller.locator('[data-testid="quick-send-rule-note"]');
  await expect(controller.locator('[data-testid="btn-send-numbers"]')).toBeEnabled();
  await expect(ruleNote).toBeVisible();
  await expect(ruleNote).not.toHaveClass(/is-error/);
  await expect(ruleNote).toContainText(/原樣送出/);
  await clickControllerDevButtonByTestId(controller, 'btn-send-numbers');
  await expect(board.locator('.milksha-ready .milksha-num', { hasText: 'abc' })).toHaveCount(1, {
    timeout: 8000,
  });
  await ctx.close();
});
