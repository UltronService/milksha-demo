import { test, expect } from '@playwright/test';
import { urlsForMode } from './harness.mjs';

const VIEW = { width: 1920, height: 1080 };

function cloudSettingsInitScript() {
  return () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
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

function epoch1970InitScript() {
  return () => {
    const RealDate = Date;
    const fixed = RealDate.parse('1970-01-01T00:00:00.000Z');
    function MockDate(...args) {
      if (args.length === 0) {
        return new RealDate(fixed);
      }
      return new RealDate(...args);
    }
    MockDate.now = function () {
      return fixed;
    };
    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    window.Date = MockDate;
  };
}

test('1970 box with no cache hides guest clock until cloud', async ({ browser }) => {
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(epoch1970InitScript());
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.route('**/documents/**/board/today_board', async (route) => {
    await route.abort('failed');
  });
  await receiver.goto(recv);
  await receiver.waitForTimeout(2000);
  await expect(receiver.locator('#rcv-clock')).toHaveAttribute('hidden', '');
  await ctx.close();
});

test('404 board with readable Date shows guest clock', async ({ browser }) => {
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(epoch1970InitScript());
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.route('**/documents/**/board/today_board', async (route) => {
    await route.fulfill({
      status: 404,
      headers: { Date: 'Fri, 03 Oct 2026 14:00:00 GMT' },
      body: '',
    });
  });
  await receiver.goto(recv);
  await receiver.waitForTimeout(3000);
  await expect(receiver.locator('#rcv-clock')).not.toHaveAttribute('hidden', '');
  await expect(receiver.locator('#rcv-clock')).not.toHaveText('');
  await ctx.close();
});

test('404 board without Date keeps clock hidden when boot check fails', async ({ browser }) => {
  const { recv } = urlsForMode('firestore');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(epoch1970InitScript());
  await ctx.addInitScript(cloudSettingsInitScript());
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.route('**/documents/**/board/today_board', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });
  await receiver.goto(recv);
  await receiver.waitForTimeout(3000);
  await expect(receiver.locator('#rcv-clock')).toHaveAttribute('hidden', '');
  await ctx.close();
});

test('store name horizontal position stable when clock hidden', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.goto(recv);
  await receiver.waitForTimeout(800);
  const before = await receiver.locator('#rcv-store-label').boundingBox();
  await receiver.evaluate(() => {
    window.receiverDemo.setGuestClockState({ hidden: true });
  });
  const after = await receiver.locator('#rcv-store-label').boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  await ctx.close();
});
