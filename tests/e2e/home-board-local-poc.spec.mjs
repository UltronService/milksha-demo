import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, waitForReceiverOnline } from './harness.mjs';

test('home board local POC: one button send shows numbers and board online', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const base = `http://127.0.0.1:${PORT_SITE}`;

  await board.goto(`${base}/`);
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

  await controller.goto(`${base}/controller/`);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');

  await controller.click('[data-testid="btn-send-numbers"]');

  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 5000 });
  await expect(board.locator('.milksha-prep .milksha-num')).toHaveCount(0);
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 5000 });

  await ctx.close();
});
