import { test, expect } from '@playwright/test';
import { urlsForMode, connectController, resetCloudState } from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();

test('guest board empty state keeps zone headers and hint', async ({ browser }) => {
  const { recv, ctrl } = urlsForMode('local');
  await resetCloudState();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_init')) {
        localStorage.clear();
        sessionStorage.setItem('__e2e_init', '1');
      }
    } catch {
      /* ignore */
    }
  });
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();

  await receiver.goto(recv);
  await controller.goto(ctrl);
  await connectController(controller, 'local');
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 20000 });

  await controller.selectOption('#fld-source', 'store');
  await controller.fill('#fld-no', '8801');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '8801' })).toBeVisible({
    timeout: 15000,
  });

  await expect(receiver.locator('#rcv-empty-board-hint')).toBeHidden();

  await controller.click('#btn-clear-board');
  await expect(receiver.locator('#rcv-empty-board-hint')).toBeVisible({ timeout: 15000 });
  await expect(receiver.locator('#rcv-empty-board-hint')).toHaveText('目前沒有號碼');
  await expect(receiver.locator('.rcv-ready .rcv-ztitle')).toContainText('可取餐');
  await expect(receiver.locator('.rcv-prep .rcv-ztitle')).toContainText('製作中');
  await expect(receiver.locator('.rcv-ready .rcv-num').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(receiver.locator('.rcv-prep .rcv-num').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(receiver.locator('#rcv-grid-ready')).toBeHidden();
  await expect(receiver.locator('#rcv-grid-prep')).toBeHidden();

  await receiver.setViewportSize({ width: 1366, height: 768 });
  await receiver.waitForTimeout(300);
  await receiver.screenshot({ path: `${ART}/board-empty-state-1366.png`, fullPage: false });

  await ctx.close();
});
