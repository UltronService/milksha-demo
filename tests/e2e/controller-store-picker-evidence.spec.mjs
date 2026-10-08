import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  expandControllerZone,
} from './harness.mjs';

async function readFakeCloudDevLoginCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/devLoginCount`);
  const json = await res.json();
  return Number(json.count) || 0;
}

async function readFakeCloudListStoresCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/listStoresCount`);
  const json = await res.json();
  return Number(json.count) || 0;
}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const EVIDENCE_DIR = join(process.cwd(), 'artifacts', 'store-picker-self-qa', 'evidence');

function writeEvidence(name, payload) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(payload, null, 2));
}

test.describe('controller store picker evidence (fake-cloud)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('3a listStores pauses in background tab and refreshes on foreground', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    let listStoresCalls = 0;
    await installBundledCloudRouteShim(page);
    await page.route('**/listStores', async (route) => {
      listStoresCalls += 1;
      await route.continue();
    });
    await page.goto(`${BASE}/controller/?mode=cloud&store=c030020&testStoreListPollMs=2000`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    const afterBoot = listStoresCalls;
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get() { return this.__hiddenTab; }, set(v) { this.__hiddenTab = v; } });
      document.__hiddenTab = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(6500);
    const whileHidden = listStoresCalls;
    await page.evaluate(() => {
      document.__hiddenTab = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => listStoresCalls, { timeout: 8000 }).toBeGreaterThan(whileHidden);
    const evidence = {
      test: 'controller-store-picker-evidence.spec.mjs › 3a listStores pauses in background tab and refreshes on foreground',
      pollIntervalMs: 2000,
      listStoresAfterBoot: afterBoot,
      listStoresWhileHidden5s: whileHidden,
      listStoresAfterForeground: listStoresCalls,
      pausedWhileHidden: whileHidden === afterBoot,
      refreshedOnForeground: listStoresCalls > whileHidden,
    };
    writeEvidence('3a-background-foreground-listStores.json', evidence);
    expect(evidence.pausedWhileHidden).toBe(true);
    expect(evidence.refreshedOnForeground).toBe(true);
    await ctx.close();
  });

  test('3b zz-qa hidden by default but URL-pinned zz-qa-store-a is selectable', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await page.evaluate(() => window.__controller.refreshStoreListFromCloud());
    await expandControllerZone(page, 'sec-connect');
    const defaultList = await page.locator('#fld-store option').evaluateAll((opts) =>
      opts.map((o) => o.value),
    );
    await page.goto(`${BASE}/controller/?mode=cloud&store=zz-qa-store-a`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await page.evaluate(() => window.__controller.refreshStoreListFromCloud());
    await expandControllerZone(page, 'sec-connect');
    const pinnedValue = await page.locator('#fld-store').inputValue();
    const pinnedList = await page.locator('#fld-store option').evaluateAll((opts) =>
      opts.map((o) => o.value),
    );
    const evidence = {
      test: 'controller-store-picker-evidence.spec.mjs › 3b zz-qa hidden by default but URL-pinned zz-qa-store-a is selectable',
      defaultStoreUrl: 'c030020',
      defaultListIncludesZzQa: defaultList.some((id) => id.indexOf('zz-qa-') === 0),
      defaultList,
      pinnedStoreUrl: 'zz-qa-store-a',
      pinnedSelectedValue: pinnedValue,
      pinnedListIncludesZzQaStoreA: pinnedList.includes('zz-qa-store-a'),
      pinnedList,
    };
    writeEvidence('3b-zz-qa-url-pin.json', evidence);
    expect(evidence.defaultListIncludesZzQa).toBe(false);
    expect(evidence.pinnedSelectedValue).toBe('zz-qa-store-a');
    expect(evidence.pinnedListIncludesZzQaStoreA).toBe(true);
    await ctx.close();
  });

  test('3c two minutes: devLogin and listStores counts with store switch', async ({ browser }) => {
    test.setTimeout(200000);
    const ctx = await isolatedCloudContext(browser);
    const boardA = await ctx.newPage();
    const boardC = await ctx.newPage();
    await installBundledCloudRouteShim(boardA);
    await installBundledCloudRouteShim(boardC);
    await boardA.goto(`${BASE}/?mode=cloud&store=zz-qa-store-a`);
    await boardC.goto(`${BASE}/?mode=cloud&store=c030020`);
    await boardA.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await boardC.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const devLoginBefore = await readFakeCloudDevLoginCount();
    const listStoresBefore = await readFakeCloudListStoresCount();
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=zz-qa-store-a&testStoreListPollMs=30000`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    const devLoginAfterBoot = await readFakeCloudDevLoginCount();
    const listStoresAfterBoot = await readFakeCloudListStoresCount();
    await expandControllerZone(page, 'sec-connect');
    await page.waitForTimeout(45000);
    await page.selectOption('#fld-store', 'c030020');
    await page.waitForTimeout(5000);
    await page.waitForTimeout(70000);
    const devLoginAfter = await readFakeCloudDevLoginCount();
    const listStoresAfter = await readFakeCloudListStoresCount();
    const evidence = {
      test: 'controller-store-picker-evidence.spec.mjs › 3c two minutes: devLogin and listStores counts with store switch',
      windowSeconds: 120,
      pollIntervalMs: 30000,
      devLoginBefore,
      devLoginAfterBoot,
      devLoginAfter,
      devLoginDeltaAfterBoot: devLoginAfter - devLoginAfterBoot,
      listStoresBefore,
      listStoresAfterBoot,
      listStoresAfter,
      listStoresDeltaAfterBoot: listStoresAfter - listStoresAfterBoot,
      storeSwitchTarget: 'c030020',
      evidenceEndpoint: 'artifacts/store-picker-self-qa/evidence/3c-devlogin-liststores-2min.json',
    };
    writeEvidence('3c-devlogin-liststores-2min.json', evidence);
    expect(evidence.devLoginDeltaAfterBoot).toBe(0);
    expect(evidence.listStoresAfterBoot - evidence.listStoresBefore).toBeGreaterThanOrEqual(1);
    expect(evidence.listStoresDeltaAfterBoot).toBeGreaterThanOrEqual(2);
    await ctx.close();
  });

  test('3d options sorted by storeId with online/offline text and color class', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const boardA = await ctx.newPage();
    const boardB = await ctx.newPage();
    await installBundledCloudRouteShim(boardA);
    await installBundledCloudRouteShim(boardB);
    await boardA.goto(`${BASE}/?mode=cloud&store=zz-qa-store-a`);
    await boardB.goto(`${BASE}/?mode=cloud&store=c030020`);
    await boardA.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await boardB.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await page.evaluate(() => window.__controller.refreshStoreListFromCloud());
    await expandControllerZone(page, 'sec-connect');
    const options = await page.locator('#fld-store option').evaluateAll((opts) =>
      opts.map((o) => ({
        value: o.value,
        text: o.textContent || '',
        className: o.className,
      })),
    );
    const values = options.map((o) => o.value);
    const sorted = values.slice().sort((a, b) => a.localeCompare(b));
    const hasOnlineOfflineWords = options.every((o) => /online|offline/.test(o.text));
    const hasColorClass = options.every((o) => o.className === 'store-online' || o.className === 'store-offline');
    const evidence = {
      test: 'controller-store-picker-evidence.spec.mjs › 3d options sorted by storeId with online/offline text and color class',
      options,
      sortedMatches: JSON.stringify(values) === JSON.stringify(sorted),
      hasOnlineOfflineWords,
      hasColorClass,
    };
    writeEvidence('3d-sort-online-offline.json', evidence);
    expect(evidence.sortedMatches).toBe(true);
    expect(evidence.hasOnlineOfflineWords).toBe(true);
    expect(evidence.hasColorClass).toBe(true);
    await ctx.close();
  });
});
