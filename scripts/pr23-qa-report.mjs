#!/usr/bin/env node
/**
 * PR #23 self-QA artifact bundle (fake-cloud + optional live).
 */
import { spawn, execPath } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = '/opt/cursor/artifacts/pr23-qa';
mkdirSync(ART, { recursive: true });
const PORT_CLOUD = 8787;
const PORT_SITE = 8877;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUrl(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      /* */
    }
    await sleep(150);
  }
  throw new Error('waitUrl ' + url);
}

async function startServers() {
  const cloud = spawn(execPath, [join(ROOT, 'tools/fake-cloud/server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT_CLOUD) },
    stdio: 'ignore',
  });
  await waitUrl(`http://127.0.0.1:${PORT_CLOUD}/health`);
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedDevice: true }),
  });
  const { createServer } = await import('node:http');
  const { readFileSync: rf } = await import('node:fs');
  const site = createServer((req, res) => {
    const path = req.url?.split('?')[0] || '/';
    const file = path === '/' ? '/index.html' : path;
    try {
      const body = rf(join(ROOT, file.replace(/^\//, '')));
      res.writeHead(200);
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => site.listen(PORT_SITE, r));
  return { cloud, site };
}

async function installShim(page) {
  const base = `http://127.0.0.1:${PORT_CLOUD}`;
  async function proxy(route, targetUrl) {
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
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    await route.fulfill({ status: res.status, headers: outHeaders, body });
  }
  await page.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', async (route) => {
    const u = new URL(route.request().url());
    const fn = u.pathname.replace(/^\//, '');
    await proxy(route, `${base}/fn/milksha-qms-dev/asia-east1/${fn}${u.search}`);
  });
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxy(route, `${base}/identity${u.pathname}${u.search}`);
  });
  await page.route('https://securetoken.googleapis.com/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_token: 'fake-id-token',
        refresh_token: 'fake-refresh',
        expires_in: '3600',
      }),
    }),
  );
  await page.route('https://firestore.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxy(route, `${base}${u.pathname}${u.search}`);
  });
}

async function loginCountScenario(page, seconds, outage) {
  let devLogin = 0;
  let signIn = 0;
  await page.unroute('**/devLogin').catch(() => {});
  await page.route('**/devLogin', async (route) => {
    devLogin += 1;
    await route.continue();
  });
  await page.route('**/signInWithCustomToken**', async (route) => {
    signIn += 1;
    await route.continue();
  });
  if (outage) {
    await page.route('https://firestore.googleapis.com/**', (r) => r.abort('failed'));
    await page.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (r) => r.abort('failed'));
  }
  await sleep(seconds * 1000);
  return { devLogin, signIn, seconds, outage };
}

async function fakeClearSync(browser, base) {
  const boardCtx = await browser.newContext();
  const ctrlCtx = await browser.newContext();
  const board = await boardCtx.newPage();
  const controller = await ctrlCtx.newPage();
  await installShim(board);
  await installShim(controller);
  await board.goto(base + '/');
  await controller.goto(base + '/controller/');
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
  await controller.click('[data-testid="btn-send-numbers"]');
  await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 20000 });
  await board.route('https://firestore.googleapis.com/**', (r) => r.abort('failed'));
  await board.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (r) => r.abort('failed'));
  await sleep(2000);
  await controller.evaluate(() => {
    const sec = document.getElementById('sec-special');
    if (sec) {
      const body = sec.querySelector('.zone-body');
      const btn = sec.querySelector('.zone-toggle');
      if (body) body.hidden = false;
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
  });
  await controller.click('[data-testid="btn-clear-now"]');
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/advanceBusinessDay`, { method: 'POST' }).catch(() => {});
  await board.unroute('https://firestore.googleapis.com/**');
  await board.unroute('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**');
  await board.evaluate(() => window.receiverCloud.scheduleCloudResync('qa'));
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    { timeout: 20000 },
  );
  const shot = join(ART, 'fake-clear-after-recovery.png');
  await board.screenshot({ path: shot });
  await boardCtx.close();
  await ctrlCtx.close();
  return { ok: true, screenshot: shot };
}

async function main() {
  const report = { head: '', artifacts: [], checks: {} };
  const { cloud, site } = await startServers();
  const base = `http://127.0.0.1:${PORT_SITE}`;
  const browser = await chromium.launch();

  const page = await browser.newContext().then((c) => c.newPage());
  await installShim(page);
  await page.goto(`${base}/?testAuthRecheckMs=600000`);
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
  report.checks.loginNormal5m = await loginCountScenario(page, 300, false);
  await page.goto(`${base}/?testAuthRecheckMs=600000`);
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
  report.checks.loginOutage2m = await loginCountScenario(page, 120, true);
  await page.close();

  report.checks.fakeClearSync = await fakeClearSync(browser, base);

  writeFileSync(join(ART, 'pr23-qa-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  site.close();
  cloud.kill('SIGTERM');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
