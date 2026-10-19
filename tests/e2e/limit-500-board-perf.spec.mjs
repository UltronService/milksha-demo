import { test, expect } from '@playwright/test';
import {
  PORT_CLOUD,
  PORT_SITE,
  ensureCloudRunning,
  installBundledCloudRouteShim,
  restartCloud,
  startSite,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 'zz-qa-store-a';

function buildReadyTickets(count) {
  const tickets = [];
  for (let i = 0; i < count; i += 1) {
    tickets.push({
      source_type: 'From_Store_OK',
      number: String(6000 + i),
    });
  }
  return tickets;
}

async function registerStore(storeId, name) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/registerStore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, name }),
  });
}

async function openBoard(browser) {
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
  await installBundledCloudRouteShim(page);
  await page.goto(`${BASE}/?mode=cloud&store=${STORE}`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 45000 });
  return { ctx, page };
}

test.describe('limit-500 board perf', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
    await ensureCloudRunning();
    await registerStore(STORE, 'QA A');
  });

  test('limit-500 item 18: 500-number apply under 200ms and page turns longtask under 50ms (4x CPU)', async ({
    browser,
  }) => {
    const { page } = await openBoard(browser);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.evaluate(() => {
      window.__limit500Perf = { applyMs: 0, maxLongTaskMs: 0 };
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > window.__limit500Perf.maxLongTaskMs) {
              window.__limit500Perf.maxLongTaskMs = entry.duration;
            }
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
        window.__limit500LongTaskObs = obs;
      } catch {
        /* longtask unsupported */
      }
    });

    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([], { silent: true });
    });
    const tickets = buildReadyTickets(500);
    const applyMs = await page.evaluate((payload) => {
      const t0 = performance.now();
      window.QMS.runtime.applyPayload(payload, { silent: true });
      const elapsed = performance.now() - t0;
      window.__limit500Perf.applyMs = elapsed;
      return elapsed;
    }, tickets);

    expect(applyMs).toBeLessThan(200);

    await page.evaluate(() => {
      window.__limit500Perf.maxLongTaskMs = 0;
    });

    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
      await page.waitForTimeout(50);
    }

    const maxLong = await page.evaluate(() => window.__limit500Perf.maxLongTaskMs);
    expect(maxLong).toBeLessThan(50);
  });

  test('limit-500 item 19: heap growth <= 10MB after 100 page turns with 500 numbers', async ({
    browser,
  }) => {
    const { page } = await openBoard(browser);
    const tickets = buildReadyTickets(500);
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload, { silent: true });
    }, tickets);

    const heapBefore = await page.evaluate(() =>
      performance.memory ? performance.memory.usedJSHeapSize : 0,
    );
    for (let i = 0; i < 100; i += 1) {
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    }
    const heapAfter = await page.evaluate(() =>
      performance.memory ? performance.memory.usedJSHeapSize : 0,
    );
    const growthMb = (heapAfter - heapBefore) / (1024 * 1024);
    expect(growthMb).toBeLessThanOrEqual(10);
  });
});
