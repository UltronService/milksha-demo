import { test, expect } from '@playwright/test';
import { urlsForMode } from './harness.mjs';

function cloudSettingsInitScript() {
  return () => {
    try {
      localStorage.clear();
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'e2e-placeholder-key',
          accessCode: 'fake-milksha-controller-access-code',
          region: 'asia-east1',
          useEmulator: false,
          gateway: '',
        }),
      );
    } catch {
      /* ignore */
    }
  };
}

test('receiver ignores ?code= query param for access code', async ({ browser }) => {
  const { base } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  let devLoginBodies = [];
  await receiver.route('**/devLogin', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    devLoginBodies.push(body);
    await route.continue();
  });
  await receiver.goto(
    `${base}/receiver-demo/?mode=firestore&store=s120030&device=stb-01&code=evil-code`,
  );
  await receiver.waitForTimeout(1500);
  expect(devLoginBodies.length).toBeGreaterThan(0);
  expect(devLoginBodies[0].accessCode).toBe('fake-milksha-controller-access-code');
  await ctx.close();
});

test('receiver auth 401 retries once then stops', async ({ browser }) => {
  const { base } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  let attempts = 0;
  await receiver.route('**/devLogin', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'invalid_token', message: 'expired' }),
    });
  });
  await receiver.goto(`${base}/receiver-demo/?mode=firestore&store=s120030&device=stb-01`);
  await receiver.waitForTimeout(2000);
  expect(attempts).toBe(2);
  await expect(receiver.locator('#rcv-stage')).toHaveAttribute('data-auth-stopped', '1');
  await ctx.close();
});

test('receiver auth 403 does not retry devLogin', async ({ browser }) => {
  const { base } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  let attempts = 0;
  await receiver.route('**/devLogin', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'forbidden', message: 'no access' }),
    });
  });
  await receiver.goto(`${base}/receiver-demo/?mode=firestore&store=s120030&device=stb-01`);
  await receiver.waitForTimeout(2000);
  expect(attempts).toBe(1);
  await expect(receiver.locator('#rcv-stage')).toHaveAttribute('data-auth-stopped', '1');
  await ctx.close();
});
