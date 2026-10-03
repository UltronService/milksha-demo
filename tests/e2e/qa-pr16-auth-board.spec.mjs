import { test, expect } from '@playwright/test';
import { urlsForMode, PORT_SITE, PORT_CLOUD } from './harness.mjs';

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

function firestoreCloudSettingsInitScript() {
  return () => {
    try {
      localStorage.clear();
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'fake-api-key-for-emulator',
          accessCode: 'fake-milksha-controller-access-code',
          region: 'asia-east1',
          useEmulator: true,
          gateway: `127.0.0.1:${PORT_SITE}`,
          emulatorPrefix: '__emulator',
        }),
      );
    } catch {
      /* ignore */
    }
  };
}

test('malformed cfg hash is removed from url', async ({ browser }) => {
  const { base } = urlsForMode('cloud');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/receiver-demo/?mode=cloud&store=s120030#cfg=%%%bad%%%`);
  await page.waitForTimeout(300);
  expect(page.url()).not.toMatch(/cfg=/);
  await ctx.close();
});

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

test('receiver remote reload after auth recheck without page.reload()', async ({ browser }) => {
  test.setTimeout(120000);
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, { method: 'POST' });
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      window.__testReloadFired = sessionStorage.getItem('__rcv_test_reload') === '1';
    } catch {
      window.__testReloadFired = false;
    }
  });
  await ctx.addInitScript(firestoreCloudSettingsInitScript());
  const receiver = await ctx.newPage();
  let devLoginAttempts = 0;
  await receiver.route('**/devLogin', async (route) => {
    devLoginAttempts += 1;
    if (devLoginAttempts <= 2) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_token', message: 'expired' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ customToken: 'e2e-custom-token' }),
    });
  });
  await receiver.route('**/accounts:signInWithCustomToken**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        idToken: 'e2e-fake-id-token',
        refreshToken: 'e2e-fake-refresh-token',
        expiresIn: 3600,
      }),
    });
  });
  await receiver.route('**/token?key=**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_token: 'e2e-fake-id-token',
        refresh_token: 'e2e-fake-refresh-token',
        expires_in: 3600,
      }),
    });
  });
  const url = `${recv}&testAuthRecheckMs=800&testDevicePollMs=400`;
  await receiver.goto(url);
  await expect(receiver.locator('#rcv-stage')).toHaveAttribute('data-auth-stopped', '1', {
    timeout: 5000,
  });
  await receiver.waitForFunction(
    () => document.getElementById('rcv-stage')?.getAttribute('data-auth-stopped') !== '1',
    null,
    { timeout: 15000 },
  );
  await receiver.waitForFunction(
    () =>
      typeof window.__receiverAuthBlockedForTests === 'function' &&
      !window.__receiverAuthBlockedForTests(),
    null,
    { timeout: 15000 },
  );
  const navigationReload = receiver.waitForEvent('framenavigated', { timeout: 45000 });
  const devCmdRes = await fetch(
    `http://127.0.0.1:${PORT_CLOUD}/fn/milksha-qms-dev/asia-east1/devCommand`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer e2e-fake-id-token',
      },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        type: 'reload',
        params: {},
      }),
    },
  );
  expect(devCmdRes.status).toBe(200);
  const kickPoll = receiver
    .evaluate(async () => {
      const cloud = window.receiverCloud;
      if (!cloud || !cloud.pollDeviceForTests) {
        throw new Error('pollDeviceForTests hook missing');
      }
      for (let i = 0; i < 20; i += 1) {
        await cloud.pollDeviceForTests();
        try {
          if (sessionStorage.getItem('__rcv_test_reload') === '1') {
            return;
          }
        } catch {
          /* ignore */
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })
    .catch(() => {
      /* navigation may interrupt evaluate */
    });
  await Promise.race([navigationReload, kickPoll]);
  await navigationReload;
  await receiver.waitForFunction(
    () => {
      try {
        return sessionStorage.getItem('__rcv_test_reload') === '1';
      } catch {
        return false;
      }
    },
    null,
    { timeout: 10000 },
  );
  expect(devLoginAttempts).toBeGreaterThanOrEqual(2);
  await ctx.close();
});
