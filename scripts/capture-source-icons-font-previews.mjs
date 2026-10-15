#!/usr/bin/env node
/**
 * Capture uniform-font preview boards at 1920×1080 (A: 81px, B: max fit ~76.6px).
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoOutDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
const agentStoreDir = '/cursor/stores/self/artifacts';

/**
 * @param {string} filePath
 */
function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * @returns {number}
 */
function readMaxFitFontPx() {
  const reportPath = path.join(repoOutDir, 'max-uniform-font-report.json');
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const prep = report.maxUniformFontPx?.prepOnly_actualSamples?.fontPx;
    const ready = report.maxUniformFontPx?.readyOnly_actualSamples?.fontPx;
    if (Number.isFinite(prep) && Number.isFinite(ready)) {
      return Math.min(prep, ready);
    }
  } catch {
    /* fall through */
  }
  return 76.57421875;
}

/**
 * @param {number} port
 * @param {{ fontPx: number, outName: string, label: string, markOverflow: boolean }} spec
 */
async function capturePreview(port, spec) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const query =
    'fontPx=' +
    encodeURIComponent(String(spec.fontPx)) +
    '&markOverflow=' +
    (spec.markOverflow ? '1' : '0') +
    '&label=' +
    encodeURIComponent(spec.label);
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
  await page.waitForTimeout(300);
  const outPath = path.join(repoOutDir, spec.outName);
  await page.screenshot({ path: outPath, type: 'png' });
  const meta = await page.evaluate(function () {
    const rootEl = document.getElementById('board-root');
    return {
      fontPx: rootEl ? rootEl.dataset.fontPreviewPx : null,
      overflowCount: rootEl ? rootEl.dataset.fontPreviewOverflowCount : null,
    };
  });
  await browser.close();
  return { outPath, meta };
}

async function main() {
  mkdirSync(repoOutDir, { recursive: true });
  mkdirSync(agentStoreDir, { recursive: true });

  const maxFitPx = readMaxFitFontPx();
  const maxFitRounded = Math.round(maxFitPx * 100) / 100;

  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);

  const specA = {
    fontPx: 81,
    outName: 'source-icons-font-preview-81px-1920x1080.png',
    label: 'A) 正式看板字級 81px',
    markOverflow: true,
  };
  const specB = {
    fontPx: maxFitPx,
    outName: 'source-icons-font-preview-maxfit-1920x1080.png',
    label: 'B) 兩區同字級最大可 fit ≈' + maxFitRounded + 'px',
    markOverflow: false,
  };

  const capA = await capturePreview(port, specA);
  const capB = await capturePreview(port, specB);

  await new Promise(function (resolve) {
    server.close(function () {
      resolve(undefined);
    });
  });

  const files = [
    {
      repoName: specA.outName,
      storeName: 'source-icons-font-preview-81px-1920x1080.png',
      description: specA.label,
      fontPx: 81,
      ...capA.meta,
    },
    {
      repoName: specB.outName,
      storeName: 'source-icons-font-preview-maxfit-1920x1080.png',
      description: specB.label,
      fontPx: maxFitPx,
      approxLabelPx: maxFitRounded,
      ...capB.meta,
    },
  ];

  const manifest = {
    capturedAtUtc: new Date().toISOString(),
    viewport: '1920x1080',
    rules: {
      background: 'assets/milksha-board-bg-1007.jpg',
      productionBoardNumbers: true,
      noChipScale: true,
      uniformFontBothZones: true,
      foodpandaHashPrefix: true,
      icons: 'equal cap height, object-fit contain (nidin 183×91, fp 800×782, uber 800×800)',
    },
    files: [],
  };

  for (const f of files) {
    const repoPath = path.join(repoOutDir, f.repoName);
    const storePath = path.join(agentStoreDir, f.storeName);
    copyFileSync(repoPath, storePath);
    const sha256 = sha256File(repoPath);
    manifest.files.push({
      name: f.storeName,
      repoPath: 'mockups/artifacts/source-icons-mockup/' + f.repoName,
      sha256: sha256,
      fontPx: f.fontPx,
      overflowCount: f.overflowCount,
      description: f.description,
    });
  }

  const manifestRepo = path.join(repoOutDir, 'source-icons-font-preview-manifest.json');
  const manifestStore = path.join(agentStoreDir, 'source-icons-font-preview-manifest.json');
  writeFileSync(manifestRepo, JSON.stringify(manifest, null, 2));
  writeFileSync(manifestStore, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
