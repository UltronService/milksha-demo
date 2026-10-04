#!/usr/bin/env node
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const viewports = [
  { tag: '1920x1080', width: 1920, height: 1080 },
  { tag: '1366x768', width: 1366, height: 768 },
  { tag: '1280x720', width: 1280, height: 720 },
  { tag: '2560x1080', width: 2560, height: 1080 },
  { tag: '2560x1440', width: 2560, height: 1440 },
];

async function serveRoot(rootDir) {
  const server = createServer((req, res) => {
    let p = req.url?.split('?')[0] || '/';
    if (p === '/') p = '/receiver-demo/index.html';
    try {
      const file = join(rootDir, decodeURIComponent(p.replace(/^\//, '')));
      const data = readFileSync(file);
      const ext = file.split('.').pop();
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function measure(base, vp, digits) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(`${base}/receiver-demo/?mode=local&store=s120030`);
  await page.waitForFunction(() => window.QMS?.Receiver?.RingHost?.playReadyRing, null, {
    timeout: 15000,
  });
  await page.evaluate((num) => {
    const RH = window.QMS.Receiver.RingHost;
    if (typeof RH.showRingOverlayForTests === 'function') {
      RH.showRingOverlayForTests(num);
    } else {
      RH.playReadyRing(num);
    }
  }, digits);
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
  await browser.close();
  return m;
}

const { server, base } = await serveRoot('/workspace');
console.log('\n=== HEAD ring CSS ===');
for (const vp of viewports) {
  const m = await measure(base, vp, '8888');
  console.log(vp.tag, JSON.stringify(m));
}
server.close();
