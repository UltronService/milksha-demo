import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from './live-cloud-teardown.mjs';

const ART = join(process.cwd(), 'artifacts', 'controller-simulation-self-qa');
const RUN_MS = 3 * 60 * 1000;
const VIEWPORT = { width: 1920, height: 1080 };

/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {import('@playwright/test').Page | undefined} */
let board;
/** @type {import('@playwright/test').Page | undefined} */
let ctrl;

async function boardTicketCount(page) {
  const prep = await page.locator('.milksha-prep .milksha-num').count();
  const ready = await page.locator('.milksha-ready .milksha-num').count();
  return { prep, ready, total: prep + ready };
}

async function sampleUntil(ctrlPage, boardPage, endAt, samples) {
  let lastSend = -1;
  let lastSeq = -1;
  while (Date.now() < endAt) {
    const row = await ctrlPage.evaluate(() => ({
      sendCount: window.__controller.getSimulationSendCount(),
      seq: window.__controllerTelemetry.lastBoardSeq,
      at: new Date().toISOString(),
    }));
    const counts = await boardTicketCount(boardPage);
    if (row.sendCount !== lastSend || row.seq !== lastSeq) {
      samples.push({
        at: row.at,
        sendCount: row.sendCount,
        boardSeq: row.seq,
        boardPrep: counts.prep,
        boardReady: counts.ready,
        boardTotal: counts.total,
      });
      lastSend = row.sendCount;
      lastSeq = row.seq;
    }
    await ctrlPage.waitForTimeout(2000);
  }
}

test.afterEach(async () => {
  try {
    await teardownLiveCloudSession(ctrl, board);
  } finally {
    if (browser) {
      await browser.close();
    }
    browser = undefined;
    board = undefined;
    ctrl = undefined;
  }
});

test.describe(`${LIVE_CLOUD_STORE_ID} live cloud continuous simulation`, () => {
  test.describe.configure({ retries: 1 });

  test('normal and peak 3 min each with stop quiescence', async () => {
    test.setTimeout(900000);
    mkdirSync(ART, { recursive: true });
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    ctx.setDefaultTimeout(180000);
    await installLiveBranchCloudRoutes(ctx);
    board = await ctx.newPage();
    ctrl = await ctx.newPage();

    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}&device=${LIVE_CLOUD_BOARD_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await ctrl.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
      undefined,
      { timeout: 180000 },
    );

    await sendClearNow(ctrl);
    await ctrl.locator('[data-testid="zone-toggle-pos"]').click();

    const evidence = { store: LIVE_CLOUD_STORE_ID, samples: { normal: [], peak: [] }, stopChecks: {} };

    await ctrl.click('[data-testid="btn-gen-normal"]');
    await expect(ctrl.locator('[data-testid="sim-status"]')).toContainText(/運行中/, { timeout: 15000 });
    const normalEnd = Date.now() + RUN_MS;
    await sampleUntil(ctrl, board, normalEnd, evidence.samples.normal);
    await ctrl.click('[data-testid="btn-sim-stop"]');
    await ctrl.waitForTimeout(5000);
    const afterStopNormal = await ctrl.evaluate(() => ({
      sendCount: window.__controller.getSimulationSendCount(),
      tickets: window.__controller.getTickets().map((t) => t.no + ':' + t.status),
    }));
    await ctrl.waitForTimeout(60000);
    const afterQuietNormal = await ctrl.evaluate(() => ({
      sendCount: window.__controller.getSimulationSendCount(),
      tickets: window.__controller.getTickets().map((t) => t.no + ':' + t.status),
    }));
    evidence.stopChecks.normal = { afterStop: afterStopNormal, afterQuiet: afterQuietNormal };
    expect(afterQuietNormal.sendCount).toBe(afterStopNormal.sendCount);
    expect(afterQuietNormal.tickets).toEqual(afterStopNormal.tickets);

    await ctrl.screenshot({ path: join(ART, 'cloud-normal-ctrl-1920.png') });
    await board.screenshot({ path: join(ART, 'cloud-normal-board-1920.png') });

    await ctrl.click('[data-testid="btn-gen-peak"]');
    await expect(ctrl.locator('[data-testid="sim-status"]')).toContainText(/尖峰/, { timeout: 15000 });
    const peakEnd = Date.now() + RUN_MS;
    await sampleUntil(ctrl, board, peakEnd, evidence.samples.peak);
    await ctrl.click('[data-testid="btn-sim-stop"]');
    await ctrl.waitForTimeout(5000);
    const afterStopPeak = await ctrl.evaluate(() => ({
      sendCount: window.__controller.getSimulationSendCount(),
      tickets: window.__controller.getTickets().map((t) => t.no + ':' + t.status),
    }));
    await ctrl.waitForTimeout(60000);
    const afterQuietPeak = await ctrl.evaluate(() => ({
      sendCount: window.__controller.getSimulationSendCount(),
      tickets: window.__controller.getTickets().map((t) => t.no + ':' + t.status),
    }));
    evidence.stopChecks.peak = { afterStop: afterStopPeak, afterQuiet: afterQuietPeak };
    expect(afterQuietPeak.sendCount).toBe(afterStopPeak.sendCount);
    expect(afterQuietPeak.tickets).toEqual(afterStopPeak.tickets);

    await ctrl.screenshot({ path: join(ART, 'cloud-peak-ctrl-1920.png') });
    await board.screenshot({ path: join(ART, 'cloud-peak-board-1920.png') });

    writeFileSync(join(ART, 'cloud-live-evidence.json'), JSON.stringify(evidence, null, 2));

    expect(evidence.samples.normal.length).toBeGreaterThan(0);
    expect(evidence.samples.peak.length).toBeGreaterThan(0);
  });
});
