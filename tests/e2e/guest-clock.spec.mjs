import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';

const COMMITTED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'committed-artifacts');

const VIEW = { width: 1920, height: 1080 };

/** Measured on commit 6975672 @ 1920×1080, 4-digit ring overlay (geometry only). */
const RING_BASELINE_6975672 = {
  boxWidth: 848.640625,
  paddingLeft: 80,
  paddingRight: 80,
  borderLeft: 8,
  borderRight: 8,
  fontSize: 280,
  letterSpacingPx: 8,
};

const RING_DIGITS = '8888';

async function seedReadyNumber(page, number = RING_DIGITS) {
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

async function showFourDigitRing(page, digits = RING_DIGITS) {
  await page.evaluate((num) => {
    window.QMS.Receiver.RingHost.showRingOverlayForTests(num);
  }, digits);
}

async function measureRingOverlay(page) {
  return page.evaluate(() => {
    const box = document.getElementById('rcv-ring-box');
    const num = document.getElementById('rcv-ring-num');
    if (!box || !num) {
      return null;
    }
    const boxR = box.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(num);
    const numR = range.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const numCs = getComputedStyle(num);
    const padL = parseFloat(cs.paddingLeft);
    const padR = parseFloat(cs.paddingRight);
    const borL = parseFloat(cs.borderLeftWidth);
    const borR = parseFloat(cs.borderRightWidth);
    const innerL = boxR.left + padL + borL;
    const innerR = boxR.right - padR - borR;
    const innerW = innerR - innerL;
    const letterSpacing = parseFloat(numCs.letterSpacing) || 0;
    return {
      boxWidth: boxR.width,
      paddingLeft: padL,
      paddingRight: padR,
      borderLeft: borL,
      borderRight: borR,
      fontSize: parseFloat(numCs.fontSize) || 0,
      letterSpacingPx: letterSpacing,
      numWidth: numR.width,
      innerWidth: innerW,
      sideMarginPctLeft: (numR.left - innerL) / boxR.width,
      sideMarginPctRight: (innerR - numR.right) / boxR.width,
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

test('ring overlay at 1920x1080 matches 6975672 box geometry', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const receiver = await ctx.newPage();
  await receiver.setViewportSize(VIEW);
  await receiver.goto(recv);
  await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
    timeout: 15000,
  });
  await seedReadyNumber(receiver);
  await showFourDigitRing(receiver);
  await receiver.evaluate(() => {
    document.documentElement.setAttribute('data-rcv-ring-6975672', '1');
  });
  await receiver.waitForTimeout(200);
  const layoutW = await receiver.evaluate(() => window.innerWidth || 0);
  const m = await measureRingOverlay(receiver);
  expect(m).not.toBeNull();
  const b = RING_BASELINE_6975672;
  expect(Math.abs(m.paddingLeft - b.paddingLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.paddingRight - b.paddingRight)).toBeLessThan(0.5);
  expect(Math.abs(m.borderLeft - b.borderLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.borderRight - b.borderRight)).toBeLessThan(0.5);
  if (layoutW >= 1850 && layoutW <= 1950) {
    expect(Math.abs(m.boxWidth - b.boxWidth)).toBeLessThan(1.5);
    expect(Math.abs(m.fontSize - b.fontSize)).toBeLessThan(1);
    expect(Math.abs(m.letterSpacingPx - b.letterSpacingPx)).toBeLessThan(0.5);
  }
  await ctx.close();
});

test('ring overlay 8888 side margins by viewport', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const cases = [
    { width: 2560, height: 1080, minSide: 0.04, maxSide: 0.1 },
    { width: 2560, height: 1440, minSide: 0.04, maxSide: 0.1 },
    { width: 1366, height: 768, minSide: 0.04, maxSide: null },
    { width: 1280, height: 720, minSide: 0.04, maxSide: null },
  ];
  for (const vp of cases) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await showFourDigitRing(receiver);
    await receiver.waitForTimeout(200);
    const m = await measureRingOverlay(receiver);
    expect(m).not.toBeNull();
    expect(m.numWidth).toBeLessThan(m.innerWidth - 0.5);
    expect(m.sideMarginPctLeft).toBeGreaterThanOrEqual(vp.minSide - 0.002);
    expect(m.sideMarginPctRight).toBeGreaterThanOrEqual(vp.minSide - 0.002);
    if (vp.maxSide != null) {
      expect(m.sideMarginPctLeft).toBeLessThanOrEqual(vp.maxSide + 0.002);
      expect(m.sideMarginPctRight).toBeLessThanOrEqual(vp.maxSide + 0.002);
    }
    await ctx.close();
  }
});
