#!/usr/bin/env node
/**
 * Compare static background pixels: empty live board vs icon mockup (1920×1080 PNGs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const artDir = join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
const baselinePath = join(artDir, 'live-board-baseline-1920x1080.png');
const mockPath = join(artDir, 'source-icons-full-1920x1080.png');

async function loadPixels(path) {
  const b64 = readFileSync(path).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async (imgB64) => {
    const img = await new Promise(function (resolve, reject) {
      const el = new Image();
      el.onload = function () {
        resolve(el);
      };
      el.onerror = reject;
      el.src = 'data:image/png;base64,' + imgB64;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  }, b64);
  await browser.close();
  return out;
}

function isInnerCream(r, g, b) {
  return r >= 253 && g >= 249 && b >= 193 && b <= 222;
}

function isDynamicInk(r, g, b) {
  return r < 120 && g < 120 && b < 120;
}

async function main() {
  const a = await loadPixels(baselinePath);
  const b = await loadPixels(mockPath);
  if (a.length !== b.length) {
    throw new Error('image size mismatch');
  }
  let bgSame = 0;
  let bgTotal = 0;
  let creamDiff = 0;
  let creamTotal = 0;
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i];
    const g = a[i + 1];
    const b1 = a[i + 2];
    const inCream = isInnerCream(r, g, b1);
    const inkA = isDynamicInk(r, g, b1);
    const inkB = isDynamicInk(b[i], b[i + 1], b[i + 2]);
    if (inCream) {
      creamTotal += 1;
      if (inkA || inkB) {
        creamDiff += 1;
      }
      continue;
    }
    bgTotal += 1;
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) {
      bgSame += 1;
    }
  }
  const report = {
    baselinePng: baselinePath,
    mockPng: mockPath,
    backgroundAsset: 'assets/milksha-board-bg-1007.jpg',
    nonCreamPixelMatchRatio: bgTotal ? bgSame / bgTotal : 1,
    creamPixelsWithInkEitherImage: creamDiff,
    creamPixelTotal: creamTotal,
  };
  const outPath = join(artDir, 'background-compare.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.nonCreamPixelMatchRatio < 0.998) {
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
