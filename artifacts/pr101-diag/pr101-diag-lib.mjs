import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GITHUB_PAGES_BASE } from '../../tests/e2e/board-animation-live-setup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

export const PR101_STORE = 'zz-qa-store-a';
export const PR101_DEVICE = String(process.env.LIVE_CLOUD_BOARD_DEVICE || 'stb-01').trim();

/**
 * @param {string} siteRoot absolute path to site root (branch checkout or main worktree)
 */
export async function installPr101SiteRoute(ctx, siteRoot) {
  const { installGithubPagesSiteRoute } = await import('../../scripts/lib/github-pages-site-route.mjs');
  await installGithubPagesSiteRoute(ctx, siteRoot);
  const { ensurePublicFirebaseJs } = await import('../../tests/e2e/board-animation-live-setup.mjs');
  const pubJs = await ensurePublicFirebaseJs();
  await ctx.route('**/config/firebase.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: pubJs,
    });
  });
  await ctx.addInitScript(() => {
    window.__PR101_DBG = true;
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

export function pr101DbgListener(page, lines) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[pr101-dbg]')) {
      lines.push(text);
    }
  });
}

export async function sampleControllerDbg(ctrl) {
  return ctrl.evaluate(async function () {
    const transport =
      window.__controller && window.__controller.getTransport ? window.__controller.getTransport() : null;
    const deviceId = (document.getElementById('fld-device')?.value || 'stb-01').trim();
    const storeId = document.getElementById('fld-store')?.value?.trim() || '';
    let restDevice = null;
    let restError = '';
    try {
      if (transport && transport.readDevice) {
        restDevice = await transport.readDevice(deviceId);
      }
    } catch (e) {
      restError = e && e.message ? e.message : String(e);
    }
    const Paths = window.QMS && window.QMS.Transport && window.QMS.Transport.Paths;
    const devicePath = Paths ? Paths.deviceDocPath(storeId, deviceId) : '';
    const boardPath = Paths ? Paths.todayBoardPath(storeId) : '';
    const snap = {
      boardOnline: document.getElementById('online-state')?.getAttribute('data-board-online'),
      connected: document.getElementById('online-state')?.getAttribute('data-connected'),
      transportRoute: document.getElementById('transport-route')?.getAttribute('data-board-online'),
      realtimePill: document.getElementById('connection-status-pill')?.getAttribute('data-realtime-connected'),
      telemetryRealtime: window.__controllerTelemetry?.realtimeConnected,
      bannerHidden: document.getElementById('realtime-disconnect-banner')?.hidden,
      bannerText: document.getElementById('realtime-disconnect-banner')?.textContent || '',
      realtimeStats: window.__controller?.getCloudRealtimeStats?.() || null,
      sdkLoaded: Boolean(window.QMS?.Transport?.FirebaseSdkBridge?.isSdkLoaded?.()),
      authUser: Boolean(window.firebase?.auth?.()?.currentUser),
      paths: { devicePath, boardPath },
      restDevice: restDevice
        ? {
            lastSeen: restDevice.data?.lastSeen,
            online: restDevice.data?.online,
            appVersion: restDevice.data?.appVersion,
            controllerDeviceStub: restDevice.data?.controllerDeviceStub,
          }
        : null,
      restError,
      navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
    };
    console.log('[pr101-dbg] sample', JSON.stringify(snap));
    return snap;
  });
}

/**
 * @param {{ siteRoot?: string, outDir: string, label: string, waitBoardOnlineMs?: number }} opts
 */
export async function runBoardOnlineRepro(opts) {
  const siteRoot = opts.siteRoot || REPO_ROOT;
  const outDir = opts.outDir;
  const waitMs = opts.waitBoardOnlineMs ?? 120000;
  mkdirSync(outDir, { recursive: true });
  const consoleLines = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  ctx.setDefaultTimeout(180000);
  await installPr101SiteRoute(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  pr101DbgListener(board, consoleLines);
  pr101DbgListener(ctrl, consoleLines);

  await board.goto(
    `${GITHUB_PAGES_BASE}/?mode=cloud&store=${PR101_STORE}&device=${PR101_DEVICE}`,
  );
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${PR101_STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });

  const samples = [];
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    samples.push({ at: new Date().toISOString(), ...(await sampleControllerDbg(ctrl)) });
    if (samples[samples.length - 1].boardOnline === '1') {
      break;
    }
    await ctrl.waitForTimeout(3000);
  }

  const last = samples[samples.length - 1] || {};
  const passed = last.boardOnline === '1';
  const evidence = {
    label: opts.label,
    siteRoot,
    store: PR101_STORE,
    device: PR101_DEVICE,
    passed,
    samples,
    consoleLines,
  };
  writeFileSync(join(outDir, `board-online-${opts.label}.json`), JSON.stringify(evidence, null, 2));
  await browser.close();
  return evidence;
}

/**
 * @param {{ siteRoot?: string, outDir: string, label: string }} opts
 */
/** @param {string} url */
export function isMilkshaCloudBackendUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (/\.cloudfunctions\.net$/i.test(host)) {
      return true;
    }
    if (/firestore\.googleapis\.com$/i.test(host)) {
      return true;
    }
    if (/\.firebaseio\.com$/i.test(host)) {
      return true;
    }
    if (/identitytoolkit\.googleapis\.com$/i.test(host)) {
      return true;
    }
    if (/securetoken\.googleapis\.com$/i.test(host)) {
      return true;
    }
    if (/googleapis\.com$/i.test(host) && /firestore|firebase/i.test(u.pathname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {{ siteRoot?: string, outDir: string, label: string, scenario: 'browser-offline-30s' | 'cloud-block-2.5s', observeAfterMs?: number }} opts
 */
export async function runDisconnectBannerRepro(opts) {
  const siteRoot = opts.siteRoot || REPO_ROOT;
  const outDir = opts.outDir;
  const scenario = opts.scenario || 'browser-offline-30s';
  const observeAfterMs =
    Number(opts.observeAfterMs) >= 0
      ? Number(opts.observeAfterMs)
      : scenario === 'browser-offline-30s'
        ? 30000
        : 30000;
  mkdirSync(outDir, { recursive: true });
  const consoleLines = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  ctx.setDefaultTimeout(180000);
  await installPr101SiteRoute(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  pr101DbgListener(board, consoleLines);
  pr101DbgListener(ctrl, consoleLines);

  await board.goto(
    `${GITHUB_PAGES_BASE}/?mode=cloud&store=${PR101_STORE}&device=${PR101_DEVICE}`,
  );
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${PR101_STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await sampleControllerDbg(ctrl);

  const offlineSamples = [];
  let cloudBlockActive = false;

  if (scenario === 'cloud-block-2.5s') {
    const blockHandler = async (route) => {
      const url = route.request().url();
      if (cloudBlockActive && isMilkshaCloudBackendUrl(url)) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    };
    await ctx.route('**/*', blockHandler);
    cloudBlockActive = true;
    console.log('[pr101-dbg] cloud-block start 2500ms');
    await ctrl.waitForTimeout(2500);
    cloudBlockActive = false;
    console.log('[pr101-dbg] cloud-block end');
    const deadline = Date.now() + observeAfterMs;
    while (Date.now() < deadline) {
      offlineSamples.push({
        at: new Date().toISOString(),
        scenario,
        phase: 'after-block',
        ...(await sampleControllerDbg(ctrl)),
      });
      const row = offlineSamples[offlineSamples.length - 1];
      if (!row.bannerHidden && /即時同步中斷/.test(row.bannerText || '')) {
        break;
      }
      await ctrl.waitForTimeout(2000);
    }
  } else if (scenario === 'browser-offline-30s') {
    await ctx.setOffline(true);
    console.log('[pr101-dbg] browser offline sampling 30000ms');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      offlineSamples.push({
        at: new Date().toISOString(),
        scenario,
        phase: 'browser-offline',
        ...(await sampleControllerDbg(ctrl)),
      });
      const row = offlineSamples[offlineSamples.length - 1];
      if (!row.bannerHidden && /即時同步中斷/.test(row.bannerText || '')) {
        break;
      }
      await ctrl.waitForTimeout(2000);
    }
    console.log('[pr101-dbg] browser offline end');
  } else {
    throw new Error('unknown disconnect scenario: ' + scenario);
  }

  const last = offlineSamples[offlineSamples.length - 1] || {};
  const passed = !last.bannerHidden && /即時同步中斷/.test(last.bannerText || '');
  const fileStem =
    scenario === 'browser-offline-30s'
      ? `disconnect-browser-offline-30s-${opts.label}`
      : `disconnect-cloud-block-2.5s-${opts.label}`;
  const evidence = {
    label: opts.label,
    scenario,
    siteRoot,
    store: PR101_STORE,
    passed,
    offlineSamples,
    consoleLines,
  };
  writeFileSync(join(outDir, `${fileStem}.json`), JSON.stringify(evidence, null, 2));
  if (scenario === 'browser-offline-30s') {
    await ctx.setOffline(false);
  }
  await browser.close();
  return evidence;
}
