/**
 * Live cloud QA: continuous simulation emits mixed sources on zz-qa-* only.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from '../tests/e2e/live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from '../tests/e2e/live-cloud-teardown.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'artifacts', 'controller-sim-mixed-sources');
const VIEWPORT = { width: 1920, height: 1080 };
const RUN_MS = Number(process.env.SIM_QA_RUN_MS || 120000);

const STORE = String(process.env.LIVE_CLOUD_STORE_ID || LIVE_CLOUD_STORE_ID).trim();
if (!STORE.startsWith('zz-qa-')) {
  throw new Error('Refusing non zz-qa-* store: ' + STORE);
}
if (STORE === 'c030020') {
  throw new Error('Refusing production trial store');
}

async function boardNumberTexts(page) {
  const prep = await page.locator('.milksha-prep .milksha-num').allTextContents();
  const ready = await page.locator('.milksha-ready .milksha-num').allTextContents();
  return { prep: prep.map((s) => s.trim()).filter(Boolean), ready: ready.map((s) => s.trim()).filter(Boolean) };
}

function classifyBoardNumbers(texts) {
  const hasStore = texts.some((t) => /^\d{4}$/.test(t));
  const hasPoint = texts.some((t) => /^\d{3,4}$/.test(t) && !/^\d{4}$/.test(t));
  const hasFp = texts.some((t) => /^\d{5,6}$/.test(t));
  const hasDeliveryAlnum = texts.some((t) => /^[A-Z0-9]{4,6}$/.test(t) && /[A-Z]/.test(t));
  return { hasStore, hasPoint, hasFp, hasDeliveryAlnum, total: texts.length };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();

  const report = {
    store: STORE,
    runMs: RUN_MS,
    at: new Date().toISOString(),
    controllerTickets: null,
    boardNumbers: null,
    boardClasses: null,
    ok: false,
  };

  try {
    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await ctrl.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
      undefined,
      { timeout: 180000 },
    );

    await sendClearNow(ctrl);
    await ctrl.locator('[data-testid="zone-toggle-pos"]').click();
    await ctrl.click('[data-testid="btn-gen-peak"]');
    await ctrl.waitForFunction(
      () => /運行中/.test(document.getElementById('sim-status')?.textContent || ''),
      undefined,
      { timeout: 30000 },
    );

    const endAt = Date.now() + RUN_MS;
    while (Date.now() < endAt) {
      await ctrl.waitForTimeout(5000);
    }

    report.controllerTickets = await ctrl.evaluate(() => {
      const list = window.__controller.getTickets();
      const bySource = {};
      list.forEach((t) => {
        const sk = t.sourceKey || 'store';
        bySource[sk] = (bySource[sk] || 0) + 1;
      });
      return {
        total: list.length,
        bySource: bySource,
        sample: list.slice(0, 12).map((t) => ({
          no: t.no,
          status: t.status,
          sourceKey: t.sourceKey || 'store',
        })),
      };
    });

    const nums = await boardNumberTexts(board);
    const allNums = nums.prep.concat(nums.ready);
    report.boardNumbers = nums;
    report.boardClasses = classifyBoardNumbers(allNums);
    await board.waitForTimeout(3000);
    await board.screenshot({ path: join(OUT_DIR, 'board-mixed-sources-1920x1080.png') });
    await ctrl.screenshot({ path: join(OUT_DIR, 'controller-mixed-sources-1920x1080.png') });

    const needed = ['store', 'point', 'uber', 'fp'];
    const seenOnCtrl = new Set(Object.keys(report.controllerTickets.bySource || {}));
    const bc = report.boardClasses || {};
    report.ok =
      needed.every((k) => seenOnCtrl.has(k)) &&
      bc.total > 0 &&
      (bc.hasPoint || bc.hasDeliveryAlnum || bc.hasFp);
  } finally {
    try {
      await teardownLiveCloudSession(ctrl, board);
    } catch {
      /* ignore */
    }
    await browser.close();
  }

  writeFileSync(join(OUT_DIR, 'live-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
