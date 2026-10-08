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
import { REF_BOARD_NUMBERS, buildRefBoardPayload } from '../tests/e2e/board-ref-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-background-self-qa');
const SHOTS = join(ART, 'screenshots');
const REF = join(ART, 'reference', 'milksha-board-numbers-ref-1007.jpg');

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

async function applyPayloadClean(page, rows) {
  await page.evaluate(() => window.QMS.runtime.applyPayload([]));
  await page.evaluate((payload) => window.QMS.runtime.applyPayload(payload), rows);
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
      const c = document.createElement('canvas');
      c.width = imgL.width;
      c.height = imgL.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgR, 0, 0, c.width, c.height);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(imgL, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    { left: b64l, right: b64r, mode },
  );
  const out = join(SHOTS, outName);
  writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return out;
}

async function measureAlignmentReport(page) {
  const scale = await page.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    const m = canvas?.style.transform?.match(/scale\(([^)]+)\)/);
    return m ? Number(m[1]) : 1;
  });
  return page.evaluate((s) => {
    const art = window.QMS.Board.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas.getBoundingClientRect();
    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = '400 ' + art.NUM_FONT_PX + 'px Arial';

    function refInkBox(text) {
      const m = mctx.measureText(text);
      const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
      const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
      return { capHeight: h, inkWidth: w };
    }

    function implInk(el) {
      const style = getComputedStyle(el);
      mctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const text = el.textContent || '';
      const m = mctx.measureText(text);
      const r = el.getBoundingClientRect();
      return {
        text,
        capHeight: (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0),
        inkWidth: (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0),
        domBox: {
          left: (r.left - cRect.left) / s,
          top: (r.top - cRect.top) / s,
          width: r.width / s,
          height: r.height / s,
        },
        center: {
          cx: (r.left + r.width / 2 - cRect.left) / s,
          cy: (r.top + r.height / 2 - cRect.top) / s,
        },
      };
    }

    function zoneReport(selector, zoneKey) {
      const cells = Array.from(document.querySelectorAll(selector + ' .milksha-num-cell'));
      return cells.map((cell, index) => {
        const num = cell.querySelector('.milksha-num');
        const exp = art.cellCenterBoard(zoneKey, index);
        const impl = num ? implInk(num) : null;
        const refSample = refInkBox(art.REF_INK_SAMPLE_TEXT);
        return {
          index,
          number: num?.textContent || null,
          expectedCenter: exp,
          implementation: impl,
          referenceInk1907: refSample,
          delta:
            impl && num
              ? {
                  centerDx: Math.abs(impl.center.cx - exp.cx),
                  centerDy: Math.abs(impl.center.cy - exp.cy),
                  capHeightDelta:
                    num.textContent === art.REF_INK_SAMPLE_TEXT
                      ? impl.capHeight - refSample.capHeight
                      : null,
                  inkWidthDelta:
                    num.textContent === art.REF_INK_SAMPLE_TEXT
                      ? impl.inkWidth - refSample.inkWidth
                      : null,
                }
              : null,
        };
      });
    }

    return {
      scale: s,
      fontPx: art.NUM_FONT_PX,
      prepOrder: zoneReport('.milksha-zone.prep', 'prep').map((c) => c.number),
      readyOrder: zoneReport('.milksha-zone.ready', 'ready').map((c) => c.number),
      prep: zoneReport('.milksha-zone.prep', 'prep'),
      ready: zoneReport('.milksha-zone.ready', 'ready'),
      rootCauseNote:
        'Compare 圖曾亂序：同一 page 先跑 three-3 再跑 full-10 時 metaById 保留舊 firstSeenAt，準備中 ascending 排序把舊號排到左上。已改 descending + 每次 ref 前 applyPayload([])。',
    };
  }, scale);
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
    { tag: 'three-3', build: () => prepRows(3, 1900) },
    { tag: 'full-10', build: () => buildRefBoardPayload() },
    { tag: 'page2-11', build: () => [...prepRows(11, 1900), ...readyRows(11, 1900)] },
  ];

  const captured = {};
  await applyPayloadClean(page, buildRefBoardPayload());
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
      await applyPayloadClean(page, sc.build());
      await page.waitForTimeout(300);
      captured[`board-${sc.tag}-${vp.suffix}.png`] = await captureBoard(
        page,
        `board-${sc.tag}-${vp.suffix}.png`,
      );
    }
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await applyPayloadClean(page, buildRefBoardPayload());
  await page.waitForTimeout(300);
  const compareSource = await captureBoard(page, 'board-ref-compare-source-1920.png');

  const comparePage = await browser.newPage();
  await comparePage.setViewportSize({ width: 800, height: 600 });
  await composeImages(comparePage, compareSource, REF, 'compare-full-10-vs-ref-1920.png', 'sideBySide');
  await composeImages(comparePage, compareSource, REF, 'overlay-full-10-vs-ref-1920.png', 'overlay');

  const gaps = await measureAlignmentReport(page);
  writeFileSync(join(ART, 'cell-alignment-gaps.json'), JSON.stringify(gaps, null, 2));

  const head = gitHead();
  writeFileSync(
    join(ART, 'DELIVERY_REPORT.md'),
    [
      '# Board background self-QA (1007)',
      '',
      `- **HEAD:** \`${head}\``,
      `- **Base:** \`6ef1359cea99cccb5dda74afeed7003888518515\``,
      `- **Font:** ${81}px Arial/Arimo; ink cap/width vs ref ±5% (canvas measureText)`,
      `- **Grid:** fixed column X + uniform row pitch (reference averages)`,
      '',
      '## Root cause (prep order on compare)',
      gaps.rootCauseNote,
      '',
      '## Reference payload (all evidence shots)',
      `- Numbers: ${REF_BOARD_NUMBERS.join(', ')}`,
      '- `buildRefBoardPayload()` + `applyPayload([])` before each capture',
      '',
      '## Artifacts',
      '- `cell-alignment-gaps.json` — per-cell DOM box + measureText ink vs reference',
      '- `screenshots/compare-full-10-vs-ref-1920.png` from `board-ref-compare-source-1920.png`',
      '- `screenshots/overlay-full-10-vs-ref-1920.png`',
      '- Scenarios + letterbox (see screenshots/)',
      '',
      '## CI',
      '- Run on this HEAD (see GitHub Actions after push)',
      '',
    ].join('\n'),
  );

  await browser.close();
  console.log(JSON.stringify({ head, prepOrder: gaps.prepOrder, readyOrder: gaps.readyOrder }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
