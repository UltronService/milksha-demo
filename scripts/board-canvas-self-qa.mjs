#!/usr/bin/env node
/**
 * Self-QA evidence for fixed 1920×1080 board canvas + uniform scale.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { startSite, urlsLocalHomePoc } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-canvas-self-qa');
const SHOTS = join(ART, 'screenshots');

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function pixelDiffPercent(page, pathA, pathB, downscaleBTo) {
  const b64a = readFileSync(pathA).toString('base64');
  const b64b = readFileSync(pathB).toString('base64');
  return page.evaluate(
    async ({ a, b, targetW, targetH }) => {
      function load(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }
      const imgA = await load('data:image/png;base64,' + a);
      const imgB = await load('data:image/png;base64,' + b);
      const w = targetW || imgA.width;
      const h = targetH || imgA.height;
      const cA = document.createElement('canvas');
      cA.width = w;
      cA.height = h;
      const cB = document.createElement('canvas');
      cB.width = w;
      cB.height = h;
      const ctxA = cA.getContext('2d');
      const ctxB = cB.getContext('2d');
      ctxA.drawImage(imgA, 0, 0, w, h);
      ctxB.drawImage(imgB, 0, 0, w, h);
      const da = ctxA.getImageData(0, 0, w, h).data;
      const db = ctxB.getImageData(0, 0, w, h).data;
      let diff = 0;
      const len = da.length;
      for (let i = 0; i < len; i += 4) {
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
          diff += 1;
        }
      }
      const pixels = w * h;
      return { diffPixels: diff, totalPixels: pixels, percent: (diff / pixels) * 100 };
    },
    { a: b64a, b: b64b, targetW: downscaleBTo?.w, targetH: downscaleBTo?.h },
  );
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  await startSite();
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const { board: boardUrl } = urlsLocalHomePoc();
  await page.goto(boardUrl);
  await page.waitForFunction(() => window.QMS?.runtime?.applyPayload, { timeout: 25000 });
  await page.evaluate(() =>
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '8101' },
      { source_type: 'From_Store_Preparing', number: '8102' },
      { source_type: 'From_Store_OK', number: '7201' },
      { source_type: 'From_Store_OK', number: '8888' },
    ]),
  );

  const shots = {};
  for (const vp of [
    { w: 1920, h: 1080, name: 'board-numbers-1920x1080-dpr1.png' },
    { w: 3840, h: 2160, name: 'board-numbers-3840x2160-dpr1.png' },
    { w: 1440, h: 1080, name: 'board-letterbox-1440x1080.png' },
    { w: 1920, h: 800, name: 'board-letterbox-1920x800.png' },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(250);
    const path = join(SHOTS, vp.name);
    await page.screenshot({ path, fullPage: false });
    shots[vp.name] = path;
  }

  const pageDpr2 = await browser.newPage({ deviceScaleFactor: 2 });
  await pageDpr2.goto(boardUrl);
  await pageDpr2.waitForFunction(() => window.QMS?.runtime?.applyPayload, { timeout: 25000 });
  await pageDpr2.evaluate(() =>
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '8101' },
      { source_type: 'From_Store_OK', number: '8888' },
    ]),
  );
  await pageDpr2.setViewportSize({ width: 1920, height: 1080 });
  await pageDpr2.waitForTimeout(250);
  const dpr2Path = join(SHOTS, 'board-numbers-1920x1080-dpr2.png');
  await pageDpr2.screenshot({ path: dpr2Path, fullPage: false });
  shots['board-numbers-1920x1080-dpr2.png'] = dpr2Path;

  const compare = await pixelDiffPercent(page, shots['board-numbers-1920x1080-dpr1.png'], shots['board-numbers-3840x2160-dpr1.png'], {
    w: 1920,
    h: 1080,
  });

  const modernCss = [
    'CSS transform: scale() on .milksha-board-canvas (supported Chromium 80+)',
    'flexbox on .milksha-stage (legacy)',
    'CSS custom properties --milksha-* (legacy)',
    'No aspect-ratio or container queries',
  ];

  const report = {
    at: new Date().toISOString(),
    head: gitHead(),
    pixelDiff3840DownscaledVs1920: compare,
    screenshots: shots,
    modernCssUsed: modernCss,
    resizeWithoutReload: 'manual: e2e home-board-canvas-scale.spec.mjs',
    overlayPosition: 'overlays inside #milksha-board-canvas; e2e asserts bounds',
  };
  writeFileSync(join(ART, 'self-qa-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
