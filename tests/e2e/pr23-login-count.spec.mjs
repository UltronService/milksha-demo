import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ART = '/opt/cursor/artifacts/pr23-qa';
mkdirSync(ART, { recursive: true });
const BASE = `http://127.0.0.1:${PORT_SITE}`;

test.describe('PR23 login rate', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  async function countAuthCalls(page, seconds, outage) {
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
    if (outage) {
      await page.route('https://firestore.googleapis.com/**', (r) => r.abort('failed'));
      await page.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (r) =>
        r.abort('failed'),
      );
    }
    await page.waitForTimeout(seconds * 1000);
    return { devLogin, signIn, seconds, outage };
  }

  test('5 min normal board idle', async ({ browser }) => {
    test.setTimeout(360000);
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?testAuthRecheckMs=600000`);
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const counts = await countAuthCalls(page, 300, false);
    writeFileSync(`${ART}/login-count-normal-5m.json`, JSON.stringify(counts, null, 2));
    expect(counts.devLogin).toBeLessThanOrEqual(4);
    expect(counts.signIn).toBeLessThanOrEqual(4);
    await ctx.close();
  });

  test('2 min outage after boot', async ({ browser }) => {
    test.setTimeout(180000);
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?testAuthRecheckMs=600000`);
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const counts = await countAuthCalls(page, 120, true);
    writeFileSync(`${ART}/login-count-outage-2m.json`, JSON.stringify(counts, null, 2));
    expect(counts.devLogin).toBeLessThanOrEqual(4);
    await ctx.close();
  });
});
