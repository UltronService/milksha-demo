import { chromium } from '@playwright/test';
import { urlsForMode } from '../tests/e2e/harness.mjs';
import { applyRingFontSetup } from '../tests/e2e/ring-fit.mjs';

const FONTS = [
  { id: 'default', css: null },
  { id: 'dejavu', css: 'DejaVu Sans, sans-serif' },
  { id: 'roboto', css: 'Roboto, sans-serif' },
];

const VIEWPORTS = [
  { tag: '1920x1080', width: 1920, height: 1080 },
  { tag: '1366x768', width: 1366, height: 768 },
  { tag: '1280x720', width: 1280, height: 720 },
  { tag: '2560x1080', width: 2560, height: 1080 },
  { tag: '2560x1440', width: 2560, height: 1440 },
];

async function measure(page) {
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
    return {
      boxWidth: boxR.width,
      fontSize: parseFloat(numCs.fontSize) || 0,
      sideLeftPct: ((numR.left - innerL) / boxR.width) * 100,
      sideRightPct: ((innerR - numR.right) / boxR.width) * 100,
    };
  });
}

const browser = await chromium.launch();
const { recv } = urlsForMode('local');
for (const font of FONTS) {
  console.log(`\n=== ${font.id} ===`);
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await applyRingFontSetup(ctx, font);
    const page = await ctx.newPage();
    await page.setViewportSize(vp);
    await page.goto(recv);
    await page.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests);
    await page.evaluate(() => window.QMS.Receiver.RingHost.showRingOverlayForTests('8888'));
    await page.waitForTimeout(150);
    const m = await measure(page);
    console.log(
      `${vp.tag} box=${m?.boxWidth?.toFixed(2)} font=${m?.fontSize?.toFixed(2)} L=${m?.sideLeftPct?.toFixed(2)}% R=${m?.sideRightPct?.toFixed(2)}%`,
    );
    await ctx.close();
  }
}
await browser.close();
