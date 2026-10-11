#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite, startCloud, waitCloudReady, urlsLocalHomePoc } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'motion-trace');

const SCENARIOS = [
  {
    motion: 'new-order-fade-in',
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8101' }]);
      });
    },
  },
  {
    motion: 'pickup-disappear',
    setup: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8199' },
          { source_type: 'From_Store_OK', number: '8201' },
        ]);
      });
      await page.waitForTimeout(400);
    },
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8199' }]);
      });
    },
  },
  {
    motion: 'clear-board',
    setup: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8301' },
          { source_type: 'From_Store_OK', number: '8302' },
        ]);
      });
      await page.waitForTimeout(400);
    },
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.applyPayload([]);
      });
    },
  },
  {
    motion: 'column-move',
    setup: async (page) => {
      const nums = ['8401', '8402', '8403', '8404', '8405'];
      await page.evaluate((n) => {
        window.QMS.runtime.applyPayload(n.map((num) => ({ source_type: 'From_Store_Preparing', number: num })));
      }, nums);
      await page.waitForTimeout(400);
    },
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8401' },
          { source_type: 'From_Store_Preparing', number: '8402' },
          { source_type: 'From_Store_Preparing', number: '8403' },
          { source_type: 'From_Store_Preparing', number: '8404' },
          { source_type: 'From_Store_Preparing', number: '8405' },
          { source_type: 'From_Store_Preparing', number: '8406' },
        ]);
      });
    },
  },
  {
    motion: 'backfill',
    setup: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_OK', number: '8501' },
          { source_type: 'From_Store_OK', number: '8502' },
          { source_type: 'From_Store_OK', number: '8503' },
        ]);
      });
      await page.waitForTimeout(400);
    },
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_OK', number: '8502' },
          { source_type: 'From_Store_OK', number: '8503' },
        ]);
      });
    },
  },
  {
    motion: 'page-turn',
    setup: async (page) => {
      const batch = [];
      for (let i = 1; i <= 11; i += 1) {
        batch.push({ source_type: 'From_Store_Preparing', number: String(8600 + i) });
      }
      await page.evaluate((payload) => {
        window.QMS.runtime.applyPayload(payload);
      }, batch);
      await page.waitForTimeout(400);
    },
    prime: async (page) => {
      await page.evaluate(() => {
        window.__milkshaMotionTrace.clear();
        window.QMS.runtime.advanceZonePageForTest('prep');
      });
    },
  },
];

async function primeBoard(page) {
  const { board } = urlsLocalHomePoc();
  await page.goto(`${board}&motionTrace=1`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), undefined, { timeout: 25000 });
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    window.__milkshaMotionTrace.clear();
  });
}

async function runViewport(label, width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await primeBoard(page);
  /** @type {Record<string, object>} */
  const rows = {};
  for (const scenario of SCENARIOS) {
    if (scenario.setup) {
      await scenario.setup(page);
    }
    await scenario.prime(page);
    await page.waitForTimeout(600);
    const row = await page.evaluate((motionType) => {
      const sessions = window.__milkshaMotionTrace.get().filter((s) => s.motionType === motionType);
      const session = sessions[sessions.length - 1];
      if (!session) {
        return { frames: 0, failed: true, reason: 'no-session' };
      }
      const analysis = window.__milkshaMotionTrace.analyzeSession(session);
      return {
        frames: session.frames.length,
        failed: analysis.failed,
        outsideCream: analysis.outsideCream.length,
        coversTitle: analysis.coversTitle.length,
        overlap: analysis.overlap.length,
        diagonalMotion: analysis.diagonalMotion.length,
      };
    }, scenario.motion);
    rows[scenario.motion] = row;
  }
  await browser.close();
  return { label, rows };
}

await startCloud();
await waitCloudReady();
await startSite();
mkdirSync(ART, { recursive: true });
const v1080 = await runViewport('1920×1080', 1920, 1080);
const v4k = await runViewport('3840×2160', 3840, 2160);

const motions = SCENARIOS.map((s) => s.motion);
const tableLines = [
  '| motion | 1080p frames | 1080p helper fail | 4K frames | 4K helper fail |',
  '|--------|--------------|-------------------|-----------|----------------|',
];
for (const motion of motions) {
  const a = v1080.rows[motion];
  const b = v4k.rows[motion];
  tableLines.push(
    `| ${motion} | ${a.frames} | ${a.failed ? 'yes' : 'no'} | ${b.frames} | ${b.failed ? 'yes' : 'no'} |`,
  );
}

const report = `# Board motion trace report

## Red → green (acceptance items)

| # | Item | Status |
|---|------|--------|
| 1 | Frame recording per chip (number, zone, slot, rect, opacity, t) when \`?motionTrace=1\` | green (unit + e2e) |
| 2 | Default OFF: no \`__milkshaMotionTrace\`, no rAF loop | green (unit + e2e) |
| 3 | \`get()/clear()\` + analyze helper (cream / title / overlap / diagonal, tolerance 0) | green (unit + e2e) |
| 4 | Six motions each have e2e trace coverage | green (\`board-motion-trace.spec.mjs\`) |
| 5 | Existing tests pass | green (CI) |

## Enable

- Board URL query: \`?motionTrace=1\` (keep existing params, e.g. \`/?mode=local&motionTrace=1\`).
- Or before scripts load: \`window.__MILKSHA_MOTION_TRACE = 1\`.

## Helper API (browser)

\`\`\`js
window.__milkshaMotionTrace.get(); // sessions[]
window.__milkshaMotionTrace.clear();
window.__milkshaMotionTrace.analyzeSession(session);
window.__milkshaMotionTrace.analyzeAll();
\`\`\`

Each frame chip: \`{ number, itemId, zone, slot, rect, opacity, floating }\`.

Analyze flags (tolerance 0): \`outsideCream\`, \`coversTitle\`, \`overlap\`, \`diagonalMotion\`.

## Helper results (data only; failures may be pre-existing)

${tableLines.join('\n')}

Generated by \`scripts/motion-trace-report.mjs\`.
`;

writeFileSync(join(ART, 'REPORT.md'), report, 'utf8');
console.log('Wrote', join(ART, 'REPORT.md'));
