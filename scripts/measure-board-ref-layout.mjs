#!/usr/bin/env node
/**
 * Measure cream boxes and infer grid from reference JPEG (1920×1080).
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ROOT, 'artifacts/board-background-self-qa/reference/milksha-board-numbers-ref-1007.jpg');

async function main() {
  const b64 = readFileSync(REF).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async (imgB64) => {
    function isCream(r, g, b) {
      return r > 248 && g > 245 && b > 215 && b < 250 && Math.abs(r - g) < 8;
    }
    function load(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }
    const img = await load('data:image/jpeg;base64,' + imgB64);
    const w = img.width;
    const h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    function creamBBox(x0, x1) {
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      let count = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (isCream(r, g, b)) {
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
      if (count < 100) {
        return null;
      }
      return { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    const prep = creamBBox(0, Math.floor(w / 2));
    const ready = creamBBox(Math.floor(w / 2), w);

    /** Dark text pixel on cream */
    function isText(r, g, b) {
      return r < 80 && g < 80 && b < 80;
    }

    function findTextCentroids(box, cols, rows) {
      const cellW = box.width / cols;
      const cellH = box.height / rows;
      const centers = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const xStart = Math.floor(box.left + col * cellW);
          const xEnd = Math.floor(box.left + (col + 1) * cellW);
          const yStart = Math.floor(box.top + row * cellH);
          const yEnd = Math.floor(box.top + (row + 1) * cellH);
          let sumX = 0;
          let sumY = 0;
          let n = 0;
          let minTy = yEnd;
          let maxTy = yStart;
          for (let y = yStart; y < yEnd; y += 1) {
            for (let x = xStart; x < xEnd; x += 1) {
              const i = (y * w + x) * 4;
              if (isText(data[i], data[i + 1], data[i + 2])) {
                sumX += x;
                sumY += y;
                n += 1;
                if (y < minTy) {
                  minTy = y;
                }
                if (y > maxTy) {
                  maxTy = y;
                }
              }
            }
          }
          centers.push({
            row,
            col,
            cx: n ? sumX / n : xStart + cellW / 2,
            cy: n ? sumY / n : yStart + cellH / 2,
            textH: n ? maxTy - minTy + 1 : 0,
            pixels: n,
          });
        }
      }
      return centers;
    }

    const prepCells = findTextCentroids(prep, 2, 5);
    const readyCells = findTextCentroids(ready, 2, 5);

    return { w, h, prep, ready, prepCells, readyCells };
  }, b64);

  await browser.close();
  const path = join(ROOT, 'artifacts/board-background-self-qa/reference/measured-layout.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
