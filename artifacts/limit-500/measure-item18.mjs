import { chromium } from 'playwright';
import {
  PORT_CLOUD,
  PORT_SITE,
  ensureCloudRunning,
  installBundledCloudRouteShim,
  restartCloud,
  startSite,
} from '../../tests/e2e/harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 'zz-qa-store-a';

function buildReadyTickets(count) {
  const tickets = [];
  for (let i = 0; i < count; i += 1) {
    tickets.push({ source_type: 'From_Store_OK', number: String(6000 + i) });
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

async function main() {
  await restartCloud();
  await startSite();
  await ensureCloudRunning();
  await registerStore(STORE, 'QA A');

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
  await installBundledCloudRouteShim(page);
  await page.goto(`${BASE}/?mode=cloud&store=${STORE}`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 45000 });

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
    return performance.now() - t0;
  }, tickets);

  await page.evaluate(() => {
    window.__limit500Perf.maxLongTaskMs = 0;
  });
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.waitForTimeout(50);
  }
  const maxLong = await page.evaluate(() => window.__limit500Perf.maxLongTaskMs);

  console.log(JSON.stringify({ applyMsAfter500: applyMs, maxLongTaskMsPerPageTurn: maxLong, cpuThrottle: 4 }));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
