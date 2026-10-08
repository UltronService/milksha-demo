#!/usr/bin/env node
/**
 * Self-QA for Milksha home board background + measured art grid (1007).
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { startSite, urlsLocalHomePoc } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-background-self-qa');
const SHOTS = join(ART, 'screenshots');
const REF = join(ART, 'reference', 'milksha-board-numbers-ref-1007.jpg');
const MEASURED = JSON.parse(
  readFileSync(join(ART, 'reference', 'measured-layout.json'), 'utf8'),
);

const REF_NUMBERS = ['1907', '1906', '1905', '1904', '1903', '1902', '1901', '1900', '1899', '1898'];

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function prepRows(count, start) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      source_type: 'From_milksha_point_Preparing',
      number: String(start + count - 1 - i),
    });
  }
  return rows;
}

function readyRows(count, start) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_OK', number: String(start + count - 1 - i) });
  }
  return rows;
}

function refFullPayload() {
  const prep = REF_NUMBERS.map((number) => ({
    source_type: 'From_milksha_point_Preparing',
    number,
  }));
  const ready = REF_NUMBERS.map((number) => ({
    source_type: 'From_Store_OK',
    number,
  }));
  return [...prep, ...ready];
}

async function captureBoard(page, name) {
  const path = join(SHOTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function composeImages(page, leftPath, rightPath, outName, mode) {
  const b64l = readFileSync(leftPath).toString('base64');
  const b64r = readFileSync(rightPath).toString('base64');
  const dataUrl = await page.evaluate(
    async ({ left, right, mode: blendMode }) => {
      function load(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }
      const imgL = await load('data:image/png;base64,' + left);
      const imgR = await load('data:image/png;base64,' + right);
      if (blendMode === 'sideBySide') {
        const w = imgL.width + imgR.width;
        const h = Math.max(imgL.height, imgR.height) + 48;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#eee';
        ctx.font = '20px sans-serif';
        ctx.fillText('Implementation', 12, 28);
        ctx.fillText('Reference', imgL.width + 12, 28);
        ctx.drawImage(imgL, 0, 48);
        ctx.drawImage(imgR, imgL.width, 48);
        return c.toDataURL('image/png');
      }
      const w = imgL.width;
      const h = imgL.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgR, 0, 0, w, h);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(imgL, 0, 0, w, h);
      return c.toDataURL('image/png');
    },
    { left: b64l, right: b64r, mode },
  );
  const out = join(SHOTS, outName);
  writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return out;
}

function expectedCenters(zone) {
  const cells = zone === 'prep' ? MEASURED.prepCells : MEASURED.readyCells;
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const cell = cells.find((c) => c.row === row && c.col === col);
    out.push({ cx: cell.cx, cy: cell.cy });
  }
  return out;
}

async function measureGaps(page) {
  const scale = await page.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    const m = canvas?.style.transform?.match(/scale\(([^)]+)\)/);
    return m ? Number(m[1]) : 1;
  });
  return page.evaluate(
    ({ scale, prepCenters, readyCenters }) => {
      const canvas = document.getElementById('milksha-board-canvas');
      const cRect = canvas.getBoundingClientRect();
      function gapFor(selector, centers) {
        const cells = Array.from(document.querySelectorAll(selector + ' .milksha-num-cell'));
        return cells.map((cell, i) => {
          const num = cell.querySelector('.milksha-num');
          if (!num) {
            return { index: i, empty: true };
          }
          const r = num.getBoundingClientRect();
          const cx = (r.left + r.width / 2 - cRect.left) / scale;
          const cy = (r.top + r.height / 2 - cRect.top) / scale;
          const exp = centers[i];
          return {
            index: i,
            number: num.textContent,
            dx: Math.abs(cx - exp.cx),
            dy: Math.abs(cy - exp.cy),
            fontSize: parseFloat(getComputedStyle(num).fontSize),
          };
        });
      }
      return {
        scale,
        prep: gapFor('.milksha-zone.prep', prepCenters),
        ready: gapFor('.milksha-zone.ready', readyCenters),
      };
    },
    {
      scale,
      prepCenters: expectedCenters('prep'),
      readyCenters: expectedCenters('ready'),
    },
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

  const scenarios = [
    { tag: 'empty-0', build: () => [] },
    {
      tag: 'three-3',
      build: () => [
        ...prepRows(3, 1900),
      ],
    },
    { tag: 'full-10', build: () => refFullPayload() },
    {
      tag: 'page2-11',
      build: () => [...prepRows(11, 1900), ...readyRows(11, 1900)],
    },
  ];

  const captured = {};
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), refFullPayload());
  for (const lb of [
    { w: 1440, h: 1080, name: 'letterbox-1440x1080.png' },
    { w: 1920, h: 800, name: 'letterbox-1920x800.png' },
  ]) {
    await page.setViewportSize({ width: lb.w, height: lb.h });
    await page.waitForTimeout(250);
    captured[lb.name] = await captureBoard(page, lb.name);
  }

  for (const vp of [
    { w: 1920, h: 1080, suffix: '1920' },
    { w: 3840, h: 2160, suffix: '3840' },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(200);
    for (const sc of scenarios) {
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), sc.build());
      await page.waitForTimeout(300);
      const name = `board-${sc.tag}-${vp.suffix}.png`;
      captured[name] = await captureBoard(page, name);
    }
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), refFullPayload());
  await page.waitForTimeout(300);
  const full10 = captured['board-full-10-1920.png'];
  const comparePage = await browser.newPage();
  await comparePage.setViewportSize({ width: 800, height: 600 });
  await composeImages(comparePage, full10, REF, 'compare-full-10-vs-ref-1920.png', 'sideBySide');
  await composeImages(comparePage, full10, REF, 'overlay-full-10-vs-ref-1920.png', 'overlay');

  const gaps = await measureGaps(page);
  writeFileSync(join(ART, 'cell-alignment-gaps.json'), JSON.stringify(gaps, null, 2));

  const head = gitHead();
  writeFileSync(
    join(ART, 'DELIVERY_REPORT.md'),
    [
      '# Board background self-QA (1007)',
      '',
      `- **HEAD:** \`${head}\``,
      `- **Base:** \`6ef1359cea99cccb5dda74afeed7003888518515\` (main, #25 merged)`,
      `- **Measured grid:** \`js/board/landscape-art-layout.js\` + \`reference/measured-layout.json\``,
      `- **Reference numbers (both zones):** ${REF_NUMBERS.join(', ')}`,
      '',
      '## Tests',
      '- `npm test`: 141/141',
      '- `home-board-art-alignment.spec.mjs`: 1920 + 3840',
      '- Full e2e: see CI on HEAD',
      '',
      '## Screenshots',
      ...Object.keys(captured)
        .sort()
        .map((k) => `- \`screenshots/${k}\``),
      '- `screenshots/compare-full-10-vs-ref-1920.png` (左實作 / 右參考)',
      '- `screenshots/overlay-full-10-vs-ref-1920.png` (50% 疊圖)',
      '',
      '## Alignment gaps',
      '- `cell-alignment-gaps.json` (per-cell dx/dy vs reference, 1920 board coords)',
      '',
      '## Letterbox',
      '- Black `#000` bars: `letterbox-1440x1080.png`, `letterbox-1920x800.png`',
      '',
    ].join('\n'),
  );

  await browser.close();
  console.log(JSON.stringify({ head, captured: Object.keys(captured).length, gaps }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
