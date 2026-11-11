/**
 * Diagnostic repro (QA profile): same browser storage, board only, no send/clear.
 * zz-qa-store-a → a17: bind record + boardAutoPair read path keep first store.
 * Expected: PASS on main and PR #105 (documents by-design #97 behavior).
 */
import { test, expect } from '@playwright/test';
import {
  PORT_CLOUD,
  PORT_SITE,
  installBundledCloudRouteShim,
  resetCloudState,
  restartCloud,
  startSite,
} from './harness.mjs';

/** Same browser profile: clear site data only once (not per navigation). */
async function qaBrowserProfileContext(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      if (localStorage.getItem('__qa_profile_seeded') === '1') {
        return;
      }
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('__qa_profile_seeded', '1');
    } catch {
      /* ignore */
    }
  });
  return ctx;
}

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'a17';

async function registerStore(storeId, name) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/registerStore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, name }),
  });
}

async function pairCounts() {
  const initial = await (
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairInitialCount`)
  ).json();
  const read = await (await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairReadCount`)).json();
  return { initial: initial.count, read: read.count };
}

test.describe('board bind record vs URL store (diagnostic repro)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
    await registerStore(STORE_A, 'QA測試店 A');
    await registerStore(STORE_B, '測試門市 A17');
  });

  test('zz-qa-store-a then a17 keeps stored binding (read path, not URL store)', async ({
    browser,
  }) => {
    const ctx = await qaBrowserProfileContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);

    await page.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page.waitForFunction(
      () => localStorage.getItem('milksha:board-bind-record') !== null,
      { timeout: 45000 },
    );

    const afterA = await pairCounts();
    expect(afterA.initial).toBe(1);
    expect(afterA.read).toBe(0);

    await page.goto(`${BASE}/?mode=cloud&store=${STORE_B}`);
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });

    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('milksha:board-bind-record') || 'null'),
    );
    const afterB = await pairCounts();
    const hint = await page.locator('#milksha-board-bind-hint').innerText().catch(() => '');

    expect(record.storeId, 'bind record stays on first paired store').toBe(STORE_A);
    expect(record.storeNumber, 'display uses stored storeNumber not bare digits').toBe(STORE_A);
    expect(afterB.initial, 'no second initial bind when record exists').toBe(1);
    expect(afterB.read, 'second boot uses read path').toBeGreaterThanOrEqual(1);
    expect(hint).toContain(STORE_A);
    expect(hint).not.toMatch(/\ba17\b/);

    await ctx.close();
  });
});
