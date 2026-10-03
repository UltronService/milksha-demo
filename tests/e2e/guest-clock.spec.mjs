import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';
import { RING_BASELINE_6975672 } from './baseline-6975672.mjs';
import {
  RING_FIT_VIEWPORTS,
  RING_MARGIN_OTHER_VIEWPORTS,
  RING_MARGIN_REF_VIEWPORT,
  RING_MARGIN_TOLERANCE_PP,
  measureRingGlyphSideMargins,
  RING_FONT_SETUPS,
  applyRingFontSetup,
  browserForRingFontSetup,
  findWidestFourDigit,
  expectRingNumFitsAndCentered,
  getRingNumRenderedFontFamily,
  ringNumFitPasses,
  ringNumFitsAtDesignFontSize,
} from './ring-fit.mjs';

const COMMITTED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'committed-artifacts');

const VIEW = { width: 1920, height: 1080 };

const RING_DIGITS = '8888';

async function seedReadyNumber(page, number = RING_DIGITS) {
  await page.evaluate((num) => {
    window.receiverDemo.pushFromObject(
      window.receiverDemo.wrapPayload([{ source_type: 'From_Store_OK', number: String(num) }]),
    );
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
    const whiteInnerL = boxR.left + borL;
    const whiteInnerR = boxR.right - borR;
    const letterSpacing = parseFloat(numCs.letterSpacing) || 0;
    return {
      boxWidth: boxR.width,
      /** Match 6975672 UX overlay (padding box, excludes border). */
      boxHeight: box.clientHeight,
      paddingLeft: padL,
      paddingRight: padR,
      borderLeft: borL,
      borderRight: borR,
      fontSize: parseFloat(numCs.fontSize) || 0,
      letterSpacingPx: letterSpacing,
      numWidth: numR.width,
      innerWidth: innerW,
      sideMarginPctLeft: ((numR.left - whiteInnerL) / boxR.width) * 100,
      sideMarginPctRight: ((whiteInnerR - numR.right) / boxR.width) * 100,
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
  expect(Math.abs(m.boxWidth - b.boxWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.paddingLeft - b.paddingLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.paddingRight - b.paddingRight)).toBeLessThan(0.5);
  expect(Math.abs(m.borderLeft - b.borderLeft)).toBeLessThan(0.5);
  expect(Math.abs(m.borderRight - b.borderRight)).toBeLessThan(0.5);
  expect(m.fontSize).toBeLessThanOrEqual(b.fontSize + 0.5);
  expect(Math.abs(m.letterSpacingPx - b.letterSpacingPx)).toBeLessThan(0.5);
  const fitsDesign = await ringNumFitsAtDesignFontSize(receiver);
  if (fitsDesign) {
    expect(m.fontSize).toBe(b.fontSize);
    expect(Math.abs(m.boxHeight - b.boxHeight)).toBeLessThanOrEqual(1);
  }
  await expectRingNumFitsAndCentered(receiver, expect);
  await ctx.close();
});

test('ring overlay 8888 side margins track 1920 reference by viewport', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const refCtx = await browser.newContext({ deviceScaleFactor: 1 });
  const refPage = await refCtx.newPage();
  await refPage.setViewportSize(RING_MARGIN_REF_VIEWPORT);
  await refPage.goto(recv);
  await refPage.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
    timeout: 15000,
  });
  await showFourDigitRing(refPage);
  await refPage.waitForTimeout(200);
  const refMargins = await measureRingGlyphSideMargins(refPage);
  expect(refMargins).not.toBeNull();
  await refCtx.close();

  for (const vp of RING_MARGIN_OTHER_VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await showFourDigitRing(receiver);
    await receiver.waitForTimeout(200);
    const margins = await measureRingGlyphSideMargins(receiver);
    expect(margins).not.toBeNull();
    await expectRingNumFitsAndCentered(receiver, expect);
    expect(Math.abs(margins.leftPct - refMargins.leftPct)).toBeLessThanOrEqual(RING_MARGIN_TOLERANCE_PP);
    expect(Math.abs(margins.rightPct - refMargins.rightPct)).toBeLessThanOrEqual(RING_MARGIN_TOLERANCE_PP);
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
  const renderedByFont = {};
  for (const font of RING_FONT_SETUPS) {
    widestByFont[font.id] = null;
    renderedByFont[font.id] = null;
    const { browser: fontBrowser, owned: closeFontBrowser } = await browserForRingFontSetup(browser, font);
    for (const vp of RING_FIT_VIEWPORTS) {
      const ctx = await fontBrowser.newContext({ deviceScaleFactor: 1 });
      await applyRingFontSetup(ctx, font);
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
      const rendered = await getRingNumRenderedFontFamily(receiver);
      if (vp.width === 1920 && !renderedByFont[font.id]) {
        renderedByFont[font.id] = rendered;
      }
      if (font.requirePlatformFamily) {
        expect(rendered).toMatch(font.requirePlatformFamily);
      }
      const fitOk = await ringNumFitPasses(receiver);
      console.log(
        `[ring-fit] setup=${font.setupLogName} viewport=${vp.width}x${vp.height} rendered=${rendered} widest="${widest.text}" fit=${fitOk ? 'pass' : 'fail'}`,
      );
      if (vp.width === 1920 && vp.height === 1080) {
        const m1920 = await measureRingOverlay(receiver);
        expect(m1920).not.toBeNull();
        const fitsDesign = await ringNumFitsAtDesignFontSize(receiver);
        if (fitsDesign) {
          expect(m1920.fontSize).toBe(RING_BASELINE_6975672.fontSize);
          expect(Math.abs(m1920.boxHeight - RING_BASELINE_6975672.boxHeight)).toBeLessThanOrEqual(1);
        }
      }
      await expectRingNumFitsAndCentered(receiver, expect);
      await ctx.close();
    }
    expect(widestByFont[font.id]).not.toBeNull();
    expect(renderedByFont[font.id]).not.toBeNull();
    if (closeFontBrowser) {
      await fontBrowser.close();
    }
  }
});

test('ring overlay 1920 geometry and fit across font setups', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  const b = RING_BASELINE_6975672;
  for (const font of RING_FONT_SETUPS) {
    const { browser: fontBrowser, owned: closeFontBrowser } = await browserForRingFontSetup(browser, font);
    const ctx = await fontBrowser.newContext({ deviceScaleFactor: 1 });
    await applyRingFontSetup(ctx, font);
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
    expect(Math.abs(m.boxWidth - b.boxWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.paddingLeft - b.paddingLeft)).toBeLessThan(0.5);
    expect(Math.abs(m.paddingRight - b.paddingRight)).toBeLessThan(0.5);
    expect(Math.abs(m.borderLeft - b.borderLeft)).toBeLessThan(0.5);
    expect(Math.abs(m.borderRight - b.borderRight)).toBeLessThan(0.5);
    expect(m.fontSize).toBeLessThanOrEqual(b.fontSize + 0.5);
    const fitsDesign = await ringNumFitsAtDesignFontSize(receiver);
    if (fitsDesign) {
      expect(m.fontSize).toBe(b.fontSize);
      expect(Math.abs(m.boxHeight - b.boxHeight)).toBeLessThanOrEqual(1);
    }
    await expectRingNumFitsAndCentered(receiver, expect);
    await ctx.close();
    if (closeFontBrowser) {
      await fontBrowser.close();
    }
  }
});

test('ring overlay call number at least 2x ready-list card number', async ({ browser }) => {
  const { recv } = urlsForMode('local');
  for (const vp of RING_FIT_VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(vp);
    await receiver.goto(recv);
    await receiver.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
      timeout: 15000,
    });
    await seedReadyNumber(receiver, RING_DIGITS);
    await expect(receiver.locator('.rcv-ready .rcv-num').filter({ hasText: RING_DIGITS })).toBeVisible({
      timeout: 10000,
    });
    await showFourDigitRing(receiver, RING_DIGITS);
    await receiver.waitForTimeout(200);
    const sizes = await receiver.evaluate(() => {
      const ringNum = document.getElementById('rcv-ring-num');
      const readyNum = document.querySelector('.rcv-ready .rcv-num');
      if (!ringNum || !readyNum) {
        return null;
      }
      const ringRange = document.createRange();
      ringRange.selectNodeContents(ringNum);
      const ringR = ringRange.getBoundingClientRect();
      const readyRange = document.createRange();
      readyRange.selectNodeContents(readyNum);
      const readyR = readyRange.getBoundingClientRect();
      const ringFs = parseFloat(getComputedStyle(ringNum).fontSize) || 0;
      const readyFs = parseFloat(getComputedStyle(readyNum).fontSize) || 0;
      const readyFsRendered = readyR.height;
      const ringFsRendered = ringR.height;
      return {
        ringFs,
        readyFs,
        readyFsRendered,
        ringFsRendered,
        ringGlyphW: ringR.width,
        readyGlyphW: readyR.width,
      };
    });
    expect(sizes).not.toBeNull();
    expect(sizes.ringGlyphW).toBeGreaterThanOrEqual(sizes.readyGlyphW * 2 - 1);
    await ctx.close();
  }
});
