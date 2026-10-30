import { test, expect } from '@playwright/test';
import {
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  restartCloud,
  resetCloudState,
  startSite,
} from './harness.mjs';
import { blockNonLocalNetwork } from './helpers/block-non-local-network.mjs';
import {
  QA_SAMPLE_INTERVAL_MS,
  buildDiagonalMotionTracker,
  qaSampleMotionAndCells,
  qaMixed40Snap,
} from './demo-panel-qa-agent-method-helpers.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1080p' },
  { width: 3840, height: 2160, tag: '4k' },
];

async function openDemoBoard(page) {
  await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
  await installBundledCloudRouteShim(page);
  await page.goto(
    `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=60000&device=stb-01`,
  );
  await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
  await page.locator('.milksha-demo-handle').click();
}

async function primeSilent(page) {
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
}

test.describe('PR #123 QA agent method (demo panel)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  for (const vp of VIEWPORTS) {
    test(`pulse 8102 prep→ready: no diagonal bbox move @ ${vp.tag}`, async ({ browser }) => {
      test.setTimeout(180000);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
      await installBundledCloudRouteShim(page);
      await page.goto(
        `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=60000&device=stb-01`,
      );
      await page.waitForFunction(() => window.QMS?.runtime?.applyPayload, undefined, { timeout: 45000 });
      await primeSilent(page);

      const motionTracker = buildDiagonalMotionTracker();
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8102' }]);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8102' },
          { source_type: 'From_Store_OK', number: '8102' },
        ]);
      });

      const pulseMs = await page.evaluate(() => {
        const cfg = window.QMS.MilkshaBoardAnimConfig.getConfig();
        return cfg.readyScaleInMs + cfg.readyScaleHoldMs + cfg.readyScaleOutMs + 200;
      });

      const violations = [];
      const end = Date.now() + pulseMs;
      while (Date.now() < end) {
        violations.push(...(await qaSampleMotionAndCells(page, motionTracker)));
        await page.waitForTimeout(QA_SAMPLE_INTERVAL_MS);
      }
      expect(violations, JSON.stringify(violations.slice(0, 5))).toEqual([]);
      await ctx.close();
    });

    test(`push spam ×3: no in-cell overlap or diagonal bbox @ ${vp.tag}`, async ({ browser }) => {
      test.setTimeout(240000);
      for (let run = 1; run <= 3; run += 1) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await openDemoBoard(page);
        await primeSilent(page);

        const motionTracker = buildDiagonalMotionTracker();
        const violations = [];
        let frameIdx = 0;

        const sampleOnce = async () => {
          const v = await qaSampleMotionAndCells(page, motionTracker);
          if (v.length) {
            violations.push(...v.map((x) => ({ frame: frameIdx, run, ...x })));
          }
          frameIdx += 1;
        };

        await sampleOnce();
        for (let i = 0; i < 30; i += 1) {
          if (i % 3 === 0) {
            await page.locator('#ms-demo-push').dispatchEvent('click');
          } else {
            await page.locator('#ms-demo-add').dispatchEvent('click');
          }
          await page.waitForTimeout(35);
          await sampleOnce();
        }
        const observeEnd = Date.now() + 2200;
        while (Date.now() < observeEnd) {
          await page.waitForTimeout(QA_SAMPLE_INTERVAL_MS);
          await sampleOnce();
        }
        expect(violations, `run ${run}: ${JSON.stringify(violations.slice(0, 8))}`).toEqual([]);
        await ctx.close();
      }
    });
  }

  test('mixed 40 clicks: no stacked cells or duplicate visible prep/ready nums @ 1080p', async ({
    browser,
  }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await openDemoBoard(page);
    await primeSilent(page);

    const issues = [];
    for (let i = 0; i < 40; i += 1) {
      const pick = i % 5;
      if (pick === 0) {
        await page.locator('#ms-demo-push').dispatchEvent('click');
      } else if (pick === 4 && i > 20) {
        await page.locator('#ms-demo-clear').dispatchEvent('click');
      } else {
        await page.locator('#ms-demo-add').dispatchEvent('click');
      }
      if (i % 3 === 0) {
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
              });
            }),
        );
        const snap = await page.evaluate(qaMixed40Snap);
        if (snap.bad.length || snap.dupPrep || snap.dupReady) {
          issues.push({ i, snap });
        }
      }
      await page.waitForTimeout(30);
    }
    expect(issues, JSON.stringify(issues)).toEqual([]);
    await ctx.close();
  });
});
