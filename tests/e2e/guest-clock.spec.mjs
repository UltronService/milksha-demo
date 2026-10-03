import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';

const COMMITTED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'committed-artifacts');

const VIEW = { width: 1920, height: 1080 };

/** Golden layout at 1920×1080 (ring overlay, 4-digit 8801) — must not drift when scaling rules change. */
const RING_BASELINE_1920 = { boxWidth: 900, numWidth: 640.640625 };

async function seedReadyNumber(page, number = '8801') {
  await page.evaluate((num) => {
    window.receiverDemo.pushFromObject({
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: 's120030',
        data: {
          number_content: [{ source_type: 'From_Store_OK', number: String(num) }],
          newsTicker_content: [],
          newsTickerSpeed: 0,
        },
      },
      merchant_id: 'demo',
      account: 's120030',
      timeStmp: '2026-10-02-12-00-00:0000',
      serviceSpecialData_Json_Md5Hash: 'demo',
      signature: 'DEMO-NO-SIGNATURE',
    });
  }, number);
}

async function showFourDigitRing(page, digits = '8801') {
  await page.evaluate((num) => {
    const RH = window.QMS && window.QMS.Receiver && window.QMS.Receiver.RingHost;
    if (RH && typeof RH.showRingOverlayForTests === 'function') {
      RH.showRingOverlayForTests(num);
      return;
    }
    const numEl = document.getElementById('rcv-ring-num');
    const ov = document.getElementById('rcv-ring-ov');
    if (numEl) {
      numEl.textContent = num;
    }
    if (ov) {
      ov.style.opacity = '1';
    }
  }, digits);
}

async function measureRingOverlay(page) {
  return page.evaluate(() => {
    const box = document.getElementById('rcv-ring-box');
    const num = document.getElementById('rcv-ring-num');
    const card = document.querySelector('.rcv-ready .rcv-num');
    if (!box || !num) {
      return null;
    }
    const boxR = box.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(num);
    const numR = range.getBoundingClientRect();
    let cardWidth = 0;
    if (card && card.textContent) {
      const cardRange = document.createRange();
      cardRange.selectNodeContents(card);
      cardWidth = cardRange.getBoundingClientRect().width;
    }
    const cs = getComputedStyle(box);
    const insetX =
      parseFloat(cs.paddingLeft) +
      parseFloat(cs.paddingRight) +
      parseFloat(cs.borderLeftWidth) +
      parseFloat(cs.borderRightWidth);
    const innerW = Math.max(0, boxR.width - insetX);
    const side = (innerW - numR.width) / 2;
    const ringFontPx = parseFloat(getComputedStyle(num).fontSize) || 0;
    const readyFontPx = 140;
    return {
      boxWidth: boxR.width,
      numWidth: numR.width,
      innerWidth: innerW,
      cardWidth: cardWidth,
      ringFontPx: ringFontPx,
      readyFontPx: readyFontPx,
      sideMarginPct: boxR.width > 0 ? side / boxR.width : 0,
    };
  });
}

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

test('ring overlay at 1920x1080 matches baseline box and number width', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.goto(recv);
  await receiver.waitForTimeout(500);
  await seedReadyNumber(receiver);
  await showFourDigitRing(receiver);
  await receiver.waitForTimeout(200);
  const m = await measureRingOverlay(receiver);
  expect(m).not.toBeNull();
  expect(Math.abs(m.boxWidth - RING_BASELINE_1920.boxWidth)).toBeLessThan(1.5);
  expect(Math.abs(m.numWidth - RING_BASELINE_1920.numWidth)).toBeLessThan(1.5);
  await ctx.close();
});

test('ring overlay number does not overflow the box (side margins)', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const viewports = [
    { width: 2560, height: 1080 },
    { width: 2560, height: 1440 },
  ];
  for (const vp of viewports) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForTimeout(500);
    await showFourDigitRing(receiver);
    await receiver.waitForTimeout(200);
    const m = await measureRingOverlay(receiver);
    expect(m).not.toBeNull();
    expect(m.numWidth).toBeLessThanOrEqual(m.boxWidth + 0.5);
    expect(m.sideMarginPct).toBeGreaterThanOrEqual(0.05 - 0.005);
    expect(m.ringFontPx).toBeGreaterThanOrEqual(m.readyFontPx * 2 - 1);
    await ctx.close();
  }
});
