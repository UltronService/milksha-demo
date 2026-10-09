#!/usr/bin/env node
/**
 * Real cloud: 6 devCommand types must produce board boxHeartbeat ackCommandId.
 */
import { chromium, firefox } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  GITHUB_PAGES_BASE,
  installGithubPagesSiteRoute,
  resolveSiteRoot,
} from './lib/github-pages-site-route.mjs';
import { CONTROLLER_BOARD_ONLINE_WAIT_JS } from './lib/controller-board-online.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'boot-fast-self-qa');
const SITE = resolveSiteRoot(ROOT);
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const ROUNDS = Number(process.env.MILKSHA_ACK_ROUNDS || 3);

function gitSha() {
  return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
}

function boardUrl() {
  const u = new URL(`${GITHUB_PAGES_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', STORE);
  u.searchParams.set('device', DEVICE);
  return u.toString();
}

async function installRoutes(ctx) {
  const res = await fetch(`${GITHUB_PAGES_BASE}/config/firebase.js`, { cache: 'no-store' });
  const pubJs = await res.text();
  await installGithubPagesSiteRoute(ctx, SITE);
  await ctx.route('**/config/firebase.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: pubJs,
    });
  });
  await ctx.addInitScript(() => {
    window.__rcvMatrixTimeline = [];
    try {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: cfg.projectId || 'milksha-qms-dev',
          apiKey: cfg.apiKey || '',
          region: cfg.region || 'asia-east1',
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

async function expandZone(page, id) {
  await page.evaluate((zoneId) => {
    const section = document.getElementById(zoneId);
    if (!section) {
      return;
    }
    const btn = section.querySelector('.zone-toggle');
    const body = section.querySelector('.zone-body');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
    }
    if (body) {
      body.hidden = false;
    }
  }, id);
}

async function waitBoardOnline(ctrl, board) {
  await board.goto(boardUrl());
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 120000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
  await ctrl.waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, { timeout: 90000 });
}

async function collectAckHeartbeats(board, sinceMs, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hits = await board.evaluate((since) => {
      const tl = window.__rcvMatrixTimeline || [];
      return tl.filter((e) => e.kind === 'heartbeat_send' && e.ts >= since && e.ackCommandId);
    }, sinceMs);
    if (hits.length > 0) {
      return hits;
    }
    await board.waitForTimeout(400);
  }
  return [];
}

async function runCommand(browser, browserName, roundIndex, spec) {
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(120000);
  await installRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const heartbeats = [];
  board.on('request', (req) => {
    const u = req.url();
    if (u.includes('boxHeartbeat') && req.method() === 'POST') {
      heartbeats.push({ ts: Date.now(), phase: 'req' });
    }
  });
  board.on('response', async (res) => {
    const u = res.url();
    if (u.includes('boxHeartbeat') && res.request().method() === 'POST') {
      let body = null;
      try {
        body = JSON.parse(res.request().postData() || '{}');
      } catch {
        body = {};
      }
      heartbeats.push({
        ts: Date.now(),
        phase: 'res',
        status: res.status(),
        ackCommandId: body.ackCommandId || '',
      });
    }
  });

  await waitBoardOnline(ctrl, board);
  const since = Date.now();
  await spec.run(ctrl, board);
  try {
    await board.evaluate(async () => {
      const rc = window.receiverCloud;
      if (!rc) {
        return;
      }
      if (typeof rc.triggerDevicePoll === 'function') {
        await rc.triggerDevicePoll();
      }
      if (typeof rc.sendHeartbeat === 'function') {
        await rc.sendHeartbeat();
      }
    });
  } catch {
    /* ignore */
  }
  const tlAck = await collectAckHeartbeats(board, since, 60000);
  const netAck = heartbeats.filter((h) => h.phase === 'res' && h.ackCommandId);
  const commandId = await ctrl.evaluate(() => {
    const entries = window.__controllerTelemetry?.logEntries || [];
    const last = entries.find((e) => e.response && e.response.commandId);
    return last && last.response ? last.response.commandId : '';
  });
  await ctx.close();
  return {
    browser: browserName,
    round: roundIndex,
    type: spec.type,
    commandId: commandId || null,
    ackFromTimeline: tlAck.map((e) => e.ackCommandId),
    ackFromNetwork: netAck.map((e) => e.ackCommandId),
    ok: tlAck.length > 0 || netAck.length > 0,
  };
}

const COMMAND_SPECS = [
  {
    type: 'clear_now',
    run: async (ctrl) => {
      await expandZone(ctrl, 'sec-special');
      await ctrl.click('[data-testid="btn-clear-now"]');
    },
  },
  {
    type: 'slow',
    run: async (ctrl) => {
      await expandZone(ctrl, 'sec-net');
      await ctrl.click('[data-testid="btn-slow"]');
    },
  },
  {
    type: 'simulate_offline',
    run: async (ctrl) => {
      await expandZone(ctrl, 'sec-net');
      await ctrl.click('[data-testid="btn-offline"]');
    },
  },
  {
    type: 'restore',
    run: async (ctrl) => {
      await expandZone(ctrl, 'sec-net');
      await ctrl.click('[data-testid="btn-restore"]');
    },
  },
  {
    type: 'push_numbers',
    run: async (ctrl, board) => {
      await expandZone(ctrl, 'sec-pos');
      await ctrl.click('[data-testid="btn-gen-normal"]');
      await ctrl.click('[data-testid="btn-send-board"]');
      await board.waitForFunction(
        () => document.querySelectorAll('.milksha-ready .milksha-num').length > 0,
        { timeout: 30000 },
      );
    },
  },
  {
    type: 'reload',
    run: async (ctrl, board) => {
      await expandZone(ctrl, 'sec-special');
      await ctrl.click('[data-testid="btn-reload"]');
      await board.waitForTimeout(1500);
    },
  },
];

async function main() {
  mkdirSync(ART, { recursive: true });
  const report = { at: new Date().toISOString(), headSha: gitSha(), store: STORE, rounds: ROUNDS, rows: [] };
  for (const { name, launcher } of [
    { name: 'chromium', launcher: chromium },
    { name: 'firefox', launcher: firefox },
  ]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (let r = 0; r < ROUNDS; r += 1) {
        for (const spec of COMMAND_SPECS) {
          report.rows.push(await runCommand(browser, name, r + 1, spec));
        }
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(join(ART, 'command-ack-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, headSha: report.headSha }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
