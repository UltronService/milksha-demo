import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';

const COMMITTED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'committed-artifacts');

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
  const httpDate = 'Fri, 03 Oct 2026 14:00:00 GMT';
  await expect(receiver.locator('#rcv-clock')).not.toHaveAttribute('hidden', '');
  const shown = await receiver.locator('#rcv-clock').textContent();
  const expected = await receiver.evaluate((hdr) => {
    const ms = Date.parse(hdr);
    return window.QMS.Board.TodayBoard.formatTaipeiClockHM(new Date(ms));
  }, httpDate);
  expect(shown).toBe(expected);
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
  mkdirSync(COMMITTED_DIR, { recursive: true });
  await receiver.screenshot({
    path: join(COMMITTED_DIR, 'board-clock-hidden-store-1920.png'),
    fullPage: false,
  });
  await ctx.close();
});

test('overlay number at 2560px is at least twice ready card size', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const receiver = await ctx.newPage();
  await receiver.setViewportSize({ width: 2560, height: 1080 });
  await receiver.goto(recv);
  await receiver.waitForTimeout(500);
  const sizes = await receiver.evaluate(() => {
    const RH = window.QMS && window.QMS.Receiver && window.QMS.Receiver.RingHost;
    if (RH && RH._resetAudioContextForTests) {
      RH._resetAudioContextForTests();
      RH.syncReadyQueue(new Set());
      RH.playReadyRing('8801');
    }
    const card = document.querySelector('.rcv-ready .rcv-num');
    const ring = document.getElementById('rcv-ring-num');
    const cardSize = card ? parseFloat(getComputedStyle(card).fontSize) : 0;
    const ringSize = ring ? parseFloat(getComputedStyle(ring).fontSize) : 0;
    return { cardSize, ringSize };
  });
  expect(sizes.ringSize).toBeGreaterThanOrEqual(sizes.cardSize * 2 - 1);
  await ctx.close();
});
