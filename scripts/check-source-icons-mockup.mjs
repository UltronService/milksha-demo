#!/usr/bin/env node
/**
 * Pixel-cream + element bbox QA for mockups/source-icons.html (1920×1080).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG_PATH = path.join(rootDir, 'assets', 'milksha-board-bg-1007.jpg');
const CREAM_EDGE_INSET_PX = 12;
const MIN_COLUMN_GAP_PX = 8;
const MIN_ICON_NUM_GAP_PX = 4;
const READY_MIN_RATIO = 1.2;
const BBOX_TOL_PX = 1;

/** @typedef {{ ok: boolean, issues: string[], metrics: Record<string, unknown> }} Report */

async function runLayoutCheck() {
  const bgB64 = readFileSync(BG_PATH).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const url = 'file://' + path.join(rootDir, 'mockups', 'source-icons.html');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    return document.querySelector('[data-mockup-layout-ready="true"]') !== null;
  });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });

  /** @type {Report} */
  const report = await page.evaluate(
    async function (args) {
      const limits = args.limits;
      const issues = [];
      const metrics = {};

      function isInnerCream(r, g, b) {
        return r >= 253 && g >= 249 && b >= 193 && b <= 222;
      }

      /**
       * @param {ImageData} data
       * @param {number} w
       * @param {number} h
       * @param {number} x0
       * @param {number} x1
       */
      function creamBBoxFromPixels(data, w, h, x0, x1) {
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        let count = 0;
        for (let y = 320; y < h; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * w + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (isInnerCream(r, g, b)) {
              count += 1;
              if (x < minX) {
                minX = x;
              }
              if (y < minY) {
                minY = y;
              }
              if (x > maxX) {
                maxX = x;
              }
              if (y > maxY) {
                maxY = y;
              }
            }
          }
        }
        if (count < 1000) {
          return null;
        }
        return {
          left: minX,
          top: minY,
          right: maxX,
          bottom: maxY,
        };
      }

      const img = await new Promise(function (resolve, reject) {
        const el = new Image();
        el.onload = function () {
          resolve(el);
        };
        el.onerror = reject;
        el.src = 'data:image/jpeg;base64,' + args.bgB64;
      });
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { ok: false, issues: ['canvas 2d missing'], metrics: {} };
      }
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, w, h);

      const creamPrep = creamBBoxFromPixels(pixels.data, w, h, 0, Math.floor(w / 2));
      const creamReady = creamBBoxFromPixels(pixels.data, w, h, Math.floor(w / 2), w);
      metrics.creamPrepPixel = creamPrep;
      metrics.creamReadyPixel = creamReady;

      if (!creamPrep || !creamReady) {
        issues.push('pixel cream detect failed');
        return { ok: false, issues: issues, metrics: metrics };
      }

      /**
       * @param {DOMRect} rect
       * @param {{ left: number, top: number, right: number, bottom: number }} cream
       * @param {string} label
       */
      function assertInsideCream(rect, cream, label) {
        const inset = limits.creamInset;
        const inner = {
          left: cream.left + inset,
          right: cream.right - inset,
          top: cream.top + inset,
          bottom: cream.bottom - inset,
        };
        if (rect.left < inner.left - limits.bboxTol) {
          issues.push(label + ' left ' + rect.left.toFixed(1) + '<' + inner.left);
        }
        if (rect.right > inner.right + limits.bboxTol) {
          issues.push(label + ' right ' + rect.right.toFixed(1) + '>' + inner.right);
        }
        if (rect.top < inner.top - limits.bboxTol) {
          issues.push(label + ' top ' + rect.top.toFixed(1) + '<' + inner.top);
        }
        if (rect.bottom > inner.bottom + limits.bboxTol) {
          issues.push(label + ' bottom ' + rect.bottom.toFixed(1) + '>' + inner.bottom);
        }
      }

      /**
       * @param {DOMRect} a
       * @param {DOMRect} b
       */
      function rectsOverlap(a, b) {
        return !(
          a.right <= b.left + limits.bboxTol ||
          b.right <= a.left + limits.bboxTol ||
          a.bottom <= b.top + limits.bboxTol ||
          b.bottom <= a.top + limits.bboxTol
        );
      }

      ['prep', 'ready'].forEach(function (zone) {
        const cream = zone === 'ready' ? creamReady : creamPrep;
        const layer = document.querySelector('.source-icons-mockup__layer[data-zone="' + zone + '"]');
        if (!layer) {
          issues.push(zone + ': missing layer');
          return;
        }

        const fontPx = Number.parseFloat(layer.dataset.zoneFontPx || '0');
        metrics[zone + 'FontPx'] = fontPx;

        /** @type {Record<number, DOMRect[]>} */
        const rowParts = { 0: [], 1: [], 2: [], 3: [], 4: [] };
        /** @type {Record<number, DOMRect | null>} */
        const rowUnion = { 0: null, 1: null, 2: null, 3: null, 4: null };

        layer.querySelectorAll('.source-icons-mockup__cell').forEach(function (cell) {
          const rowIdx = Number(cell.dataset.row);
          const col = Number(cell.dataset.col);
          const icon = cell.querySelector('.source-icons-mockup__icon');
          const num = cell.querySelector('.source-icons-mockup__num');
          if (icon) {
            const ir = icon.getBoundingClientRect();
            assertInsideCream(ir, cream, zone + ' c' + col + ' r' + rowIdx + ' icon');
            rowParts[rowIdx].push(ir);
          }
          if (num) {
            const nr = num.getBoundingClientRect();
            assertInsideCream(nr, cream, zone + ' c' + col + ' r' + rowIdx + ' num');
            rowParts[rowIdx].push(nr);
          }
          if (icon && num) {
            const slot = cell.querySelector('.source-icons-mockup__icon-slot');
            const slotRight = slot ? slot.getBoundingClientRect().right : icon.getBoundingClientRect().right;
            const gap = num.getBoundingClientRect().left - slotRight;
            if (gap < limits.iconGapMin - 0.5) {
              issues.push(
                zone + ' c' + col + ' r' + rowIdx + ' slot-num gap=' + gap.toFixed(2),
              );
            }
          }
          const row = cell.querySelector('.source-icons-mockup__row');
          if (row) {
            const rr = row.getBoundingClientRect();
            rowParts[rowIdx].push(rr);
            if (!rowUnion[rowIdx]) {
              rowUnion[rowIdx] = rr;
            } else {
              rowUnion[rowIdx] = {
                left: Math.min(rowUnion[rowIdx].left, rr.left),
                top: Math.min(rowUnion[rowIdx].top, rr.top),
                right: Math.max(rowUnion[rowIdx].right, rr.right),
                bottom: Math.max(rowUnion[rowIdx].bottom, rr.bottom),
                width: 0,
                height: 0,
                x: 0,
                y: 0,
                toJSON: function () {
                  return {};
                },
              };
            }
          }
        });

        /** @type {Record<number, { left: DOMRect | null, right: DOMRect | null }>} */
        const byRowCol = {};
        layer.querySelectorAll('.source-icons-mockup__cell').forEach(function (cell) {
          const rowIdx = Number(cell.dataset.row);
          const col = Number(cell.dataset.col);
          if (!byRowCol[rowIdx]) {
            byRowCol[rowIdx] = { left: null, right: null };
          }
          const row = cell.querySelector('.source-icons-mockup__row');
          if (!row) {
            return;
          }
          const rr = row.getBoundingClientRect();
          if (col === 0) {
            byRowCol[rowIdx].left = rr;
          } else {
            byRowCol[rowIdx].right = rr;
          }
        });

        for (let r = 0; r < 5; r += 1) {
          const pair = byRowCol[r];
          if (!pair || !pair.left || !pair.right) {
            continue;
          }
          const gap = pair.right.left - pair.left.right;
          metrics[zone + 'Row' + r + 'ColGap'] = gap;
          if (gap < limits.colGapMin) {
            issues.push(zone + ' row' + r + ' columns overlap gap=' + gap.toFixed(1));
          }
          if (rectsOverlap(pair.left, pair.right)) {
            issues.push(zone + ' row' + r + ' row boxes intersect');
          }
        }
      });

      const prepLayer = document.querySelector('.source-icons-mockup__layer[data-zone="prep"]');
      const readyLayer = document.querySelector('.source-icons-mockup__layer[data-zone="ready"]');
      const prepFont = prepLayer ? Number.parseFloat(prepLayer.dataset.zoneFontPx || '0') : 0;
      const readyFont = readyLayer ? Number.parseFloat(readyLayer.dataset.zoneFontPx || '0') : 0;
      const ratio = prepFont > 0 ? readyFont / prepFont : 0;
      metrics.readyToPrepFontRatio = ratio;
      metrics.readyTargetRatio = 1.3;
      if (ratio < limits.readyMinRatio - 0.01) {
        issues.push(
          'ready/prep font ratio ' + ratio.toFixed(3) + '<' + limits.readyMinRatio,
        );
      }

      return { ok: issues.length === 0, issues: issues, metrics: metrics };
    },
    {
      bgB64: bgB64,
      limits: {
        creamInset: CREAM_EDGE_INSET_PX,
        colGapMin: MIN_COLUMN_GAP_PX,
        iconGapMin: MIN_ICON_NUM_GAP_PX,
        readyMinRatio: READY_MIN_RATIO,
        bboxTol: BBOX_TOL_PX,
      },
    },
  );

  await browser.close();
  return report;
}

async function main() {
  const report = await runLayoutCheck();
  const outPath = path.join(
    rootDir,
    'mockups',
    'artifacts',
    'source-icons-mockup',
    'layout-check.json',
  );
  await import('node:fs/promises').then(function (fs) {
    return fs.mkdir(path.dirname(outPath), { recursive: true }).then(function () {
      return fs.writeFile(outPath, JSON.stringify(report, null, 2));
    });
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
