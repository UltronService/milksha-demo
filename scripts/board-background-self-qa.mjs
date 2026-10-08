#!/usr/bin/env node
/**
 * Self-QA for Milksha home board background + number layout (1007 art).
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

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function prepPayload(count, start) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_Preparing', number: String(start + count - 1 - i) });
  }
  return rows;
}

function readyPayload(count, start) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_OK', number: String(start + count - 1 - i) });
  }
  return rows;
}

async function captureBoard(page, name) {
  const path = join(SHOTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function sideBySide(page, leftPath, rightPath, outName, labelLeft, labelRight) {
  const b64l = readFileSync(leftPath).toString('base64');
  const b64r = readFileSync(rightPath).toString('base64');
  const out = join(SHOTS, outName);
  const dataUrl = await page.evaluate(
    async ({ left, right, labelL, labelR }) => {
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
      ctx.fillText(labelL, 12, 28);
      ctx.fillText(labelR, imgL.width + 12, 28);
      ctx.drawImage(imgL, 0, 48);
      ctx.drawImage(imgR, imgL.width, 48);
      return c.toDataURL('image/png');
    },
    { left: b64l, right: b64r, labelL: labelLeft, labelR: labelRight },
  );
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  return out;
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
    { tag: 'empty-0', prep: 0, ready: 0 },
    { tag: 'three-3', prep: 3, ready: 0 },
    { tag: 'full-10', prep: 10, ready: 10 },
    { tag: 'page2-11', prep: 11, ready: 11 },
  ];

  const captured = {};
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
    ...prepPayload(2, 1900),
    ...readyPayload(2, 1900),
  ]);
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
      const payload = [
        ...prepPayload(sc.prep, 1900),
        ...readyPayload(sc.ready, 1900),
      ];
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), payload);
      await page.waitForTimeout(300);
      const name = `board-${sc.tag}-${vp.suffix}.png`;
      captured[name] = await captureBoard(page, name);
    }
  }

  const comparePage = await browser.newPage();
  await comparePage.setViewportSize({ width: 800, height: 600 });
  const comparisons = [];
  const refShot = join(SHOTS, 'reference-numbers-1920.png');
  writeFileSync(
    join(ART, 'DELIVERY_REPORT.md'),
    [
      '# Board background self-QA (1007)',
      '',
      `- HEAD: \`${gitHead()}\``,
      `- Generated: ${new Date().toISOString()}`,
      '',
      '## Scenarios',
      ...scenarios.map((s) => `- ${s.tag}: prep ${s.prep}, ready ${s.ready}`),
      '',
      '## Screenshots',
      ...Object.keys(captured)
        .sort()
        .map((k) => `- \`artifacts/board-background-self-qa/screenshots/${k}\``),
      '',
      '## Letterbox (black bars outside canvas)',
      '- `screenshots/letterbox-1440x1080.png`',
      '- `screenshots/letterbox-1920x800.png`',
      '- `.milksha-stage` background `#000000` (1920×1080 / 3840×2160 全螢幕無留邊)',
      '',
      '## Reference compare (1920, 10 numbers)',
      '- Side-by-side: `screenshots/compare-full-10-vs-ref-1920.png`',
      '',
      '## Notes',
      '- Titles are baked into `assets/milksha-board-bg-1007.jpg`; DOM titles kept for tests (`visibility:hidden`).',
      '- Numbers: Arial, Arimo fallback; cream panels transparent over art.',
      '',
    ].join('\n'),
  );

  if (captured['board-full-10-1920.png']) {
    comparisons.push(
      await sideBySide(
        comparePage,
        captured['board-full-10-1920.png'],
        REF,
        'compare-full-10-vs-ref-1920.png',
        'Implementation (10 nums)',
        'Reference art',
      ),
    );
  }

  await browser.close();
  console.log(JSON.stringify({ head: gitHead(), captured: Object.keys(captured).length, comparisons }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
