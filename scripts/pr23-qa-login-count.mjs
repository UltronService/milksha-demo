#!/usr/bin/env node
/**
 * Count devLogin + signInWithCustomToken over a window (fake-cloud).
 * Usage: node scripts/pr23-qa-login-count.mjs [--scenario=normal|outage] [--seconds=300]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = '/opt/cursor/artifacts/pr23-qa';
mkdirSync(ART, { recursive: true });

const scenario = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'normal';
const seconds = Number(process.argv.find((a) => a.startsWith('--seconds='))?.split('=')[1] || 300);
const PORT_CLOUD = 8787;
const PORT_SITE = 4173;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttp(url, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error('timeout ' + url);
}

async function main() {
  const cloud = spawn('node', ['tools/fake-cloud/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT_CLOUD) },
    stdio: 'ignore',
  });
  const site = spawn('npx', ['serve', '-l', String(PORT_SITE), '.'], { stdio: 'ignore' });
  await waitHttp(`http://127.0.0.1:${PORT_CLOUD}/test/devLoginCount`);
  await waitHttp(`http://127.0.0.1:${PORT_SITE}/`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  let devLogin = 0;
  let signIn = 0;
  await page.route('**/devLogin', async (route) => {
    devLogin += 1;
    await route.continue();
  });
  await page.route('**/signInWithCustomToken**', async (route) => {
    signIn += 1;
    await route.continue();
  });

  const base = `http://127.0.0.1:${PORT_SITE}`;
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
    await proxy(route, `http://127.0.0.1:${PORT_CLOUD}/fn/milksha-qms-dev/asia-east1/${fn}${u.search}`);
  });
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxy(route, `http://127.0.0.1:${PORT_CLOUD}/identity${u.pathname}${u.search}`);
  });
  await page.route('https://securetoken.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id_token: 'fake-id-token',
        refresh_token: 'fake-refresh',
        expires_in: '3600',
        token_type: 'Bearer',
      }),
    });
  });
  await page.route('https://firestore.googleapis.com/**', async (route) => {
    const u = new URL(route.request().url());
    await proxy(route, `http://127.0.0.1:${PORT_CLOUD}${u.pathname}${u.search}`);
  });

  await page.goto(`${base}/?testAuthRecheckMs=600000`);
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });

  if (scenario === 'outage') {
    await page.route('https://firestore.googleapis.com/**', (route) => route.abort('failed'));
    await page.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (route) =>
      route.abort('failed'),
    );
  }

  await sleep(seconds * 1000);
  const result = { scenario, seconds, devLogin, signIn, at: new Date().toISOString() };
  writeFileSync(join(ART, `login-count-${scenario}-${seconds}s.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await ctx.close();
  await browser.close();
  cloud.kill('SIGTERM');
  site.kill('SIGTERM');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
