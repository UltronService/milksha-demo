#!/usr/bin/env node
/**
 * One isolation send with seq forensics (Pages patch vs local :8877 full tree).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startSite, PORT_SITE, expandControllerZone } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-forensics');
const STORE_A = 'zz-qa-store-a';
const MODE = process.env.FORENSICS_MODE || 'local-8877';
const PUBLIC = 'https://ultronservice.github.io/milksha-demo';

mkdirSync(ART, { recursive: true });

function loadApiKey() {
  const text = readFileSync(
    process.env.MILKSHA_WEB_CONFIG ||
      '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_d1a4.txt',
    'utf8',
  );
  for (const line of text.split('\n')) {
    const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
    if (m) {
      return m[1].trim();
    }
  }
  throw new Error('no api key');
}

function installCloudInit(ctx, apiKey) {
  return ctx.addInitScript((key) => {
    window.__RCV_SEQ_FORENSICS = [];
    const cfg = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
      projectId: 'milksha-qms-dev',
      apiKey: key,
      region: 'asia-east1',
      defaultCloudMode: true,
      useEmulator: false,
      gateway: '',
      functionsBaseUrl: 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/',
    });
    window.MILKSHA_FIREBASE_CONFIG = cfg;
    try {
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: key,
          region: 'asia-east1',
          useEmulator: false,
          gateway: '',
          emulatorPrefix: '',
        }),
      );
    } catch {
      /* ignore */
    }
  }, apiKey);
}

async function main() {
  const apiKey = loadApiKey();
  let base = PUBLIC;
  const runtimeBody = readFileSync(join(ROOT, 'js/receiver/cloud-runtime.js'), 'utf8');
  const runtimeSha = createHash('sha256').update(runtimeBody).digest('hex').slice(0, 16);

  if (MODE === 'local-8877') {
    await startSite();
    base = `http://127.0.0.1:${PORT_SITE}`;
  }

  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const ctx = await browser.newContext();
  await installCloudInit(ctx, apiKey);

  if (MODE === 'pages-patch') {
    await ctx.route(/cloud-runtime\.js(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: runtimeBody,
      }),
    );
  }

  const events = [];
  const tabA = await ctx.newPage();
  const ctrlA = await ctx.newPage();

  const pushHttp = (source, res, extra) => {
    events.push({
      at: Date.now(),
      source,
      kind: 'http',
      status: res.status(),
      url: res.url().split('?')[0],
      extra,
    });
  };

  ctrlA.on('response', async (res) => {
    if (!res.url().includes('devCommand')) {
      return;
    }
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    let boardSeq = null;
    try {
      boardSeq = JSON.parse(body).boardSeq;
    } catch {
      boardSeq = null;
    }
    pushHttp('ctrlA', res, { boardSeq, bodyHead: body.slice(0, 200) });
  });

  tabA.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('firestore.googleapis.com')) {
      return;
    }
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    const seqM = body.match(/"seq"\s*:\s*(\d+)/);
    const pendingM = body.match(/"pendingCommand"/);
    const boardSeqDevM = body.match(/"boardSeq"\s*:\s*(\d+)/);
    pushHttp('tabA', res, {
      firestoreSeq: seqM ? Number(seqM[1]) : null,
      hasPending: Boolean(pendingM),
      deviceBoardSeq: boardSeqDevM ? Number(boardSeqDevM[1]) : null,
      len: body.length,
    });
  });

  const boardUrl = `${base}/?mode=cloud&store=${STORE_A}&forensics=1`;
  await tabA.goto(boardUrl, { waitUntil: 'domcontentloaded' });
  await ctrlA.goto(`${base}/controller/?mode=cloud&store=${STORE_A}`, { waitUntil: 'domcontentloaded' });
  await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 120000 });

  const injected = await tabA.evaluate(() => ({
    version: window.receiverCloud?.getRuntimeVersion?.() || '',
    localSeq: window.receiverCloud?.getLocalSeq?.() ?? null,
  }));

  await expandControllerZone(ctrlA, 'sec-special');
  await ctrlA.click('[data-testid="btn-clear-now"]');
  await tabA.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    undefined,
    { timeout: 60000 },
  );

  await ctrlA.click('[data-testid="btn-send-numbers"]');

  const timeline = [];
  for (let i = 0; i < 60; i += 1) {
    const snap = await tabA.evaluate(() => ({
      ready: document.querySelectorAll('.milksha-ready .milksha-num').length,
      localSeq: window.receiverCloud?.getLocalSeq?.() ?? null,
      version: window.receiverCloud?.getRuntimeVersion?.() || '',
      forensics: (window.__RCV_SEQ_FORENSICS || []).slice(-8),
    }));
    timeline.push({ at: Date.now(), ...snap });
    if (snap.ready >= 1) {
      break;
    }
    await tabA.waitForTimeout(500);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    base,
    boardUrl,
    runtimeSha256_16: runtimeSha,
    injectedRuntimeVersion: injected.version,
    httpEvents: events,
    domTimeline: timeline,
    verdict:
      injected.version.includes('boardseq') && MODE === 'pages-patch'
        ? 'patch_active'
        : MODE === 'local-8877'
          ? 'local_full_tree'
          : 'check_version',
  };

  const out = join(ART, `root-cause-${MODE}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, ...report, httpEvents: events.length }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
