#!/usr/bin/env node
/**
 * Capture 1920×1080 PNGs for mockups/source-icons*.html
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');

async function capture(pagePath, outName) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const url = 'file://' + path.join(rootDir, 'mockups', pagePath);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });
  if (pagePath === 'source-icons.html') {
    await page.waitForFunction(function () {
      return document.querySelector('[data-mockup-layout-ready="true"]') !== null;
    });
  }
  await page.waitForTimeout(400);
  const outPath = path.join(outDir, outName);
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  return outPath;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { spawnSync } = await import('node:child_process');
  const check = spawnSync(process.execPath, ['scripts/check-source-icons-mockup.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    console.error(check.stdout || check.stderr);
    process.exit(check.status || 1);
  }
  const full = await capture('source-icons.html', 'source-icons-full-1920x1080.png');
  const zoom = await capture('source-icons-zoom.html', 'source-icons-zoom-1920x1080.png');
  console.log(JSON.stringify({ full, zoom }, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
