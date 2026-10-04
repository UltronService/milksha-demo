#!/usr/bin/env node
/**
 * Measure ring overlay metrics (6975672 HTML vs current).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

async function measure(htmlOverride, viewport, digits = '8888') {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  if (htmlOverride) {
    const html = readFileSync(join(ROOT, 'receiver-demo/index.html'), 'utf8');
    const patched = html.replace(
      /<style id="rcv-ring-style">[\s\S]*?<\/style>/,
      htmlOverride,
    );
    await page.setContent(patched.replace('</head>', '<base href="http://127.0.0.1/"></head>'), {
      waitUntil: 'domcontentloaded',
    });
  } else {
    await page.goto(`file://${join(ROOT, 'receiver-demo/index.html')}`, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate((num) => {
    const box = document.getElementById('rcv-ring-box');
    const ov = document.getElementById('rcv-ring-ov');
    const numEl = document.getElementById('rcv-ring-num');
    if (!box && ov) {
      const b = document.createElement('div');
      b.id = 'rcv-ring-box';
      b.innerHTML =
        '<div class="rcv-ring-label">請取餐</div><div class="rcv-ring-num" id="rcv-ring-num"></div>';
      ov.appendChild(b);
    }
    const n = document.getElementById('rcv-ring-num');
    if (n) n.textContent = num;
    if (ov) ov.style.opacity = '1';
  }, digits);
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
    const innerW = innerR - innerL;
    const sideL = (numR.left - innerL) / boxR.width;
    const sideR = (innerR - numR.right) / boxR.width;
    return {
      boxWidth: boxR.width,
      boxHeight: boxR.height,
      paddingLeft: padL,
      paddingRight: padR,
      borderLeft: borL,
      borderRight: borR,
      fontSize: parseFloat(numCs.fontSize),
      letterSpacing: numCs.letterSpacing,
      numWidth: numR.width,
      innerWidth: innerW,
      sideMarginPctLeft: sideL,
      sideMarginPctRight: sideR,
    };
  });
  await browser.close();
  return m;
}

const legacyCss = readFileSync('/tmp/index-6975672.html', 'utf8').match(
  /<style id="rcv-ring-style">([\s\S]*?)<\/style>/,
);
const vp1920 = { width: 1920, height: 1080 };
const base = await measure(null, vp1920);
console.log('current HEAD 1920', base);
