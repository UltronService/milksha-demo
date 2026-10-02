import { test, expect } from '@playwright/test';
import {
  startCloud,
  waitCloudReady,
  startSite,
  stopHarness,
  urlsForMode,
  connectController,
  resetCloudState,
  freshContext,
} from './harness.mjs';

const MODES = ['local', 'firestore'];

test.beforeAll(async () => {
  startCloud();
  await waitCloudReady();
  await startSite();
});

test.afterAll(() => {
  stopHarness();
});

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {'local'|'firestore'} mode
 */
async function openSession(browser, mode, recvExtra = '') {
  await resetCloudState();
  const { recv, ctrl } = urlsForMode(mode);
  const ctx = await freshContext(browser);
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();
  await receiver.goto(recv + recvExtra);
  await controller.goto(ctrl);
  await connectController(controller, mode);
  if (mode === 'firestore') {
    await controller.waitForTimeout(3000);
  } else {
    await controller.waitForTimeout(1500);
  }
  return { ctx, receiver, controller };
}

for (const mode of MODES) {
  const tag = mode === 'local' ? 'local' : 'firestore';

  test(`${tag} | connect and add preparing`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2101');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2101', {
      timeout: 15000,
    });
    await expect(controller.locator('#online-state')).toHaveAttribute('data-connected', '1');
    await ctx.close();
  });

  test(`${tag} | one-click ready and ring counter`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await receiver.evaluate(() => {
      window.__rcvTelemetry.ringCount = 0;
    });
    await controller.fill('#fld-no', '2201');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2201', { timeout: 15000 });
    await controller.click('#btn-one-ready');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2201', { timeout: 15000 });
    const rings = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
    expect(rings).toBeGreaterThanOrEqual(1);
    await ctx.close();
  });

  test(`${tag} | pickup scan removes ready`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2301');
    await controller.selectOption('#fld-status', 'ready');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2301', { timeout: 15000 });
    await controller.fill('#fld-pickup-scan', '2301');
    await controller.click('#btn-pickup-scan');
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '2301' })).toHaveCount(0, {
      timeout: 15000,
    });
    await ctx.close();
  });

  test(`${tag} | send empty list`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2401');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2401', { timeout: 15000 });
    await controller.click('#btn-clear-board');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2401' })).toHaveCount(0, {
      timeout: 15000,
    });
    await ctx.close();
  });

  test(`${tag} | tammy json and auto-generate`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.click('#btn-send-tammy');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('1488', { timeout: 15000 });
    await controller.click('#btn-gen-normal');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('1001', { timeout: 15000 });
    await controller.click('#btn-gen-peak');
    await expect(receiver.locator('.rcv-prep .rcv-num')).not.toHaveCount(0, { timeout: 15000 });
    await ctx.close();
  });

  test(`${tag} | bad signature store format`, async ({ browser }) => {
    const { ctx, controller } = await openSession(browser, mode);
    await controller.click('#btn-bad-sign');
    await expect(controller.locator('#log-list li').first()).toContainText('失敗', { timeout: 8000 });
    await controller.click('#btn-bad-store');
    await expect(controller.locator('#log-list li').first()).toContainText('失敗', { timeout: 8000 });
    await controller.click('#btn-bad-format');
    await expect(controller.locator('#log-list li').first()).toContainText('失敗', { timeout: 8000 });
    await ctx.close();
  });

  test(`${tag} | network offline restore slow cable`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2501');
    await controller.click('#btn-add-ticket');
    await controller.click('#btn-offline');
    const guestText = await receiver.locator('[data-testid="rcv-guest-stage"]').innerText();
    expect(guestText).not.toContain('尚未連線');
    expect(guestText).not.toContain('斷線');
    await controller.click('#btn-cable-pull');
    await expect(controller.locator('#log-list li').first()).toContainText('拔線', { timeout: 5000 });
    await controller.click('#btn-cable-restore');
    await controller.click('#btn-restore');
    await controller.click('#btn-slow');
    await expect(controller.locator('#log-list li').first()).toContainText('指令 slow', { timeout: 8000 });
    await ctx.close();
  });

  test(`${tag} | special clear reload dup late`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2601');
    await controller.click('#btn-add-ticket');
    await controller.click('#btn-dup-list');
    await controller.click('#btn-late-old');
    await controller.click('#btn-clear-now');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2601' })).toHaveCount(0, {
      timeout: 20000,
    });
    await controller.click('#btn-reload');
    await controller.waitForTimeout(4000);
    await ctx.close();
  });

  test(`${tag} | logs merge and export hooks`, async ({ browser }) => {
    const { ctx, controller } = await openSession(browser, mode);
    await controller.click('#btn-refresh-logs');
    await expect(controller.locator('#log-list li').first()).toBeVisible({ timeout: 8000 });
    await controller.fill('#log-filter', '連線');
    await expect(controller.locator('#log-list li').first()).toBeVisible();
    await ctx.close();
  });
}

test('board | cache after reload and no rechime on reconnect', async ({ browser }) => {
  const { ctx, receiver, controller } = await openSession(browser, 'local');
  await controller.fill('#fld-no', '2701');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2701', { timeout: 15000 });
  await receiver.reload();
  await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2701', { timeout: 15000 });
  const ringsBefore = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  await controller.click('#btn-offline');
  await controller.waitForTimeout(2000);
  await controller.click('#btn-restore');
  await controller.waitForTimeout(3000);
  const ringsAfter = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  expect(ringsAfter).toBe(ringsBefore);
  await ctx.close();
});

test('board | readyHideMin param and receiveBoard API', async ({ browser }) => {
  const { ctx, receiver } = await openSession(browser, 'local', '&readyHideMin=30');
  const hide = await receiver.evaluate(() => window.receiverCloud.getReadyHideMinutes());
  expect(hide).toBe(30);
  await receiver.evaluate(() => {
    window.receiveBoard({
      seq: 99,
      storeId: 's120030',
      businessDate: '2026-10-02',
      updatedAt: new Date().toISOString(),
      source: 'A',
      tickets: [{ no: '2801', status: 'preparing', updatedAt: new Date().toISOString() }],
    });
  });
  await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2801', { timeout: 8000 });
  const hasFb = await receiver.evaluate(() => typeof window.firebase !== 'undefined');
  expect(hasFb).toBe(false);
  await ctx.close();
});

test('board | demo=1 query preserved', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(urlsForMode('local').recv + '&demo=1');
  await expect(page.locator('#rcv-demo-handle')).toBeVisible({ timeout: 8000 });
  await ctx.close();
});
