/**
 * Signed posReceiver → board screenshot (zz-qa-ci-store). Test script only; merchant_id Milksha.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { sendClearNow } from '../tests/e2e/live-cloud-teardown.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const STORE = 'zz-qa-ci-store';
const POS_MERCHANT_ID = 'Milksha';
const OUT_DIR = join(ROOT, 'artifacts', 'delivery-number');
const SCREENSHOT = join(OUT_DIR, 'live-cloud-pos-signed-1920x1080.png');

const QA_TICKETS = [
  {
    no: '578',
    status: 'ready',
    sourceType: 'From_milksha_point_OK',
    updatedAt: '2026-10-13T04:20:00.000Z',
  },
  {
    no: 'C7458',
    status: 'ready',
    sourceType: 'From_UberEat_OK',
    updatedAt: '2026-10-13T04:20:01.000Z',
  },
  {
    no: '8888',
    status: 'ready',
    updatedAt: '2026-10-13T04:20:02.000Z',
  },
  {
    no: '8888',
    status: 'ready',
    sourceType: 'From_UberEat_OK',
    updatedAt: '2026-10-13T04:20:03.000Z',
  },
];

function ticketsToNumberContentNode(tickets) {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard.ticketsToNumberContent(tickets);
}

async function sendSignedPosReceiver(ctrl, numberContent) {
  return ctrl.evaluate(
    async ({ nc, merchantId }) => {
      const Validate = window.QMS.Receiver.Validate;
      const PosSign = window.QMS.Transport.MilkshaPosSign;
      const transport = window.__controller.getTransport();
      const store = Validate.findStore('zz-qa-ci-store');
      const body = {
        isEncrypt: false,
        serviceSpecialData_Json: {
          target: Validate.milkshaTargetForAccount(store.account),
          data: { number_content: nc, newsTicker_content: [], newsTickerSpeed: 0 },
        },
        merchant_id: merchantId,
        account: store.account,
      };
      const secret = (window.MILKSHA_FIREBASE_CONFIG || {}).posSignSecret || '';
      const signed = await PosSign.applyPosSignature(body, secret, false);
      const wireText = signed.wireText || signed.__wireText;
      const res = await transport.cloudApi.posReceiver(wireText);
      return { res, merchant_id: merchantId, number_content: nc };
    },
    { nc: numberContent, merchantId: POS_MERCHANT_ID },
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const nc = ticketsToNumberContentNode(QA_TICKETS);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const posSecret = process.env.MILKSHA_POS_SIGN_SECRET || '';
  if (posSecret) {
    await ctx.addInitScript((secret) => {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, cfg, { posSignSecret: secret });
    }, posSecret);
  }
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=stb-01`);
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
    undefined,
    { timeout: 180000 },
  );
  await sendClearNow(ctrl);
  const send = await sendSignedPosReceiver(ctrl, nc);
  const ok =
    send.res &&
    send.res.isOK !== false &&
    String(send.res.information || '').indexOf('叫號資料格式錯誤') < 0;
  if (!ok) {
    console.log(JSON.stringify({ ok: false, send }, null, 2));
    await sendClearNow(ctrl);
    await browser.close();
    process.exit(2);
  }
  await board.waitForFunction(
    () => {
      const t = document.querySelectorAll('.milksha-ready .milksha-num');
      const joined = [...t].map((el) => el.textContent).join(' ');
      return joined.includes('578') && joined.includes('C7458') && joined.includes('8888');
    },
    undefined,
    { timeout: 30000 },
  );
  const nums = await board.locator('.milksha-ready .milksha-num').allTextContents();
  await board.screenshot({ path: SCREENSHOT, fullPage: false });
  await sendClearNow(ctrl);
  await browser.close();
  console.log(JSON.stringify({ ok: true, nums, screenshot: SCREENSHOT }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
