/**
 * Repro hunt: demo panel (?demo=1) + motion=on → full blank board.
 * Does not assert pass/fail for CI; writes artifacts on blank detection.
 */
import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  restartCloud,
  resetCloudState,
  startSite,
} from './harness.mjs';
import { blockNonLocalNetwork } from './helpers/block-non-local-network.mjs';

const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'demo-blank-repro');
const BASE = `http://127.0.0.1:${PORT_SITE}`;

function ensureArtifactDir() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function readBoardHealth(page) {
  return page.evaluate(() => {
    const root = document.getElementById('board-root');
    const runtime = window.QMS && window.QMS.runtime;
    const snap = runtime && runtime.getSnapshot ? runtime.getSnapshot() : null;
    const modelCount =
      snap ? (snap.preparing?.length || 0) + (snap.ready?.length || 0) : -1;
    const cells = document.querySelectorAll('.milksha-num');
    let visibleChips = 0;
    let maxOpacity = 0;
    cells.forEach((el) => {
      const st = window.getComputedStyle(el);
      const op = parseFloat(st.opacity || '1');
      if (op > 0.15 && st.visibility !== 'hidden' && st.display !== 'none') {
        visibleChips += 1;
      }
      maxOpacity = Math.max(maxOpacity, op);
    });
    const bootError = Boolean(root && root.classList.contains('boot-error-stage'));
    const paused = document.querySelector('#milksha-cloud-paused');
    const pausedVisible = paused && !paused.hidden;
    const zonesReady = Boolean(
      document.querySelector('.milksha-zone.prep .milksha-zone-numbers') &&
        document.querySelector('.milksha-zone.ready .milksha-zone-numbers'),
    );
    const rootText = root ? (root.innerText || '').trim().slice(0, 200) : '';
    const boardShell = document.querySelector('.milksha-board');
    const rootChildCount = root ? root.children.length : 0;
    const boardDisplay =
      boardShell && window.getComputedStyle(boardShell).display !== 'none'
        ? window.getComputedStyle(boardShell).visibility
        : 'missing';
    const numbersLayerOpacity = (() => {
      const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
      if (!layer) {
        return null;
      }
      return parseFloat(window.getComputedStyle(layer).opacity || '1');
    })();
    return {
      bootError,
      pausedVisible,
      zonesReady,
      modelCount,
      domChipCount: cells.length,
      visibleChips,
      maxOpacity,
      rootText,
      rootChildCount,
      boardShell: Boolean(boardShell),
      boardDisplay,
      numbersLayerOpacity,
    };
  });
}

function isVisuallyBlank(health) {
  if (health.bootError) {
    return { blank: true, reason: 'boot-error' };
  }
  if (!health.boardShell && !health.bootError) {
    return { blank: true, reason: 'milksha-board-missing' };
  }
  if (health.rootChildCount === 0) {
    return { blank: true, reason: 'board-root-empty' };
  }
  if (!health.zonesReady && health.modelCount > 0) {
    return { blank: true, reason: 'zones-missing-with-model' };
  }
  if (health.modelCount > 0 && health.visibleChips === 0) {
    return { blank: true, reason: 'model-has-items-zero-visible-chips' };
  }
  if (health.modelCount > 0 && health.domChipCount === 0) {
    return { blank: true, reason: 'model-has-items-zero-dom-chips' };
  }
  if (
    health.modelCount > 0 &&
    health.numbersLayerOpacity !== null &&
    health.numbersLayerOpacity < 0.05
  ) {
    return { blank: true, reason: 'numbers-layer-opacity-near-zero' };
  }
  return { blank: false, reason: '' };
}

async function openDemoDrawer(page) {
  await page.locator('.milksha-demo-handle').click({ timeout: 15000 });
  await page.locator('.milksha-demo-drawer.open').waitFor({ timeout: 5000 });
}

async function captureBlank(page, label, stepsLog, health) {
  ensureArtifactDir();
  const safe = label.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
  const png = join(ARTIFACT_DIR, `${safe}.png`);
  await page.screenshot({ path: png, fullPage: true });
  writeFileSync(
    join(ARTIFACT_DIR, `${safe}.json`),
    JSON.stringify({ label, steps: stepsLog, health }, null, 2),
    'utf8',
  );
  return png;
}

async function runSequence(page, name, steps) {
  const log = [];
  for (const step of steps) {
    log.push(step.name);
    await step.run(page);
    await page.waitForTimeout(step.waitMs ?? 80);
    const health = await readBoardHealth(page);
    const verdict = isVisuallyBlank(health);
    if (verdict.blank) {
      const png = await captureBlank(page, name, log, { ...health, verdict });
      throw new Error(
        `BLANK after "${step.name}" (${verdict.reason}) screenshot=${png} model=${health.modelCount} visible=${health.visibleChips}`,
      );
    }
  }
  return log;
}

const BOARD_URL =
  `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&device=stb-01`;

test.describe('demo panel blank page repro (investigation)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
    ensureArtifactDir();
  });

  test('local motion=demo — stress sequences', async ({ page }) => {
    test.setTimeout(180000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    const url = `${BASE}/?mode=local&store=zz-qa-store-a&motion=on&demo=1`;
    await page.goto(url);
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 30000 });
    await openDemoDrawer(page);

    await runSequence(page, 'seq-local-push-spam', [
      {
        name: 'push x15',
        run: async (p) => {
          for (let i = 0; i < 15; i += 1) {
            await p.locator('#ms-demo-push').click();
          }
        },
        waitMs: 400,
      },
    ]);

    await runSequence(page, 'seq-local-auto-1s-clear-reset', [
      {
        name: 'auto-on + 1s interval',
        run: async (p) => {
          await p.locator('#ms-demo-auto').click();
          await p.locator('[data-interval="1"]').click();
        },
      },
      { name: 'wait 3s autoplay', run: async () => {}, waitMs: 3000 },
      {
        name: 'clear + reset spam',
        run: async (p) => {
          for (let i = 0; i < 5; i += 1) {
            await p.locator('#ms-demo-clear').click();
            await p.locator('#ms-demo-reset').click();
          }
        },
        waitMs: 500,
      },
    ]);

    await runSequence(page, 'seq-local-add-ready-rand', [
      {
        name: 'add x8 + rand-ready x8',
        run: async (p) => {
          for (let i = 0; i < 8; i += 1) {
            await p.locator('#ms-demo-add').click();
          }
          for (let j = 0; j < 8; j += 1) {
            await p.locator('#ms-demo-state-ready').click();
            await p.locator('#ms-demo-add').click();
            await p.locator('#ms-demo-rand-ready').click();
          }
        },
        waitMs: 600,
      },
    ]);

    await runSequence(page, 'seq-local-two-phase-autoplay', [
      {
        name: 'two-phase + 1s auto + clear mid-flight',
        run: async (p) => {
          await p.locator('#ms-demo-anim-two').dispatchEvent('click');
          await p.locator('#ms-demo-anim-gap').fill('0');
          await p.locator('#ms-demo-anim-move').fill('50');
          await p.locator('#ms-demo-anim-enter').fill('50');
          await p.locator('#ms-demo-anim-gap').dispatchEvent('change');
          await p.locator('#ms-demo-auto').dispatchEvent('click');
          await p.locator('[data-interval="1"]').dispatchEvent('click');
          for (let i = 0; i < 12; i += 1) {
            await p.waitForTimeout(120);
            await p.locator('#ms-demo-clear').dispatchEvent('click');
            await p.locator('#ms-demo-push').dispatchEvent('click');
            await p.locator('#ms-demo-port').dispatchEvent('click');
            await p.locator('#ms-demo-land').dispatchEvent('click');
          }
        },
        waitMs: 600,
      },
    ]);

    await runSequence(page, 'seq-local-orientation-anim', [
      {
        name: 'toggle port/land + anim-two',
        run: async (p) => {
          await p.locator('#ms-demo-port').click();
          await p.locator('#ms-demo-push').click();
          await p.locator('#ms-demo-land').click();
          await p.locator('#ms-demo-anim-two').click();
          for (let i = 0; i < 10; i += 1) {
            await p.locator('#ms-demo-push').click();
          }
        },
        waitMs: 800,
      },
    ]);
  });

  test('cloud motion=demo (preview-like URL) — stress sequences', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    } catch {
      /* optional */
    }
    await installBundledCloudRouteShim(page);
    await page.goto(BOARD_URL);
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await openDemoDrawer(page);

    await runSequence(page, 'seq-cloud-rapid-mixed', [
      {
        name: 'rapid mixed clicks',
        run: async (p) => {
          const ids = [
            '#ms-demo-push',
            '#ms-demo-add',
            '#ms-demo-clear',
            '#ms-demo-reset',
            '#ms-demo-rand-ready',
            '#ms-demo-rand-take',
          ];
          for (let round = 0; round < 25; round += 1) {
            const sel = ids[round % ids.length];
            await p.locator(sel).dispatchEvent('click');
          }
        },
        waitMs: 300,
      },
    ]);

    await runSequence(page, 'seq-cloud-auto-clear', [
      {
        name: 'auto 1s + clear during play',
        run: async (p) => {
          await p.locator('#ms-demo-auto').click();
          await p.locator('[data-interval="1"]').click();
          for (let i = 0; i < 8; i += 1) {
            await p.waitForTimeout(350);
            await p.locator('#ms-demo-clear').dispatchEvent('click');
            await p.locator('#ms-demo-push').dispatchEvent('click');
          }
        },
        waitMs: 500,
      },
    ]);

    await runSequence(page, 'seq-cloud-resync-vs-demo', [
      {
        name: 'demo push while cloud resync spam',
        run: async (p) => {
          for (let i = 0; i < 30; i += 1) {
            await p.locator('#ms-demo-push').dispatchEvent('click');
            await p.evaluate(() => {
              const rc = window.receiverCloud;
              if (rc && typeof rc.scheduleCloudResync === 'function') {
                rc.scheduleCloudResync('e2e_blank_repro');
              }
              if (rc && typeof rc.sendHeartbeat === 'function') {
                rc.sendHeartbeat();
              }
            });
          }
        },
        waitMs: 500,
      },
    ]);

    await runSequence(page, 'seq-cloud-keyboard-spam', [
      {
        name: 'space push spam with drawer open',
        run: async (p) => {
          await p.keyboard.press(' ');
          for (let i = 0; i < 20; i += 1) {
            await p.keyboard.press(' ');
          }
        },
        waitMs: 400,
      },
    ]);

    await runSequence(page, 'seq-cloud-long-fuzz', [
      {
        name: '120s pseudo-random demo panel fuzz',
        run: async (p) => {
          const buttons = [
            '#ms-demo-push',
            '#ms-demo-add',
            '#ms-demo-clear',
            '#ms-demo-reset',
            '#ms-demo-rand-ready',
            '#ms-demo-rand-take',
            '#ms-demo-auto',
            '#ms-demo-anim-two',
            '#ms-demo-port',
            '#ms-demo-land',
            '[data-interval="1"]',
          ];
          const end = Date.now() + 120000;
          let i = 0;
          while (Date.now() < end) {
            const sel = buttons[i % buttons.length];
            await p.locator(sel).dispatchEvent('click');
            if (i % 7 === 0) {
              await p.evaluate(() => {
                const rc = window.receiverCloud;
                rc?.scheduleCloudResync?.('fuzz');
                rc?.sendHeartbeat?.();
              });
            }
            i += 1;
            await p.waitForTimeout(40 + (i % 5) * 30);
          }
        },
        waitMs: 800,
      },
    ]);
  });

  test('cloud — empty cloud snapshot over demo (race)', async ({ page }) => {
    test.setTimeout(180000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(BOARD_URL);
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await openDemoDrawer(page);
    await runSequence(page, 'seq-cloud-empty-apply-race', [
      {
        name: 'demo push interleaved with silent empty applyPayload',
        run: async (p) => {
          for (let i = 0; i < 40; i += 1) {
            await p.locator('#ms-demo-push').dispatchEvent('click');
            await p.evaluate(() => {
              const rt = window.QMS && window.QMS.runtime;
              if (rt && rt.applyPayload) {
                rt.applyPayload([], { silent: true });
              }
            });
            await p.locator('#ms-demo-add').dispatchEvent('click');
          }
        },
        waitMs: 500,
      },
    ]);
  });
});
