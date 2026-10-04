#!/usr/bin/env node
import { chromium } from 'playwright';
import { startSite, urlsForMode } from '../tests/e2e/harness.mjs';

const viewports = [
  { tag: '1920x1080', width: 1920, height: 1080 },
  { tag: '1366x768', width: 1366, height: 768 },
  { tag: '1280x720', width: 1280, height: 720 },
  { tag: '2560x1080', width: 2560, height: 1080 },
  { tag: '2560x1440', width: 2560, height: 1440 },
];

await startSite();
const { recv } = urlsForMode('local');
const browser = await chromium.launch();

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(recv);
  await page.waitForFunction(() => window.QMS?.Receiver?.RingHost?.showRingOverlayForTests, null, {
    timeout: 20000,
  });
  await page.evaluate(() => window.QMS.Receiver.RingHost.showRingOverlayForTests('8888'));
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const box = document.getElementById('rcv-ring-box');
    const num = document.getElementById('rcv-ring-num');
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
      paddingLeft: padL,
      paddingRight: padR,
      borderLeft: borL,
      borderRight: borR,
      fontSize: parseFloat(numCs.fontSize),
      letterSpacing: numCs.letterSpacing,
      numWidth: numR.width,
      innerWidth: innerR - innerL,
      sideLeftPct: (numR.left - innerL) / boxR.width,
      sideRightPct: (innerR - numR.right) / boxR.width,
    };
  });
  console.log(vp.tag, JSON.stringify(m));
  await page.close();
}
await browser.close();
