#!/usr/bin/env node
/**
 * Capture 1920×1080 PNGs: live baseline vs icon mockup on real board.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';
import { runLayoutCheck } from './check-source-icons-mockup.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
const MOCKUP_PORT = Number(process.env.SOURCE_ICONS_MOCKUP_PORT || 0);

async function capture(pagePath, outName, query, port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const q = query ? '?' + query : '';
  const url = 'http://127.0.0.1:' + port + '/mockups/' + pagePath + q;
  await page.goto(url, { waitUntil: 'networkidle' });
  if (pagePath === 'source-icons.html') {
    await page.waitForFunction(function () {
      const rootEl = document.getElementById('board-root');
      return rootEl && rootEl.dataset.mockupLayoutReady === 'true';
    });
  } else {
    await page.waitForTimeout(500);
  }
  if (pagePath === 'source-icons.html' && (!query || query.indexOf('baseline') < 0)) {
    await page.waitForFunction(function () {
      var imgs = document.querySelectorAll('.source-icons-live__icon');
      for (var i = 0; i < imgs.length; i += 1) {
        if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
          return false;
        }
      }
      return imgs.length > 0;
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
  const server = await startStaticServer(rootDir, MOCKUP_PORT);
  const port = serverPort(server);
  const report = await runLayoutCheck({ skipServer: true, port: port });
  const outCheck = path.join(outDir, 'layout-check.json');
  fs.writeFileSync(outCheck, JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    await new Promise(function (resolve) {
      server.close(function () {
        resolve(undefined);
      });
    });
    process.exit(1);
  }

  const baseline = await capture(
    'source-icons.html',
    'live-board-baseline-1920x1080.png',
    'baseline=1',
    port,
  );
  await capture(
    'source-icons.html',
    'live-board-numbers-no-icons-1920x1080.png',
    'baseline=numbers',
    port,
  );
  const full = await capture('source-icons.html', 'source-icons-full-1920x1080.png', '', port);
  const zoom = await capture('source-icons-zoom.html', 'source-icons-zoom-1920x1080.png', '', port);

  await new Promise(function (resolve) {
    server.close(function () {
      resolve(undefined);
    });
  });

  console.log(
    JSON.stringify(
      {
        backgroundAsset: 'assets/milksha-board-bg-1007.jpg',
        baseline,
        full,
        zoom,
      },
      null,
      2,
    ),
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
