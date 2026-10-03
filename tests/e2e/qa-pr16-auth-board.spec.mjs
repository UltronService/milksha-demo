import { test, expect } from '@playwright/test';
import { urlsForMode, PORT_SITE, PORT_CLOUD, ensureCloudRunning } from './harness.mjs';

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
      if (!sessionStorage.getItem('__e2e_firestore_cloud_settings')) {
        sessionStorage.setItem('__e2e_firestore_cloud_settings', '1');
        localStorage.clear();
      }
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

const BOOT_HTTP_DATE = 'Sat, 03 Oct 2026 12:00:00 GMT';
const AFTER_BOOT_CREATED_AT = '2026-10-03T12:00:01.000Z';
const STALE_CREATED_AT = '2020-01-01T12:00:00.000Z';

async function seedPendingReload(createdAt, id) {
  await ensureCloudRunning();
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/devicePendingCommand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: 's120030',
      deviceId: 'stb-01',
      id: id || `cmd-${createdAt}`,
      type: 'reload',
      createdAt,
      params: {},
    }),
  });
  expect(res.ok).toBe(true);
}

async function wireFirestoreAuthRoutes(receiver, options = {}) {
  const bootDate = options.bootDate || BOOT_HTTP_DATE;
  const auth401First = Boolean(options.auth401First);
  let devLoginAttempts = 0;
  await receiver.route('**/devLogin', async (route) => {
    devLoginAttempts += 1;
    if (auth401First && devLoginAttempts <= 2) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_token', message: 'expired' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { Date: bootDate },
      contentType: 'application/json',
      body: JSON.stringify({ customToken: 'e2e-custom-token' }),
    });
  });
  await receiver.route('**/accounts:signInWithCustomToken**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { Date: bootDate },
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
  return {
    getDevLoginAttempts: () => devLoginAttempts,
  };
}

async function waitReceiverCloudReady(receiver) {
  await receiver.waitForFunction(
    () =>
      window.receiverCloud &&
      typeof window.receiverCloud.pollDeviceForTests === 'function',
    null,
    { timeout: 20000 },
  );
}

async function kickDevicePoll(receiver) {
  await receiver
    .evaluate(async () => {
      for (let i = 0; i < 25; i += 1) {
        await window.receiverCloud.pollDeviceForTests();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    })
    .catch(() => {
      /* reload may interrupt */
    });
}

async function expectNoNavigationFor(receiver, ms) {
  let extra = 0;
  const onNav = () => {
    extra += 1;
  };
  receiver.on('framenavigated', onNav);
  await receiver.waitForTimeout(ms);
  receiver.off('framenavigated', onNav);
  expect(extra).toBe(0);
}

test('receiver skips stale pending reload when localStorage cleared', async ({ browser }) => {
  test.setTimeout(90000);
  await ensureCloudRunning();
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, { method: 'POST' });
  await seedPendingReload(STALE_CREATED_AT, 'stale-reload-cmd');
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await ctx.addInitScript(firestoreCloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await wireFirestoreAuthRoutes(receiver);
  let loadCount = 0;
  receiver.on('framenavigated', () => {
    loadCount += 1;
  });
  await receiver.goto(`${recv}&testDevicePollMs=400`);
  await waitReceiverCloudReady(receiver);
  await kickDevicePoll(receiver);
  await receiver.waitForTimeout(15000);
  expect(loadCount).toBe(1);
  await ctx.close();
});

test('receiver runs post-boot reload command exactly once', async ({ browser }) => {
  test.setTimeout(90000);
  await ensureCloudRunning();
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, { method: 'POST' });
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext();
  await ctx.addInitScript(firestoreCloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await wireFirestoreAuthRoutes(receiver);
  await receiver.goto(`${recv}&testDevicePollMs=400`);
  await waitReceiverCloudReady(receiver);
  await seedPendingReload(AFTER_BOOT_CREATED_AT, 'post-boot-reload');
  const firstReload = receiver.waitForEvent('framenavigated', { timeout: 45000 });
  await kickDevicePoll(receiver);
  await firstReload;
  await expectNoNavigationFor(receiver, 15000);
  await ctx.close();
});

test('receiver reloads once when fake cloud never clears pendingCommand', async ({ browser }) => {
  test.setTimeout(90000);
  await ensureCloudRunning();
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, { method: 'POST' });
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/pendingCommandMode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearOnAck: false }),
  });
  const { recv, base } = urlsForMode('firestore');
  const deviceUrl =
    `${base}/__emulator/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/devices/stb-01`;
  const ctx = await browser.newContext();
  await ctx.addInitScript(firestoreCloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await wireFirestoreAuthRoutes(receiver);
  await receiver.goto(`${recv}&testDevicePollMs=400`);
  await waitReceiverCloudReady(receiver);
  await seedPendingReload(AFTER_BOOT_CREATED_AT, 'keep-pending-reload');
  const firstReload = receiver.waitForEvent('framenavigated', { timeout: 45000 });
  await kickDevicePoll(receiver);
  await firstReload;
  await expectNoNavigationFor(receiver, 15000);
  const pendingRes = await fetch(deviceUrl, {
    headers: { Authorization: 'Bearer e2e-fake-id-token' },
  });
  const pendingDoc = await pendingRes.json();
  expect(Boolean(pendingDoc.fields && pendingDoc.fields.pendingCommand)).toBe(true);
  await ctx.close();
});
