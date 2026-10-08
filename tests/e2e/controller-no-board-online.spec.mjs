import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline, resetCloudState } from './harness.mjs';

test('local-link: controller-only shows offline; send fails until board opens', async ({ browser }) => {
  test.setTimeout(90000);
  await resetCloudState();
  const ctx = await freshContext(browser);
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await controller.goto(ctrlUrl);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await expect(controller.locator('#online-state')).not.toContainText('在線');
  await expect(controller.locator('#online-state')).toContainText(/離線|未知/);

  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(controller.locator('[data-testid="user-banner"]')).toContainText('請先打開看板', {
    timeout: 8000,
  });
  const posFail = await controller.evaluate(() => window.__controllerTelemetry.lastPosResponse);
  expect(posFail && (posFail.isSuccess === false || posFail.boxOnline === false)).toBe(true);
  expect(String(posFail && posFail.information)).toMatch(/機台|尚未連線/);

  const board = await ctx.newPage();
  await board.goto(boardUrl);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await waitForReceiverOnline(board, 'local');

  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 15000 });

  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 15000 });
  const posOk = await controller.evaluate(() => window.__controllerTelemetry.lastPosResponse);
  expect(posOk && posOk.isSuccess).toBe(true);

  await ctx.close();
});
