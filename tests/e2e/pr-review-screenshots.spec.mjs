import { test, expect } from '@playwright/test';
import { connectController, resetCloudState, urlsForMode } from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();
const VIEW = { width: 1920, height: 1080 };

const MSG_401 = '登入已過期。請重新登入，再送出指令。';
const MSG_403 = '這個帳號沒有這間店的權限。請檢查店號。';

async function openNetZone(controller) {
  await controller.evaluate(() => {
    const zone = document.getElementById('sec-net');
    if (!zone) return;
    const body = zone.querySelector('.zone-body');
    const toggle = zone.querySelector('.zone-toggle');
    if (body) body.hidden = false;
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  });
  await expect(controller.locator('#btn-restore')).toBeVisible();
}

async function rejectDevCommand(controller, status, response) {
  await controller.evaluate(
    ({ status, response }) => {
      window.__controller.setDevCommandHandler(async () => {
        const err = new Error('devCommand');
        err.status = status;
        err.response = response;
        throw err;
      });
    },
    { status, response },
  );
}

test('PR review screenshots at 1920x1080', async ({ browser }) => {
  const { recv, ctrl } = urlsForMode('local');
  await resetCloudState();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('__e2e_init')) {
        localStorage.clear();
        localStorage.setItem('__e2e_init', '1');
      }
      localStorage.setItem('milksha:accessCode', 'fake-milksha-controller-access-code');
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
  await controller.click('#btn-clear-board');
  await expect(receiver.locator('#rcv-empty-board-hint')).toBeVisible({ timeout: 15000 });
  await receiver.screenshot({ path: `${ART}/board-empty-1920.png`, fullPage: false });
  for (let i = 0; i < 12; i += 1) {
    await controller.fill('#fld-no', String(7100 + i));
    await controller.selectOption('#fld-status', 'ready');
    await controller.selectOption('#fld-source', 'store');
    await controller.click('#btn-add-ticket');
  }
  for (let i = 0; i < 18; i += 1) {
    await controller.fill('#fld-no', String(8100 + i));
    await controller.selectOption('#fld-status', 'preparing');
    await controller.selectOption('#fld-source', 'store');
    await controller.click('#btn-add-ticket');
  }
  await expect(receiver.locator('.rcv-ready .rcv-num').filter({ hasText: /\S/ })).toHaveCount(12, {
    timeout: 30000,
  });
  await expect(receiver.locator('.rcv-prep .rcv-num').filter({ hasText: /\S/ })).toHaveCount(18, {
    timeout: 30000,
  });
  await expect(receiver.locator('#rcv-empty-board-hint')).toBeHidden();
  await receiver.waitForTimeout(400);
  await receiver.screenshot({ path: `${ART}/board-full-12-18-1920.png`, fullPage: false });

  await controller.setViewportSize(VIEW);
  await openNetZone(controller);

  await rejectDevCommand(controller, 403, { code: 'forbidden', message: 'no permission for this store' });
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_403);
  await controller.screenshot({ path: `${ART}/controller-alert-403-1920.png`, fullPage: false });
  await controller.getByTestId('command-error-close').click();

  await rejectDevCommand(controller, 401, { code: 'invalid_token', message: 'login expired, please sign in again' });
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_401);
  await controller.locator('details').filter({ hasText: '詳細內容' }).click();
  await controller.screenshot({ path: `${ART}/controller-alert-401-detail-1920.png`, fullPage: false });
  await controller.getByTestId('command-error-close').click();

  await controller.evaluate(() => {
    window.__controller.setDevCommandHandler(
      () =>
        new Promise((resolve) => {
          window.__releaseDevCommand = () => resolve({ ok: true, commandId: 'cmd-shot' });
        }),
    );
  });
  await controller.click('#btn-restore');
  await expect(controller.locator('#btn-restore')).toBeDisabled();
  await controller.screenshot({ path: `${ART}/controller-command-in-flight-1920.png`, fullPage: false });
  await controller.evaluate(() => window.__releaseDevCommand());
  await expect(controller.locator('#btn-restore')).toBeEnabled({ timeout: 10000 });

  await ctx.close();
});
