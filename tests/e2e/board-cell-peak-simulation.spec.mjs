import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';
import { primeBoardForAnimation, sampleIntegrityForDuration } from './board-animation-helpers.mjs';

const PEAK_RUN_MS = Number(process.env.BOARD_PEAK_INTEGRITY_MS || 180000);

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
  await board.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');
  return { ctx, board, controller };
}

test.describe('board cell integrity under peak simulation', () => {
  test('3-min peak run: sampled cells, detached drain, no dup numbers', async ({ browser }) => {
    test.setTimeout(PEAK_RUN_MS + 120000);
    const { ctx, board, controller } = await openLocalPocController(browser);
    await controller.locator('[data-testid="zone-toggle-pos"]').click();
    await controller.click('[data-testid="btn-gen-peak"]');
    await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/尖峰|運行/, { timeout: 10000 });
    const stats = await sampleIntegrityForDuration(board, PEAK_RUN_MS, 250);
    expect(stats.peakDetached).toBeLessThanOrEqual(16);
    expect(stats.finalDetached).toBe(0);
    await controller.click('[data-testid="btn-sim-stop"]');
    await controller.waitForTimeout(500);
    const afterStop = await sampleIntegrityForDuration(board, 5000, 250);
    expect(afterStop.finalDetached).toBe(0);
    await ctx.close();
  });
});

test('primed board only: integrity helpers smoke', async ({ page }) => {
  await primeBoardForAnimation(page);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '1234' }]);
  });
  await page.waitForTimeout(100);
  const stats = await sampleIntegrityForDuration(page, 2000, 100);
  expect(stats.finalDetached).toBe(0);
});
