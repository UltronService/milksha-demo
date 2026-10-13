/**
 * Repro posReceiver multi-source number_content against milksha-qms-dev (zz-qa-ci-store).
 * Prints HTTP status + parsed response for FORMAT-ERROR.md (no backend changes).
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
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
const { CLOUD_DELIVERY_SAMPLE_TICKETS } = require('../tests/fixtures/today-board-cloud-tickets.js');

function ticketsToNumberContentNode(tickets) {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard.ticketsToNumberContent(tickets);
}

const STORE = 'zz-qa-ci-store';
/** Backend POS sign expects this casing (see FORMAT-ERROR.md). Test scripts only. */
const POS_MERCHANT_ID = 'Milksha';
const OUT = join(__dirname, '..', 'artifacts', 'delivery-number', 'format-error-repro.json');

const COLLISION_TICKETS = [
  ...CLOUD_DELIVERY_SAMPLE_TICKETS,
  {
    no: '8888',
    status: 'ready',
    sourceType: 'From_Store_OK',
    updatedAt: '2026-10-13T04:10:00.000Z',
  },
  {
    no: '8888',
    status: 'ready',
    sourceType: 'From_UberEat_OK',
    updatedAt: '2026-10-13T04:10:01.000Z',
  },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const posSecret = process.env.MILKSHA_POS_SIGN_SECRET || '';
  if (posSecret) {
    await ctx.addInitScript((secret) => {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, cfg, { posSignSecret: secret });
    }, posSecret);
  }
  const ctrl = await ctx.newPage();
  const board = await ctx.newPage();

  /** @type {{ url: string, method: string, status: number, bodyText: string }[]} */
  const httpLog = [];
  await ctrl.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (
      req.method() === 'POST' &&
      (url.includes('posReceiver') || url.includes('cloudfunctions.net'))
    ) {
      const response = await route.fetch();
      const bodyText = await response.text();
      httpLog.push({
        url: url.replace(/key=[^&]+/, 'key=<REDACTED>'),
        method: req.method(),
        status: response.status(),
        bodyText: bodyText.slice(0, 8000),
      });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });

  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=stb-01`);
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await sendClearNow(ctrl);

  const numberContent = ticketsToNumberContentNode(COLLISION_TICKETS);

  const repro = await ctrl.evaluate(
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
    const secret = (window.MILKSHA_FIREBASE_CONFIG || {}).posSignSecret || '<REDACTED>';
    const signed = await PosSign.applyPosSignature(body, secret, false);
    const wireText =
      typeof signed.wireText === 'string'
        ? signed.wireText
        : signed.__wireText
          ? signed.__wireText
          : typeof signed === 'string'
            ? signed
            : JSON.stringify(signed);
    let clientThrown = null;
    let parsed = null;
    try {
      parsed = await transport.cloudApi.posReceiver(wireText);
    } catch (e) {
      clientThrown = {
        message: e && e.message ? String(e.message) : 'error',
        status: e && e.status != null ? e.status : null,
        response: e && e.response ? e.response : null,
      };
    }
    const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
    const region = cfg.region || 'asia-east1';
    const projectId = cfg.projectId || 'milksha-qms-dev';
    const fn = cfg.posReceiverFunctionName || 'posReceiver';
    const endpointTemplate =
      cfg.functionsBaseUrl ||
      `https://${region}-${projectId}.cloudfunctions.net/${fn}`;
    return {
      storeId: 'zz-qa-ci-store',
      account: store.account,
      merchant_id: merchantId,
      target: body.serviceSpecialData_Json.target,
      number_content: nc,
      endpoint: String(endpointTemplate).replace(/\/$/, ''),
      wireTextPreview: wireText.slice(0, 500) + (wireText.length > 500 ? '…' : ''),
      wireTextLength: wireText.length,
      posSignSecretUsed: secret === '<REDACTED>' ? '<REDACTED>' : '<REDACTED>',
      clientThrown,
      cloudApiParsed: parsed,
    };
  },
    { nc: numberContent, merchantId: POS_MERCHANT_ID },
  );

  await sendClearNow(ctrl);
  await board.waitForTimeout(2000);
  await browser.close();

  const posHttp = httpLog.filter((h) => h.url.includes('posReceiver') || h.bodyText.includes('CallingNumber'));
  const payload = { repro, http: posHttp, httpLogCount: httpLog.length };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
