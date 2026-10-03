import { test, expect } from '@playwright/test';
import { urlsForMode, connectController, resetCloudState } from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();
const VIEW = { width: 1920, height: 1080 };

test.describe('guest board empty hint states', () => {
  test.beforeEach(async () => {
    await resetCloudState();
  });

  async function openPair(browser) {
    const { recv, ctrl } = urlsForMode('local');
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('__e2e_init')) {
          localStorage.clear();
          sessionStorage.setItem('__e2e_init', '1');
        }
        localStorage.setItem('milksha:accessCode', 'dev-controller-access-2026');
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
    await receiver.setViewportSize(VIEW);
    return { ctx, receiver, controller };
  }

  test('guest header shows store name only', async ({ browser }) => {
    const { ctx, receiver } = await openPair(browser);
    await expect(receiver.locator('#rcv-store-label')).toHaveText('迷客夏臺南東安店');
    const text = await receiver.locator('#rcv-stage').innerText();
    expect(text).not.toContain('s120030');
    expect(text).not.toMatch(/milkshas\d+/i);
    await ctx.close();
  });

  test('both-empty shows centered hint', async ({ browser }) => {
    const { ctx, receiver, controller } = await openPair(browser);
    await controller.click('#btn-clear-board');
    const hint = receiver.locator('#rcv-empty-board-hint');
    await expect(hint).toBeVisible({ timeout: 15000 });
    await expect(hint).toHaveText('目前沒有號碼');
    await expect(receiver.locator('.rcv-ready .rcv-ztitle')).toContainText('可取餐');
    await expect(receiver.locator('.rcv-prep .rcv-ztitle')).toContainText('製作中');
    await ctx.close();
  });

  test('one-empty hides hint and leaves other column blank', async ({ browser }) => {
    const { ctx, receiver, controller } = await openPair(browser);
    await controller.click('#btn-clear-board');
    await controller.fill('#fld-no', '9201');
    await controller.selectOption('#fld-status', 'ready');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '9201' })).toBeVisible({
      timeout: 15000,
    });
    await expect(receiver.locator('#rcv-empty-board-hint')).toBeHidden();
    await expect(receiver.locator('#rcv-grid-prep')).toBeHidden();
    await expect(receiver.locator('.rcv-prep .rcv-num').filter({ hasText: /\S/ })).toHaveCount(0);
    await receiver.screenshot({ path: `${ART}/board-ready-only-prep-empty-1920.png`, fullPage: false });
    await ctx.close();
  });

  test('none-empty hides hint immediately', async ({ browser }) => {
    const { ctx, receiver, controller } = await openPair(browser);
    await controller.fill('#fld-no', '9301');
    await controller.selectOption('#fld-status', 'ready');
    await controller.click('#btn-add-ticket');
    await controller.fill('#fld-no', '9302');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('#rcv-empty-board-hint')).toBeHidden();
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '9301' })).toBeVisible({
      timeout: 15000,
    });
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '9302' })).toBeVisible({
      timeout: 15000,
    });
    await ctx.close();
  });
});
