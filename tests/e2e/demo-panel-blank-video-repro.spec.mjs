/**
 * Repro from owner video https://youtu.be/g0YGPFKVPWU
 * Symptom: headers remain, page indicator shows 2/2, both columns empty (not full white page).
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync as mkdirSync2, writeFileSync } from 'node:fs';
import {
  PORT_SITE,
  PORT_CLOUD,
  siteRoot,
  installBundledCloudRouteShim,
  restartCloud,
  resetCloudState,
  startSite,
} from './harness.mjs';
import { blockNonLocalNetwork } from './helpers/block-non-local-network.mjs';

const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'demo-blank-repro');
const BASE = `http://127.0.0.1:${PORT_SITE}`;

function ensurePreviewMirror() {
  const root = siteRoot();
  const preview = join(root, 'pr-preview', 'pr-123');
  if (existsSync(join(preview, 'index.html'))) {
    return;
  }
  mkdirSync(preview, { recursive: true });
  execSync(
    `tar -C "${root}" -cf - ` +
      `--exclude=.git --exclude=pr-preview --exclude=node_modules --exclude=tests --exclude=tools . ` +
      `| tar -C "${preview}" -xf -`,
    { stdio: 'ignore' },
  );
}

async function readVideoBlankState(page) {
  return page.evaluate(() => {
    const runtime = window.QMS && window.QMS.runtime;
    const snap = runtime && runtime.getSnapshot ? runtime.getSnapshot() : { preparing: [], ready: [] };
    function zoneStats(sel) {
      const zone = document.querySelector(sel);
      if (!zone) {
        return { indicator: '', visibleNums: 0, domNums: 0 };
      }
      const nums = zone.querySelectorAll('.milksha-num');
      let visible = 0;
      nums.forEach((el) => {
        const st = window.getComputedStyle(el);
        if (parseFloat(st.opacity || '1') > 0.12 && st.visibility !== 'hidden') {
          visible += 1;
        }
      });
      let indicator = '';
      const layer = zone.querySelector('.milksha-zone-numbers');
      if (layer) {
        const children = layer.children;
        for (let i = 0; i < children.length; i += 1) {
          const t = (children[i].textContent || '').trim();
          if (/^\d+\s*\/\s*\d+$/.test(t)) {
            indicator = t;
          }
        }
      }
      return { indicator, visibleNums: visible, domNums: nums.length };
    }
    const prep = zoneStats('.milksha-zone.milksha-prep');
    const ready = zoneStats('.milksha-zone.milksha-ready');
    const paused = document.querySelector('#milksha-cloud-paused');
    return {
      prep,
      ready,
      modelPrep: snap.preparing?.length || 0,
      modelReady: snap.ready?.length || 0,
      pausedVisible: Boolean(paused && !paused.hidden),
      path: location.pathname + location.search,
    };
  });
}

function isVideoBlank(state) {
  const prepEmpty = state.prep.visibleNums === 0;
  const readyEmpty = state.ready.visibleNums === 0;
  const hasModel = state.modelPrep + state.modelReady > 0;
  const onLaterPage =
    /\/\s*2$/.test(state.prep.indicator.replace(/\s/g, '')) ||
    /\/\s*2$/.test(state.ready.indicator.replace(/\s/g, ''));
  if (prepEmpty && readyEmpty && hasModel && onLaterPage) {
    return { hit: true, reason: 'video-signature-2/2-empty-with-model' };
  }
  if (prepEmpty && readyEmpty && hasModel) {
    return { hit: true, reason: 'both-zones-empty-with-model' };
  }
  return { hit: false, reason: '' };
}

async function capture(page, name, state, steps) {
  mkdirSync2(ARTIFACT_DIR, { recursive: true });
  const safe = name.replace(/[^a-z0-9_-]+/gi, '_');
  await page.screenshot({ path: join(ARTIFACT_DIR, `${safe}.png`), fullPage: true });
  writeFileSync(join(ARTIFACT_DIR, `${safe}.json`), JSON.stringify({ steps, state }, null, 2));
}

test.describe('owner video blank repro (g0YGPFKVPWU)', () => {
  test.beforeAll(async () => {
    ensurePreviewMirror();
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('pr-preview path + rapid demo script push (video sequence)', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);

    const url =
      `${BASE}/pr-preview/pr-123/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&device=stb-01`;
    const steps = [];
    await page.goto(url);
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 60000 });
    steps.push('goto pr-preview URL');

    await page.locator('.milksha-demo-handle').click();
    await page.locator('.milksha-demo-drawer.open').waitFor({ timeout: 10000 });
    steps.push('open demo drawer');

    for (let i = 0; i < 35; i += 1) {
      await page.locator('#ms-demo-push').dispatchEvent('click');
      if (i % 5 === 4) {
        const st = await readVideoBlankState(page);
        const v = isVideoBlank(st);
        if (v.hit) {
          await capture(page, 'video-repro-hit-during-push', st, steps);
          throw new Error(`VIDEO BLANK: ${v.reason} at push ${i + 1}`);
        }
      }
    }
    steps.push('rapid push x35');

    await page.locator('#ms-demo-auto').dispatchEvent('click');
    await page.locator('[data-interval="1"]').dispatchEvent('click');
    steps.push('auto play 1s');

    for (let j = 0; j < 25; j += 1) {
      await page.waitForTimeout(200);
      await page.locator('#ms-demo-add').dispatchEvent('click');
      await page.locator('#ms-demo-rand-ready').dispatchEvent('click');
      await page.locator('#ms-demo-clear').dispatchEvent('click');
      await page.locator('#ms-demo-push').dispatchEvent('click');
      const st = await readVideoBlankState(page);
      const v = isVideoBlank(st);
      if (v.hit) {
        steps.push(`rapid mix round ${j + 1}`);
        await capture(page, 'video-repro-hit-mixed', st, steps);
        throw new Error(`VIDEO BLANK: ${v.reason} at mixed round ${j + 1}`);
      }
    }
    steps.push('mixed add/rand-ready/clear/push x25');

    for (let k = 0; k < 22; k += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
    }
    steps.push('add x22 (force multi-page)');
    await page.waitForTimeout(6500);
    steps.push('wait prep/ready auto page flip');
    await page.locator('#ms-demo-clear').dispatchEvent('click');
    await page.locator('#ms-demo-push').dispatchEvent('click');
    steps.push('clear + push during/after page flip');
    const mid = await readVideoBlankState(page);
    const midV = isVideoBlank(mid);
    if (midV.hit) {
      await capture(page, 'video-repro-hit-page-flip', mid, steps);
      throw new Error(`VIDEO BLANK: ${midV.reason}`);
    }

    await page.waitForTimeout(5000);
    const final = await readVideoBlankState(page);
    await capture(page, 'video-repro-final-ok', final, steps);

    expect(final.modelPrep + final.modelReady).toBeGreaterThanOrEqual(0);
  });
});
