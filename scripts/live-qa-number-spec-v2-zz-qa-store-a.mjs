#!/usr/bin/env node
/**
 * One live dev check: milksha-qms-dev, store zz-qa-store-a ONLY.
 * Serves this branch via github-pages route shim; cloud backend PR #37 (trimmed original, no 6-char field).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE } from '../tests/e2e/live-cloud-config.mjs';
import { expandControllerZone } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'artifacts', 'number-spec-v2');
const STORE = 'zz-qa-store-a';

if (STORE !== 'zz-qa-store-a') {
  throw new Error('store guard');
}

const LIVE_TICKETS = [
  { no: '#130,vke3-2643-dy6y', status: 'ready', sourceKey: 'fp' },
  { no: 'c7458', status: 'ready', sourceKey: 'uber' },
  { no: '<b>13</b>', status: 'ready', sourceKey: 'store' },
];

/** Board truncates raw string to 6 units before escape; `<b>13</b>` → `<b>13<`. */
const EXPECTED_ON_BOARD = ['#130,v', 'c7458', '<b>13<'];

async function clearBoardConfirmed(ctrl) {
  await expandControllerZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  const confirm = ctrl.locator('[data-testid="btn-clear-confirm"]');
  if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirm.click();
  }
  await ctrl.waitForTimeout(3000);
}

async function pushTicketsViaDevCommand(ctrl, tickets) {
  return ctrl.evaluate(async (rows) => {
    const transport = window.__controller && window.__controller.getTransport();
    if (!transport || !transport.cloudApi || !transport.cloudApi.devCommand) {
      return { ok: false, reason: 'no_transport' };
    }
    const PushParams = window.QMS && window.QMS.Transport && window.QMS.Transport.PushNumbersParams;
    const SendNumber = window.QMS && window.QMS.Controller && window.QMS.Controller.SendNumber;
    if (!PushParams || !SendNumber) {
      return { ok: false, reason: 'no_push_module' };
    }
    const storeEl = document.getElementById('fld-store');
    const deviceEl = document.getElementById('fld-device');
    const storeId = storeEl ? String(storeEl.value || '').trim() : '';
    const deviceId = deviceEl ? String(deviceEl.value || '').trim() || 'stb-01' : 'stb-01';
    if (!storeId) {
      return { ok: false, reason: 'no_store_id' };
    }
    const params = PushParams.ticketsToPushNumbersParams(rows, (k) => SendNumber.sourceOptionForKey(k));
    try {
      const res = await transport.cloudApi.devCommand({
        storeId: storeId,
        deviceId: deviceId,
        type: 'push_numbers',
        params: params,
      });
      return { ok: Boolean(res && res.isSuccess !== false), res: res };
    } catch (e) {
      return {
        ok: false,
        reason: e && e.message ? String(e.message) : 'devCommand_error',
        response: e && e.response ? e.response : null,
      };
    }
  }, tickets);
}

async function readCloudTicketNos(ctrl) {
  return ctrl.evaluate(async () => {
    const transport = window.__controller && window.__controller.getTransport();
    if (!transport || !transport.readBoard) {
      return { ok: false, reason: 'no_readBoard' };
    }
    const doc = await transport.readBoard();
    const tickets = doc && doc.data && doc.data.tickets ? doc.data.tickets : [];
    return {
      ok: true,
      tickets: tickets.map((t) => ({ no: t.no, sourceType: t.sourceType || t.source_type })),
    };
  });
}

async function main() {
  mkdirSync(join(OUT_DIR, 'screenshots'), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const report = {
    store: STORE,
    project: 'milksha-qms-dev',
    cloudBackendNote: 'PR #37 b01b3c5 — trimmed original up to 64 chars; board truncates display to 6',
    at: new Date().toISOString(),
    sent: LIVE_TICKETS,
    push: null,
    cloudTickets: null,
    boardReadyText: [],
    expectedDisplay: EXPECTED_ON_BOARD,
    pass: false,
  };

  try {
    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`,
    );
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await ctrl.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
      undefined,
      { timeout: 180000 },
    );
    await clearBoardConfirmed(ctrl);
    await board.waitForTimeout(2500);

    report.push = await pushTicketsViaDevCommand(ctrl, LIVE_TICKETS);

    await board.waitForTimeout(5000);
    report.cloudTickets = await readCloudTicketNos(ctrl);
    report.boardReadyText = await board.locator('.milksha-ready .milksha-num').allTextContents();
    const trimmed = report.boardReadyText.map((t) => t.trim());
    report.pass = EXPECTED_ON_BOARD.every((exp) => trimmed.includes(exp));

    await board.screenshot({
      path: join(OUT_DIR, 'screenshots', 'live-zz-qa-store-a-number-spec-v2-1920.png'),
      fullPage: false,
    });
  } finally {
    await clearBoardConfirmed(ctrl);
    await board.waitForTimeout(2000);
    await browser.close();
  }

  const outPath = join(OUT_DIR, 'live-zz-qa-store-a-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
