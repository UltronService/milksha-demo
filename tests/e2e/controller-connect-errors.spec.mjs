import { test, expect } from '@playwright/test';
import { urlsForMode, PORT_SITE } from './harness.mjs';

const MSG_401 = '存取碼錯誤。請重新確認，再連線。';
const MSG_403 = '這個帳號沒有這間店的權限。請檢查店號。';
const MSG_CLOUD = '雲端暫時出錯。請稍後再連線。';

async function openFirestoreConnectForm(page, host) {
  await page.goto(urlsForMode('firestore').ctrl);
  await page.selectOption('#fld-mode', 'firestore');
  await page.evaluate(
    ({ host, key, code }) => {
      const adv = document.getElementById('advanced-settings');
      if (adv) adv.open = true;
      const g = document.getElementById('fld-gateway');
      const k = document.getElementById('fld-cloud-apikey');
      const p = document.getElementById('fld-cloud-project');
      const c = document.getElementById('fld-code');
      const emu = document.getElementById('fld-use-emulator');
      if (g) g.value = host;
      if (k) k.value = key;
      if (p) p.value = 'milksha-qms-dev';
      if (c) c.value = code;
      if (emu) emu.checked = true;
    },
    {
      host,
      key: 'fake-api-key-for-emulator',
      code: 'fake-milksha-controller-access-code',
    },
  );
}

test('controller connect 401 shows access code alert', async ({ browser }) => {
  const ctx = await browser.newContext();
  const controller = await ctx.newPage();
  await controller.route('**/devLogin', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'invalid_access_code', message: 'wrong code' }),
    });
  });
  await openFirestoreConnectForm(controller, `127.0.0.1:${PORT_SITE}`);
  await controller.click('#btn-connect');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_401, { timeout: 10000 });
  await expect(controller.getByTestId('command-error-detail')).not.toHaveText('');
  await controller.locator('details').filter({ hasText: '詳細內容' }).click();
  await expect(controller.getByTestId('command-error-detail')).toContainText('401');
  await ctx.close();
});

test('controller connect 403 shows permission alert', async ({ browser }) => {
  const ctx = await browser.newContext();
  const controller = await ctx.newPage();
  await controller.route('**/devLogin', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'forbidden', message: 'no store access' }),
    });
  });
  await openFirestoreConnectForm(controller, `127.0.0.1:${PORT_SITE}`);
  await controller.click('#btn-connect');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_403, { timeout: 10000 });
  await ctx.close();
});

test('controller connect network error shows cloud retry alert', async ({ browser }) => {
  const ctx = await browser.newContext();
  const controller = await ctx.newPage();
  await controller.route('**/devLogin', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'unavailable', message: 'upstream down' }),
    });
  });
  await openFirestoreConnectForm(controller, `127.0.0.1:${PORT_SITE}`);
  await controller.click('#btn-connect');
  await expect(controller.getByTestId('command-error-message')).toHaveText(MSG_CLOUD, { timeout: 10000 });
  await ctx.close();
});
