/**
 * One-off live cloud QA on zz-qa-ci-store (not zz-qa-store-a).
 * Uses branch board JS via github.io route shim; real milksha-qms-dev backend.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from '../tests/e2e/live-cloud-config.mjs';
import { sendClearNow } from '../tests/e2e/live-cloud-teardown.mjs';
import { expandControllerZone } from '../tests/e2e/harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const { CLOUD_DELIVERY_SAMPLE_TICKETS } = require('../tests/fixtures/today-board-cloud-tickets.js');
const OUT_DIR = join(ROOT, 'artifacts', 'delivery-number');

const STORE = String(process.env.LIVE_CLOUD_STORE_ID || LIVE_CLOUD_STORE_ID).trim();
if (STORE === 'zz-qa-store-a') {
  throw new Error('Refusing zz-qa-store-a; use zz-qa-ci-store');
}

const LIVE_TICKETS = [
  ...CLOUD_DELIVERY_SAMPLE_TICKETS,
  {
    no: '8888',
    status: 'ready',
    sourceType: 'From_Store_OK',
    updatedAt: '2026-10-12T23:20:00.000Z',
  },
  {
    no: '8888',
    status: 'ready',
    sourceType: 'From_UberEat_OK',
    updatedAt: '2026-10-12T23:20:01.000Z',
  },
];

const SOURCE_KEY_BY_PREFIX = [
  { prefix: 'From_Store_', key: 'store' },
  { prefix: 'From_milksha_point_', key: 'point' },
  { prefix: 'From_FoodPanda_', key: 'fp' },
  { prefix: 'From_UberEat_', key: 'uber' },
  { prefix: 'From_Udd_', key: 'udd' },
];

function sourceKeyFromType(sourceType) {
  if (!sourceType) {
    return 'store';
  }
  for (const row of SOURCE_KEY_BY_PREFIX) {
    if (sourceType.startsWith(row.prefix)) {
      return row.key;
    }
  }
  return 'store';
}

async function tryPosReceiverTammy(ctrl, tickets) {
  return ctrl.evaluate(async (ticketRows) => {
    const TB = window.QMS && window.QMS.Board && window.QMS.Board.TodayBoard;
    const Validate = window.QMS && window.QMS.Receiver && window.QMS.Receiver.Validate;
    const PosSign = window.QMS && window.QMS.Transport && window.QMS.Transport.MilkshaPosSign;
    const transport = window.__controller && window.__controller.getTransport();
    if (!TB || !Validate || !PosSign || !transport || !transport.cloudApi) {
      return { ok: false, reason: 'missing_controller_apis' };
    }
    const nc = TB.ticketsToNumberContent(ticketRows);
    const storeSel = document.getElementById('fld-store');
    const storeId = storeSel ? storeSel.value : '';
    const store = Validate.findStore(storeId);
    if (!store) {
      return { ok: false, reason: 'store_not_found' };
    }
    const body = {
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: Validate.milkshaTargetForAccount(store.account),
        data: { number_content: nc, newsTicker_content: [], newsTickerSpeed: 0 },
      },
      merchant_id: store.merchant_id,
      account: store.account,
    };
    const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
    const secret = cfg.posSignSecret || '';
    if (!secret) {
      return { ok: false, reason: 'no_pos_sign_secret' };
    }
    const signed = await PosSign.applyPosSignature(body, secret, false);
    const wire =
      signed && typeof signed.wireText === 'string'
        ? signed.wireText
        : signed && signed.__wireText
          ? signed.__wireText
          : signed;
    try {
      const res = await transport.cloudApi.posReceiver(wire);
      return { ok: Boolean(res && res.isSuccess !== false), res: res, ncLength: nc.length };
    } catch (e) {
      return { ok: false, reason: e && e.message ? String(e.message) : 'posReceiver_error' };
    }
  }, tickets);
}

async function tryControllerDevCommandBoard(ctrl) {
  await expandControllerZone(ctrl, 'sec-pos');
  for (const t of LIVE_TICKETS) {
    const key = sourceKeyFromType(t.sourceType);
    await ctrl.selectOption('[data-testid="fld-source"]', key);
    await ctrl.fill('[data-testid="fld-no"]', t.no);
    await ctrl.selectOption('[data-testid="fld-status"]', t.status);
    await ctrl.click('[data-testid="btn-add-ticket"]');
  }
  await ctrl.click('[data-testid="btn-send-board"]');
  await ctrl.waitForTimeout(5000);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const report = {
    store: STORE,
    at: new Date().toISOString(),
    sendPath: null,
    posReceiver: null,
    devCommandBoard: null,
    boardReadyText: [],
    expected: ['578', 'C7458', '6406', '7112', '8888'],
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
    await sendClearNow(ctrl);
    await board.waitForTimeout(2000);

    report.posReceiver = await tryPosReceiverTammy(ctrl, LIVE_TICKETS);
    if (report.posReceiver.ok) {
      report.sendPath = 'posReceiver_tammy_shape';
    } else {
      await tryControllerDevCommandBoard(ctrl);
      report.sendPath = 'controller_devCommand_push_numbers';
      report.devCommandBoard = { attempted: true };
    }

    await board.waitForTimeout(4000);
    report.boardReadyText = await board.locator('.milksha-ready .milksha-num').allTextContents();
    const joined = report.boardReadyText.join(' ');
    const hasSample =
      joined.includes('578') &&
      joined.includes('C7458') &&
      joined.includes('6406') &&
      joined.includes('7112');
    const dup8888 = report.boardReadyText.filter((t) => t.trim() === '8888').length;
    report.pass = hasSample && dup8888 >= 2;
    report.duplicate8888Count = dup8888;

    await board.screenshot({
      path: join(OUT_DIR, 'live-cloud-zz-qa-ci-store-1920x1080.png'),
      fullPage: false,
    });
  } finally {
    await sendClearNow(ctrl);
    await board.waitForTimeout(3000);
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
