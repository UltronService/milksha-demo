import { spawn } from 'node:child_process';
import { FAKE_CLOUD_POS_SIGN_SECRET } from '../../tools/fake-cloud/sign-secret.mjs';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execPath } from 'node:process';

const HARNESS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function siteRoot() {
  const fromEnv = process.env.MILKSHA_SITE_ROOT;
  return fromEnv ? join(fromEnv) : HARNESS_ROOT;
}
/** @deprecated use siteRoot() at request time; import-time ROOT ignores late env. */
export const ROOT = siteRoot();
export const PORT_SITE = Number(process.env.MILKSHA_E2E_PORT || 8877);
export const PORT_CLOUD = Number(process.env.FAKE_CLOUD_PORT || 8787);

let cloudProc;
let siteServer;

function stopOwnedCloud() {
  if (cloudProc && cloudProc.exitCode === null) {
    cloudProc.kill('SIGTERM');
  }
  cloudProc = null;
}

export function startCloud() {
  if (cloudProc && cloudProc.exitCode === null) {
    return;
  }
  stopOwnedCloud();
  cloudProc = spawn(execPath, [join(siteRoot(), 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT_CLOUD) },
    stdio: 'ignore',
  });
  cloudProc.on('exit', () => {
    cloudProc = null;
  });
}

export async function ensureCloudRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/health`);
    if (res.ok) {
      return;
    }
  } catch {
    /* start fresh */
  }
  cloudProc = null;
  startCloud();
  await waitCloudReady();
}

/** Kill fake-cloud on PORT_CLOUD and start the current workspace server.mjs. */
export async function restartCloud() {
  stopOwnedCloud();
  try {
    const { execSync } = await import('node:child_process');
    execSync(`fuser -k ${PORT_CLOUD}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    execSync("pkill -f 'tools/fake-cloud/server.mjs' 2>/dev/null || true", { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  cloudProc = null;
  startCloud();
  await waitCloudReady();
}

export async function resetCloudState(options) {
  const opts = options && typeof options === 'object' ? options : {};
  try {
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedDevice: opts.seedDevice !== false }),
    });
  } catch {
    /* ignore */
  }
}

export async function waitCloudReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('fake-cloud not ready');
}

export function stopSite() {
  if (siteServer) {
    siteServer.close();
    siteServer = null;
  }
}

export async function startSite() {
  if (siteServer) {
    return;
  }
  try {
    const probe = await fetch(`http://127.0.0.1:${PORT_SITE}/controller/`);
    if (probe.ok) {
      return;
    }
  } catch {
    /* start fresh */
  }
  siteServer = createServer((req, res) => {
    const urlPath = req.url?.split('?')[0] || '/';
    if (urlPath.startsWith('/__emulator')) {
      const targetPath = urlPath.replace('/__emulator', '') || '/';
      const proxy = httpRequest(
        {
          hostname: '127.0.0.1',
          port: PORT_CLOUD,
          path: targetPath + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''),
          method: req.method,
          headers: req.headers,
        },
        (pres) => {
          res.writeHead(pres.statusCode || 502, pres.headers);
          pres.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end('proxy error');
      });
      req.pipe(proxy);
      return;
    }
    try {
      let p = urlPath;
      if (p === '/') p = '/index.html';
      if (p.endsWith('/')) p += 'index.html';
      const file = join(siteRoot(), decodeURIComponent(p.replace(/^\//, '')));
      const data = readFileSync(file);
      const ext = file.split('.').pop();
      const types = {
        html: 'text/html',
        js: 'text/javascript',
        css: 'text/css',
        svg: 'image/svg+xml',
        json: 'application/json',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve, reject) => {
    siteServer.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        resolve();
        return;
      }
      reject(err);
    });
    siteServer.listen(PORT_SITE, '127.0.0.1', () => resolve());
  });
}

export function stopHarness() {
  if (siteServer) {
    siteServer.close();
    siteServer = null;
  }
  stopOwnedCloud();
}

export function urlsLocalHomePoc() {
  const base = `http://127.0.0.1:${PORT_SITE}`;
  return {
    base,
    board: `${base}/?mode=local`,
    ctrl: `${base}/controller/?mode=local`,
  };
}

export function urlsForMode(mode) {
  const base = `http://127.0.0.1:${PORT_SITE}`;
  const gw = `127.0.0.1:${PORT_SITE}`;
  const emu = mode === 'firestore' ? '&emulatorPrefix=__emulator' : '';
  const emuKey = mode === 'firestore' ? '&key=fake-api-key-for-emulator&project=milksha-qms-dev' : '';
  const recv =
    `${base}/receiver-demo/?mode=${mode}&store=s120030&device=stb-01` +
    (mode === 'firestore' ? `&gateway=${gw}${emu}${emuKey}` : '');
  const ctrl =
    `${base}/controller/?mode=${mode}&store=s120030` +
    (mode === 'firestore' ? `&gateway=${gw}${emu}${emuKey}` : '');
  return { recv, ctrl, base };
}

export async function installBundledCloudRouteShim(page) {
  const base = `http://127.0.0.1:${PORT_CLOUD}`;
  async function proxyToFakeCloud(route, targetUrl) {
    const req = route.request();
    const headers = { ...req.headers() };
    delete headers.host;
    const res = await fetch(targetUrl, {
      method: req.method(),
      headers,
      body: req.postDataBuffer(),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const outHeaders = {};
    res.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    await route.fulfill({ status: res.status, headers: outHeaders, body });
  }

  await page.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', async (route) => {
    const u = new URL(route.request().url());
    const fn = u.pathname.replace(/^\//, '');
    await proxyToFakeCloud(route, `${base}/fn/milksha-qms-dev/asia-east1/${fn}${u.search}`);
  });
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxyToFakeCloud(route, `${base}/identity${u.pathname}${u.search}`);
  });
  await page.route('https://securetoken.googleapis.com/**', async (route) => {
    const req = route.request();
    let idToken = 'fake-id-token';
    try {
      const body = JSON.parse(req.postData() || '{}');
      const refresh = String(body.refresh_token || '').trim();
      if (refresh.startsWith('fake-')) {
        idToken = refresh;
      }
    } catch {
      /* keep default */
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_token: idToken,
        refresh_token: 'fake-refresh',
        expires_in: '3600',
        token_type: 'Bearer',
      }),
    });
  });
  await page.route('https://firestore.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxyToFakeCloud(route, `${base}${u.pathname}${u.search}`);
  });
}

export async function isolatedCloudContext(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  return ctx;
}

export async function freshContext(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      // Use localStorage (not sessionStorage): each tab has its own sessionStorage,
      // so a second page would clear shared localStorage and drop receiver heartbeats.
      if (!localStorage.getItem('__e2e_init')) {
        localStorage.clear();
        localStorage.setItem('__e2e_init', '1');
      }
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'fake-api-key-for-emulator',
          region: 'asia-east1',
          useEmulator: true,
          gateway: '',
          emulatorPrefix: '',
        }),
      );
    } catch {
      /* ignore */
    }
  });
  return ctx;
}

/** Guest-visible board styles (excludes clock text). */
export async function guestBoardStyleFingerprint(page) {
  return page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
        outline: s.outline,
        outlineWidth: s.outlineWidth,
        boxShadow: s.boxShadow,
        opacity: s.opacity,
        filter: s.filter,
        border: s.border,
      };
    };
    const stage = document.getElementById('rcv-stage');
    const board = document.querySelector('.rcv-board');
    const offlineClass = [];
    document.querySelectorAll('.rcv-board [class*="offline"], .rcv-stage [class*="offline"]').forEach((el) => {
      offlineClass.push(el.className);
    });
    return {
      stageSimulatedOffline: stage ? stage.getAttribute('data-simulated-offline') : null,
      stage: pick(stage),
      board: pick(board),
      offlineClassNames: offlineClass,
    };
  });
}

async function resolveReceiverStoreId(receiver, storeOverride) {
  if (storeOverride) {
    return storeOverride;
  }
  return receiver.evaluate(() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('store');
    if (fromUrl) {
      return fromUrl;
    }
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (path.includes('receiver-demo')) {
      return 's120030';
    }
    return 'c030020';
  });
}

export async function waitForReceiverOnline(receiver, mode, storeOverride) {
  const storeId = await resolveReceiverStoreId(receiver, storeOverride);
  const deviceId = 'stb-01';
  if (mode === 'local') {
    await receiver.waitForFunction(
      ({ store, device }) => {
        const raw = localStorage.getItem(`milksha:local:device:${store}:${device}`);
        if (!raw) return false;
        try {
          const doc = JSON.parse(raw);
          return Boolean(doc && doc.online);
        } catch {
          return false;
        }
      },
      { store: storeId, device: deviceId },
      { timeout: 25000 },
    );
    return;
  }
  const { base } = urlsForMode('firestore');
  const deviceUrl =
    `${base}/__emulator/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/${storeId}/devices/${deviceId}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const online = await receiver.evaluate(async (url) => {
      try {
        const res = await fetch(url, { headers: { Authorization: 'Bearer fake' } });
        if (!res.ok) return false;
        const doc = await res.json();
        const fields = doc.fields || {};
        return fields.online && fields.online.booleanValue === true;
      } catch {
        return false;
      }
    }, deviceUrl);
    if (online) {
      return;
    }
    await receiver.waitForTimeout(500);
  }
  throw new Error('firestore receiver device not online on fake-cloud');
}

export async function expandControllerZone(page, zoneId) {
  await page.evaluate((id) => {
    const section = document.getElementById(id);
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
  }, zoneId);
}

export async function connectController(page, mode) {
  await expandControllerZone(page, 'sec-connect');
  await page.evaluate(() => {
    const adv = document.getElementById('advanced-settings');
    if (adv) {
      adv.open = true;
    }
  });
  if (mode === 'firestore') {
    await page.selectOption('#fld-mode', 'firestore');
    // 進階設定 is collapsed by default; set fields via script (URL params also feed buildConfig).
    await page.evaluate(
      ({ host, key }) => {
        const adv = document.getElementById('advanced-settings');
        if (adv) adv.open = true;
        const g = document.getElementById('fld-gateway');
        const k = document.getElementById('fld-cloud-apikey');
        const p = document.getElementById('fld-cloud-project');
        const emu = document.getElementById('fld-use-emulator');
        if (g) g.value = host;
        if (k) k.value = key;
        if (p) p.value = 'milksha-qms-dev';
        if (emu) emu.checked = true;
        const prefixEl = document.getElementById('fld-emulator-prefix');
        if (prefixEl) prefixEl.value = '__emulator';
        if (window.QMS && window.QMS.Transport && window.QMS.Transport.CloudSettings) {
          window.QMS.Transport.CloudSettings.save({
            projectId: 'milksha-qms-dev',
            apiKey: key,
            gateway: host,
            useEmulator: true,
            emulatorPrefix: '__emulator',
            region: 'asia-east1',
          });
        }
      },
      {
        host: `127.0.0.1:${PORT_SITE}`,
        key: 'fake-api-key-for-emulator',
      },
    );
  } else if (mode === 'cloud') {
    await page.selectOption('#fld-mode', 'cloud');
  } else {
    await page.evaluate(() => {
      const sel = document.getElementById('fld-mode');
      if (sel) {
        sel.value = 'local';
      }
    });
  }
  await page.evaluate((posSecret) => {
    const el = document.getElementById('fld-pos-sign-key');
    if (el) el.value = posSecret;
    if (window.QMS?.Transport?.ControllerSecrets) {
      window.QMS.Transport.ControllerSecrets.savePosSignSecret(posSecret);
    }
  }, FAKE_CLOUD_POS_SIGN_SECRET);
  await page.click('#btn-connect');
  await page.waitForFunction(
    () => {
      const el = document.getElementById('online-state');
      return el && el.getAttribute('data-connected') === '1';
    },
    { timeout: 15000 },
  );
  if (mode === 'firestore') {
    try {
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status-heartbeat-at');
          return el && el.textContent && el.textContent !== '—';
        },
        { timeout: 20000 },
      );
    } catch {
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(800);
  } else if (mode === 'cloud') {
    await page.waitForTimeout(2000);
  } else {
    await page.waitForTimeout(400);
  }
  await expandControllerZone(page, 'sec-pos');
  await expandControllerZone(page, 'sec-net');
  await expandControllerZone(page, 'sec-special');
  await expandControllerZone(page, 'sec-log');
}
