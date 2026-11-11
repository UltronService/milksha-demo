#!/usr/bin/env node
/**
 * UI/UX font preview @ F=64: icons in S×S (S=0.8F), no clip, aspect preserved.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT_PX = 64;
const ICON_BOX_FACTOR = 0.8;
const RATIO_TOL = 0.01;
const SIZE_TOL = 0.75;

/**
 * @returns {Promise<{ ok: boolean, fontPx: number, sPx: number, icons: object[], failures: string[] }>}
 */
export async function runIconFitCheck() {
  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  await page.goto(
    'http://127.0.0.1:' + port + '/mockups/source-icons-font-preview.html?fontPx=' + FONT_PX + '&markOverflow=0',
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(function () {
    return document.getElementById('board-root')?.dataset.mockupLayoutReady === 'true';
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

  const result = await page.evaluate(function (opts) {
      const fontPx = opts.fontPx;
      const iconBoxFactor = opts.iconBoxFactor;
      const ratioTol = opts.ratioTol;
      const sizeTol = opts.sizeTol;
      function classKey(el) {
        if (el.classList.contains('source-icons-live__icon--nidin')) {
          return 'nidin';
        }
        if (el.classList.contains('source-icons-live__icon--fp')) {
          return 'fp';
        }
        if (el.classList.contains('source-icons-live__icon--uber')) {
          return 'uber';
        }
        return 'unknown';
      }

      /**
       * Painted size for object-fit: contain inside a square of side boxSide.
       * @returns {{ w: number, h: number, ratio: number }}
       */
      function containedPaintSize(natW, natH, boxSide) {
        const scale = Math.min(boxSide / natW, boxSide / natH);
        const w = natW * scale;
        const h = natH * scale;
        return { w: w, h: h, ratio: natW / natH };
      }

      const sPx = fontPx * iconBoxFactor;
      const rows = [];
      const failures = [];

      document.querySelectorAll('.source-icons-live__icon').forEach(function (img, idx) {
        const key = classKey(img);
        const box = img.closest('.source-icons-live__icon-box');
        const chip = img.closest('.milksha-board-chip');
        const br = box ? box.getBoundingClientRect() : null;
        const boxSide = br ? (br.width + br.height) / 2 : 0;
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;
        const natRatio = natW / natH;
        const painted = br ? containedPaintSize(natW, natH, boxSide) : { w: 0, h: 0, ratio: natRatio };
        const ratioDelta = Math.abs(painted.ratio - natRatio);
        const csImg = getComputedStyle(img);
        const row = {
          index: idx,
          sourceKey: key,
          itemId: chip ? chip.getAttribute('data-item-id') : null,
          natural_px: { w: natW, h: natH, ratio: natRatio },
          painted_px: { w: painted.w, h: painted.h, ratio: painted.ratio },
          box_px: br ? { w: br.width, h: br.height } : null,
          layout_px: {
            w: img.getBoundingClientRect().width,
            h: img.getBoundingClientRect().height,
          },
          ratio_delta: ratioDelta,
          object_fit: csImg.objectFit,
          container_clips_icon: br && (painted.w > boxSide + sizeTol || painted.h > boxSide + sizeTol),
        };
        rows.push(row);

        if (!box) {
          failures.push(key + ' #' + idx + ': missing .source-icons-live__icon-box wrapper');
        }
        if (ratioDelta >= ratioTol) {
          failures.push(
            key +
              ' ' +
              (row.itemId || '') +
              ': ratio delta ' +
              ratioDelta.toFixed(4) +
              ' >= ' +
              ratioTol,
          );
        }
        if (csImg.objectFit !== 'contain') {
          failures.push(key + ' ' + (row.itemId || '') + ': object-fit is ' + csImg.objectFit);
        }
        if (painted.w > sPx + sizeTol || painted.h > sPx + sizeTol) {
          failures.push(
            key +
              ' ' +
              (row.itemId || '') +
              ': painted ' +
              painted.w.toFixed(2) +
              '×' +
              painted.h.toFixed(2) +
              ' exceeds S=' +
              sPx,
          );
        }
        if (br && (br.width > sPx + sizeTol || br.height > sPx + sizeTol)) {
          failures.push(
            key + ' ' + (row.itemId || '') + ': icon box exceeds S×S (' + br.width + '×' + br.height + ')',
          );
        }
        if (row.container_clips_icon) {
          failures.push(
            key + ' ' + (row.itemId || '') + ': contained paint size inconsistent with S×S box',
          );
        }
        const csSlot = img.closest('.source-icons-live__icon-slot');
        const slotCs = csSlot ? getComputedStyle(csSlot) : null;
        if (slotCs && slotCs.overflow === 'hidden') {
          failures.push(key + ' ' + (row.itemId || '') + ': icon slot overflow is hidden');
        }
        const cs = box ? getComputedStyle(box) : null;
        if (cs && (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden')) {
          failures.push(key + ' ' + (row.itemId || '') + ': icon box overflow is hidden');
        }
      });

      return { fontPx: fontPx, sPx: sPx, icons: rows, failures: failures, ok: failures.length === 0 };
    }, {
    fontPx: FONT_PX,
    iconBoxFactor: ICON_BOX_FACTOR,
    ratioTol: RATIO_TOL,
    sizeTol: SIZE_TOL,
  });

  await browser.close();
  await new Promise(function (r) {
    server.close(function () {
      r(undefined);
    });
  });

  return result;
}

async function main() {
  const result = await runIconFitCheck();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}
