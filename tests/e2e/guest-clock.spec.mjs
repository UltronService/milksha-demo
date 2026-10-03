import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';
import {
  RING_FIT_VIEWPORTS,
  RING_MARGIN_VIEWPORTS,
  RING_FONT_SETUPS,
  ringFontInitScript,
  findWidestFourDigit,
  expectRingNumFitsAndCentered,
} from './ring-fit.mjs';

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
  await page.waitForTimeout(80);
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
  await showFourDigitRing(receiver);
  await receiver.waitForTimeout(200);
  const m = await measureRingOverlay(receiver);
  expect(m).not.toBeNull();
  const b = RING_BASELINE_6975672;
  expect(Math.abs(m.boxWidth - b.boxWidth)).toBeLessThan(1.5);
  expect(Math.abs(m.paddingLeft - b.paddingLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.paddingRight - b.paddingRight)).toBeLessThan(0.5);
  expect(Math.abs(m.borderLeft - b.borderLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.borderRight - b.borderRight)).toBeLessThan(0.5);
  expect(m.fontSize).toBeLessThanOrEqual(b.fontSize + 0.5);
  expect(Math.abs(m.letterSpacingPx - b.letterSpacingPx)).toBeLessThan(0.5);
  const fitsAtDesign = await receiver.evaluate(() => {
    const num = document.getElementById('rcv-ring-num');
    const box = document.getElementById('rcv-ring-box');
    if (!num || !box) {
      return false;
    }
    const savedFontSize = num.style.fontSize;
    num.style.fontSize = '';
    const cs = getComputedStyle(box);
    const innerW =
      box.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight) -
      parseFloat(cs.borderLeftWidth) -
      parseFloat(cs.borderRightWidth);
    const range = document.createRange();
    range.selectNodeContents(num);
    const textW = range.getBoundingClientRect().width;
    const fits = textW <= innerW + 1;
    num.style.fontSize = savedFontSize;
    return fits;
  });
  if (fitsAtDesign) {
    expect(Math.abs(m.fontSize - b.fontSize)).toBeLessThan(1);
  }
  await expectRingNumFitsAndCentered(receiver, expect);
  await ctx.close();
});

test('ring overlay 8888 side margins by viewport', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  for (const vp of RING_MARGIN_VIEWPORTS) {
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
    await expectRingNumFitsAndCentered(receiver, expect);
    expect(m.sideMarginPctLeft).toBeGreaterThanOrEqual(vp.minSide - 0.002);
    expect(m.sideMarginPctRight).toBeGreaterThanOrEqual(vp.minSide - 0.002);
    expect(m.sideMarginPctLeft).toBeLessThanOrEqual(vp.maxSide + 0.002);
    expect(m.sideMarginPctRight).toBeLessThanOrEqual(vp.maxSide + 0.002);
    await ctx.close();
  }
  for (const vp of RING_FIT_VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await showFourDigitRing(receiver);
    await receiver.waitForTimeout(200);
    await expectRingNumFitsAndCentered(receiver, expect);
    await ctx.close();
  }
});

test('ring overlay fit widest 4-digit per font at all viewports', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const widestByFont = {};
  for (const font of RING_FONT_SETUPS) {
    widestByFont[font.id] = null;
    for (const vp of RING_FIT_VIEWPORTS) {
      const ctx = await browser.newContext({ deviceScaleFactor: 1 });
      if (font.css) {
        await ctx.addInitScript(ringFontInitScript(font.css));
      }
      const receiver = await ctx.newPage();
      await receiver.setViewportSize(vp);
      await receiver.goto(recv);
      await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
        timeout: 15000,
      });
      await showFourDigitRing(receiver, '8888');
      const widest = await findWidestFourDigit(receiver);
      if (vp.width === 1920 && !widestByFont[font.id]) {
        widestByFont[font.id] = widest;
      }
      await showFourDigitRing(receiver, widest.text);
      await receiver.waitForTimeout(200);
      await expectRingNumFitsAndCentered(receiver, expect);
      await ctx.close();
    }
    expect(widestByFont[font.id]).not.toBeNull();
    console.log(`[ring-fit] widest 4-digit (${font.label}): "${widestByFont[font.id].text}"`);
  }
});

test('ring overlay 1920 geometry and fit across font setups', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const b = RING_BASELINE_6975672;
  for (const font of RING_FONT_SETUPS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    if (font.css) {
      await ctx.addInitScript(ringFontInitScript(font.css));
    }
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(VIEW);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await showFourDigitRing(receiver, RING_DIGITS);
    await receiver.waitForTimeout(200);
    const m = await measureRingOverlay(receiver);
    expect(m).not.toBeNull();
    expect(Math.abs(m.boxWidth - b.boxWidth)).toBeLessThan(1.5);
    expect(Math.abs(m.paddingLeft - b.paddingLeft)).toBeLessThan(0.5);
    expect(Math.abs(m.paddingRight - b.paddingRight)).toBeLessThan(0.5);
    expect(Math.abs(m.borderLeft - b.borderLeft)).toBeLessThan(0.5);
    expect(Math.abs(m.borderRight - b.borderRight)).toBeLessThan(0.5);
    expect(m.fontSize).toBeLessThanOrEqual(b.fontSize + 0.5);
    await expectRingNumFitsAndCentered(receiver, expect);
    await ctx.close();
  }
});

test('ring overlay design size at least 2x ready-list (140px)', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  for (const vp of RING_FIT_VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await showFourDigitRing(receiver, RING_DIGITS);
    const tokens = await receiver.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.fontSize = 'var(--rcv-ring-num-size)';
      document.body.appendChild(probe);
      const ringDesignPx = parseFloat(getComputedStyle(probe).fontSize) || 0;
      probe.remove();
      return { ringDesignPx, readyFontPx: 140 };
    });
    expect(tokens.ringDesignPx).toBeGreaterThanOrEqual(tokens.readyFontPx * 2 - 1);
    await ctx.close();
  }
});
