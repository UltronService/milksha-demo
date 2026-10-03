import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { urlsForMode } from './harness.mjs';

const ART = '/opt/cursor/artifacts/screenshots';

function seedReady8810() {
  return () => {
    window.receiverDemo.pushFromObject({
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: 's120030',
        data: {
          number_content: [{ source_type: 'From_Store_OK', number: '8810' }],
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
  };
}

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 2560, height: 1080, tag: '2560x1080' },
  { width: 2560, height: 1440, tag: '2560x1440' },
];

test('board ready 8810 screenshots at key viewports', async ({ browser }) => {
  mkdirSync(ART, { recursive: true });
  const { recv } = urlsForMode('local');
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setViewportSize(vp);
    await page.goto(recv);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      window.receiverDemo.pushFromObject(
        window.receiverDemo.wrapPayload([{ source_type: 'From_Store_OK', number: '8810' }]),
      );
    });
    await page.waitForTimeout(600);
    await expect(page.locator('.rcv-ready .rcv-num').filter({ hasText: '8810' })).toBeVisible({
      timeout: 15000,
    });
    await page.screenshot({
      path: `${ART}/board-ready-8810-${vp.tag}.png`,
      fullPage: false,
    });
    await ctx.close();
  }
});
