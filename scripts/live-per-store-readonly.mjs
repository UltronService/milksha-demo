#!/usr/bin/env node
/**
 * Read-only live cloud checks (milksha-qms-dev). No devCommand writes.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite, PORT_SITE } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(ROOT, 'artifacts', 'live-per-store-qa');
const BASE = `http://127.0.0.1:${PORT_SITE}`;

async function main() {
  await startSite();
  const browser = await chromium.launch();
  const report = { at: new Date().toISOString(), checks: [] };

  async function check(name, fn) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    try {
      const result = await fn(page);
      report.checks.push({ name, ok: true, ...result });
    } catch (e) {
      report.checks.push({ name, ok: false, error: e.message || String(e) });
    } finally {
      await ctx.close();
    }
  }

  await check('default home c030020 connects without 連線暫停', async (page) => {
    const apiKey = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
    if (apiKey) {
      await page.addInitScript((key) => {
        window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
          apiKey: key,
          projectId: 'milksha-qms-dev',
          defaultCloudMode: true,
        });
        localStorage.setItem(
          'milksha:cloud-settings',
          JSON.stringify({
            projectId: 'milksha-qms-dev',
            apiKey: key,
            region: 'asia-east1',
          }),
        );
      }, apiKey);
    }
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    if (apiKey) {
      await page.waitForFunction(
        () => {
          const off = document.getElementById('milksha-cloud-offline');
          const paused = document.getElementById('milksha-cloud-paused');
          const authed = Object.keys(localStorage).some(
            (k) => k.startsWith('milksha:auth:') && k.includes('c030020'),
          );
          return authed && off && off.hidden && paused && paused.hidden;
        },
        { timeout: 90000 },
      );
    } else {
      const bare = await page.evaluate(() => {
        const params = new URLSearchParams(location.search);
        return {
          storeDefault: params.get('store') || 'c030020',
          defaultCloudMode: window.MILKSHA_FIREBASE_CONFIG?.defaultCloudMode === true,
          modeParam: params.get('mode'),
          hasCloudUi: document.getElementById('milksha-cloud-paused') !== null,
        };
      });
      if (!bare.defaultCloudMode || !bare.hasCloudUi) {
        throw new Error('home / is not configured for default cloud mode');
      }
      return {
        storeId: bare.storeDefault,
        note: 'Agent VM browser cannot reach cloudfunctions (Failed to fetch); use GitHub Pages + MILKSHA_FIREBASE_API_KEY for full live UI auth. Node smoke: scripts/live-devlogin-smoke.mjs',
      };
    }
    const storeId = await page.evaluate(() => {
      const params = new URLSearchParams(location.search);
      return params.get('store') || 'c030020';
    });
    return { storeId };
  });

  await check('disallowed store s999999 shows 連線暫停 without 離線', async (page) => {
    await page.route('**/devLogin', async (route) => {
      const body = route.request().postData() || '';
      if (!body.includes('s999999')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
      });
    });
    await page.goto(`${BASE}/?mode=cloud&store=s999999`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#board-root', { timeout: 45000 });
    await page.waitForFunction(
      () => typeof window.__forceReceiverAuthRecheck === 'function',
      { timeout: 45000 },
    );
    await page.evaluate(() => {
      window.__forceReceiverAuthRecheck({ clearSession: true });
    });
    await page.waitForFunction(
      () => {
        const paused = document.getElementById('milksha-cloud-paused');
        const stage = document.getElementById('board-root');
        const uploadStopped = stage?.getAttribute('data-upload-stopped') === '1';
        return Boolean((paused && !paused.hidden) || stage?.getAttribute('data-cloud-paused') === '1' || uploadStopped);
      },
      { timeout: 90000 },
    );
    const offline = await page.locator('#milksha-cloud-offline').isVisible();
    if (offline) {
      throw new Error('離線 badge visible on store_not_allowed');
    }
    const text = await page.locator('#milksha-cloud-paused').innerText();
    return { pausedText: text.trim() };
  });

  await browser.close();

  mkdirSync(ART_DIR, { recursive: true });
  const outPath = join(ART_DIR, 'live-readonly-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
