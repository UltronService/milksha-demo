#!/usr/bin/env node
/**
 * UI/UX font previews @ 1920×1080 viewport, PNG @2x device scale.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoOutDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
const agentStoreDir = '/cursor/stores/self/artifacts';
const LIVE_FONT = 81;
const OWNER_ALT_SIZES = [72, 68, 64];

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function previewFileName(fontPx) {
  return 'source-icons-font-preview-' + fontPx + 'px-1920x1080.png';
}

function readMaxFontIconPlus5() {
  const reportPath = path.join(repoOutDir, 'max-uniform-font-report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const fontPx = report.maxUniformFontPx_bothZonesSame?.worstCase_iconPlus5Chars?.fontPx;
  if (!Number.isFinite(fontPx)) {
    throw new Error('Run report-source-icons-max-font.mjs first');
  }
  return fontPx;
}

/**
 * @param {import('playwright').Browser} browser
 * @param {number} port
 * @param {{ fontPx: number, outName: string }} spec
 */
async function capturePreview(browser, port, spec) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const query = 'fontPx=' + encodeURIComponent(String(spec.fontPx)) + '&markOverflow=0';
  const url = 'http://127.0.0.1:' + port + '/mockups/source-icons-font-preview.html?' + query;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    const rootEl = document.getElementById('board-root');
    return rootEl && rootEl.dataset.mockupLayoutReady === 'true';
  });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('.source-icons-live__icon');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return imgs.length > 0;
  });
  await page.waitForTimeout(400);
  const outPath = path.join(repoOutDir, spec.outName);
  await page.screenshot({ path: outPath, type: 'png' });
  const meta = await page.evaluate(function () {
    const rootEl = document.getElementById('board-root');
    return {
      fontPx: rootEl ? rootEl.dataset.fontPreviewPx : null,
      overflowCount: rootEl ? rootEl.dataset.fontPreviewOverflowCount : null,
      numLeftDeltaPx: rootEl ? rootEl.dataset.uiuxNumLeftDeltaPx : null,
      gapErrors: rootEl ? rootEl.dataset.uiuxGapErrors : null,
    };
  });
  await page.close();
  return { outPath, meta };
}

/**
 * @param {import('playwright').Browser} browser
 * @param {number} port
 * @param {number[]} sizes
 */
async function captureCompareRow(browser, port, sizes) {
  const gap = 24;
  const labelH = 56;
  const panelW = 1920;
  const w = panelW * sizes.length + gap * (sizes.length - 1);
  const h = labelH + 1080;
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
  });
  const url =
    'http://127.0.0.1:' +
    port +
    '/mockups/source-icons-font-compare.html?sizes=' +
    encodeURIComponent(sizes.join(','));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('.compare-col img');
    if (imgs.length < 1) {
      return false;
    }
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });
  await page.waitForTimeout(300);
  const outName = 'source-icons-font-preview-compare-' + sizes.join('-') + 'px-1920x1080.png';
  const outPath = path.join(repoOutDir, outName);
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
  return { outPath, meta: { compareSizes: sizes.join(',') } };
}

async function main() {
  mkdirSync(repoOutDir, { recursive: true });
  mkdirSync(agentStoreDir, { recursive: true });

  execSync('node scripts/report-source-icons-max-font.mjs', {
    cwd: rootDir,
    stdio: 'pipe',
  });

  const maxFit5 = readMaxFontIconPlus5();
  const skipB = maxFit5 >= LIVE_FONT - 0.01;

  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);
  const browser = await chromium.launch();

  const captures = [];

  captures.push(
    await capturePreview(browser, port, {
      fontPx: LIVE_FONT,
      outName: previewFileName(LIVE_FONT),
    }),
  );

  for (let i = 0; i < OWNER_ALT_SIZES.length; i += 1) {
    const px = OWNER_ALT_SIZES[i];
    captures.push(
      await capturePreview(browser, port, {
        fontPx: px,
        outName: previewFileName(px),
      }),
    );
  }

  captures.push(await captureCompareRow(browser, port, OWNER_ALT_SIZES));

  let bNote = null;
  if (!skipB) {
    captures.push(
      await capturePreview(browser, port, {
        fontPx: maxFit5,
        outName: 'source-icons-font-preview-maxfit-1920x1080.png',
      }),
    );
  } else {
    bNote =
      'B skipped: icon+5-char max uniform font ' +
      maxFit5 +
      'px >= 81px; only A delivered.';
  }

  await browser.close();
  await new Promise(function (resolve) {
    server.close(function () {
      resolve(undefined);
    });
  });

  const manifest = {
    capturedAtUtc: new Date().toISOString(),
    viewportLogical: '1920x1080',
    deviceScaleFactor: 2,
    pngPixelSize: '3840x2160',
    ownerAltSizesPx: OWNER_ALT_SIZES,
    uiuxSpec: {
      slotWidth: '1.0F',
      gap: '0.2F',
      fpUberHeight: '0.8F',
      fpWidth: '1.02×height',
      nidinHeight: '0.5F proportional',
      nidinAsset: 'assets/source-icons/nidin.png',
      storeEmptySlot: true,
    },
    maxFontReport: JSON.parse(
      readFileSync(path.join(repoOutDir, 'max-uniform-font-report.json'), 'utf8'),
    ).maxUniformFontPx_bothZonesSame,
    bNote: bNote,
    files: [],
  };

  for (const cap of captures) {
    const base = path.basename(cap.outPath);
    const storePath = path.join(agentStoreDir, base);
    copyFileSync(cap.outPath, storePath);
    manifest.files.push({
      name: base,
      sha256: sha256File(cap.outPath),
      ...cap.meta,
    });
  }

  const manifestPaths = [
    path.join(repoOutDir, 'source-icons-font-preview-manifest.json'),
    path.join(agentStoreDir, 'source-icons-font-preview-manifest.json'),
  ];
  for (const p of manifestPaths) {
    writeFileSync(p, JSON.stringify(manifest, null, 2));
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
