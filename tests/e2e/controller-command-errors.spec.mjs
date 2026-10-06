import { test, expect } from '@playwright/test';
import { connectController, urlsForMode } from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();
const MSG_401 = '登入已過期。請重新登入，再送出指令。';
const MSG_403 = '這個帳號沒有這間店的權限。請檢查店號。';
const MSG_404 = '請先打開看板';
const MSG_400 = '指令內容不正確。請檢查欄位，再送出。';
const MSG_DEVICE_ID = '裝置編號格式不對。請檢查後再送出。';
const MSG_500 = '雲端暫時出錯。請稍後再送一次。';

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
      const ok = window.__controller.setDevCommandHandler(async () => {
        const err = new Error('devCommand');
        err.status = status;
        err.response = response;
        throw err;
      });
      if (!ok) {
        throw new Error('setDevCommandHandler failed');
      }
    },
    { status, response },
  );
}

test('controller | devCommand error alerts and in-flight lock', async ({ browser }) => {
  const { ctrl } = urlsForMode('local');
  const ctx = await browser.newContext();
  const controller = await ctx.newPage();
  await controller.goto(ctrl);
  await connectController(controller, 'local');
  await expect(controller.locator('#online-state')).toContainText('已連線', { timeout: 20000 });
  await openNetZone(controller);

  await rejectDevCommand(controller, 403, { code: 'forbidden', message: 'no permission for this store' });
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_403);
  await controller.screenshot({ path: `${ART}/controller-alert-403.png`, fullPage: false });
  await controller.getByTestId('command-error-close').click();

  await rejectDevCommand(controller, 401, { code: 'invalid_token', message: 'login expired, please sign in again' });
  await controller.click('#btn-restore');
  const alert = controller.getByTestId('command-error-alert');
  await expect(alert).toBeVisible();
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_401);
  await expect(controller.getByTestId('command-error-message')).not.toContainText('401');
  await controller.screenshot({ path: `${ART}/controller-alert-401.png`, fullPage: false });

  await rejectDevCommand(controller, 404, { code: 'device_not_found', message: 'device not found' });
  await controller.getByTestId('command-error-close').click();
  await expect(alert).toBeHidden();
  await controller.click('#btn-restore');
  await expect(alert).toBeVisible();
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_404);
  await controller.screenshot({ path: `${ART}/controller-alert-404.png`, fullPage: false });

  await controller.evaluate(() => {
    const adv = document.getElementById('advanced-settings');
    if (adv) adv.open = true;
  });
  await controller.fill('#fld-device', 'bad device');
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_DEVICE_ID);
  const detailDevice = await controller.getByTestId('command-error-detail').textContent();
  expect(detailDevice).toMatch(/400/);
  expect(detailDevice).not.toMatch(/Bearer|idToken|POS/i);
  await controller.screenshot({ path: `${ART}/controller-alert-invalid-device-id.png`, fullPage: false });

  await controller.getByTestId('command-error-close').click();
  await controller.fill('#fld-device', 'stb-01');
  await rejectDevCommand(controller, 400, { code: 'invalid_command_params', message: 'bad params' });
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_400);
  await expect(controller.getByTestId('command-error-message')).not.toContainText('bad params');
  const detail400 = await controller.getByTestId('command-error-detail').textContent();
  expect(detail400).toMatch(/bad params/);
  await controller.screenshot({ path: `${ART}/controller-alert-400.png`, fullPage: false });

  await rejectDevCommand(controller, 500, { code: 'internal_error', message: 'An internal error occurred.' });
  await controller.getByTestId('command-error-close').click();
  await controller.click('#btn-restore');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_500);
  await controller.screenshot({ path: `${ART}/controller-alert-500.png`, fullPage: false });

  await controller.fill('#fld-device', 'stb-01');
  await controller.evaluate(() => {
    const ok = window.__controller.setDevCommandHandler(
      () =>
        new Promise((resolve) => {
          window.__releaseDevCommand = () => resolve({ ok: true, commandId: 'cmd-e2e' });
        }),
    );
    if (!ok) {
      throw new Error('setDevCommandHandler failed');
    }
  });
  await controller.click('#btn-restore');
  await expect(controller.locator('#btn-restore')).toBeDisabled();
  expect(await controller.evaluate(() => window.__controllerTelemetry.isCommandInFlight())).toBe(true);
  await controller.evaluate(() => window.__releaseDevCommand());
  await expect(controller.locator('#btn-restore')).toBeEnabled({ timeout: 10000 });

  await ctx.close();
});
