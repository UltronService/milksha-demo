import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode, connectController, resetCloudState } from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();
const VIEW = { width: 1920, height: 1080 };
const COMMITTED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'committed-artifacts');

const CONNECTION_TEXT_RE = /連線中|尚未連線|連線失敗|連線中斷/;

async function openNetZone(controller) {
  await controller.evaluate(() => {
    const zone = document.getElementById('sec-net');
    if (!zone) return;
    const body = zone.querySelector('.zone-body');
    const toggle = zone.querySelector('.zone-toggle');
    if (body) body.hidden = false;
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  });
  await expect(controller.locator('#btn-offline')).toBeVisible();
}

async function assertGuestBoardHasNoConnectionUi(receiver) {
  await expect(receiver.getByText('連線中')).toHaveCount(0);
  await expect(receiver.locator('[data-connection-status]')).toHaveCount(0);
  const stageText = await receiver.locator('#rcv-stage').innerText();
  expect(stageText).not.toMatch(CONNECTION_TEXT_RE);
}

/** Same guest layout as cold boot before any board payload (no 「目前沒有號碼」). */
async function assertGuestStoreNameOnly(receiver) {
  await expect(receiver.locator('#rcv-store-label')).toHaveText('迷客夏臺南東安店');
  const stageText = await receiver.locator('#rcv-stage').innerText();
  expect(stageText).not.toContain('s120030');
  expect(stageText).not.toMatch(/milkshas\d+/i);
  expect(stageText).not.toContain('stb-01');
}

async function assertBootNoDataBoard(receiver) {
  await assertGuestStoreNameOnly(receiver);
  await expect(receiver.locator('.rcv-ready .rcv-ztitle')).toContainText('可取餐');
  await expect(receiver.locator('.rcv-prep .rcv-ztitle')).toContainText('製作中');
  await expect(receiver.locator('#rcv-empty-board-hint')).toBeHidden();
  await expect(receiver.locator('#rcv-grid-ready')).toBeHidden();
  await expect(receiver.locator('#rcv-grid-prep')).toBeHidden();
  await expect(receiver.locator('.rcv-ready .rcv-num').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(receiver.locator('.rcv-prep .rcv-num').filter({ hasText: /\S/ })).toHaveCount(0);
}

function cloudSettingsInitScript() {
  return () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'e2e-placeholder-key',
          accessCode: 'fake-milksha-controller-access-code',
          region: 'asia-east1',
          useEmulator: false,
          gateway: '',
        }),
      );
      localStorage.setItem('milksha:accessCode', 'fake-milksha-controller-access-code');
    } catch {
      /* ignore */
    }
  };
}

test.describe('guest board never shows connection status', () => {
  test('boot before first board data: headers only, no empty hint', async ({ browser }) => {
    const { base } = urlsForMode('local');
    const bootUrl = `${base}/receiver-demo/?store=s120030&device=stb-01`;
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(VIEW);
    await receiver.goto(bootUrl);
    await assertBootNoDataBoard(receiver);
    await assertGuestBoardHasNoConnectionUi(receiver);
    mkdirSync(COMMITTED_DIR, { recursive: true });
    const committedPath = join(COMMITTED_DIR, 'board-boot-no-data-1920.png');
    await receiver.screenshot({ path: committedPath, fullPage: false });
    await receiver.screenshot({ path: `${ART}/board-boot-no-data-1920.png`, fullPage: false });
    await ctx.close();
  });

  test('offline with numbers keeps display without connection hint', async ({ browser }) => {
    await resetCloudState();
    const { recv, ctrl } = urlsForMode('local');
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('__e2e_init')) {
          localStorage.clear();
          sessionStorage.setItem('__e2e_init', '1');
        }
        localStorage.setItem('milksha:accessCode', 'fake-milksha-controller-access-code');
      } catch {
        /* ignore */
      }
    });
    const receiver = await ctx.newPage();
    const controller = await ctx.newPage();
    await receiver.goto(recv);
    await controller.goto(ctrl);
    await connectController(controller, 'local');
    await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 20000 });
    await controller.fill('#fld-no', '9401');
    await controller.selectOption('#fld-status', 'ready');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '9401' })).toBeVisible({
      timeout: 15000,
    });
    await openNetZone(controller);
    await controller.click('#btn-offline');
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '9401' })).toBeVisible();
    await assertGuestBoardHasNoConnectionUi(receiver);
    await ctx.close();
  });

  test('auth 401 keeps board visible without setup gate', async ({ browser }) => {
    const { base } = urlsForMode('local');
    const recv =
      `${base}/receiver-demo/?mode=cloud&store=s120030&device=stb-01`;
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await ctx.addInitScript(cloudSettingsInitScript());
    const receiver = await ctx.newPage();
    await receiver.setViewportSize(VIEW);
    await receiver.route('**/devLogin', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_token', message: 'login expired, please sign in again' }),
      }),
    );
    await receiver.goto(recv);
    await expect(receiver.locator('[data-testid="rcv-setup-gate"]')).toBeHidden({ timeout: 10000 });
    await expect(receiver.locator('[data-testid="rcv-guest-stage"]')).toBeVisible();
    await expect(receiver.locator('#rcv-stage')).toHaveAttribute('data-auth-error', /invalid_token|401|auth/);
    await assertBootNoDataBoard(receiver);
    await assertGuestBoardHasNoConnectionUi(receiver);
    mkdirSync(COMMITTED_DIR, { recursive: true });
    await receiver.screenshot({
      path: join(COMMITTED_DIR, 'board-boot-401-1920.png'),
      fullPage: false,
    });
    await receiver.screenshot({ path: `${ART}/board-boot-401-1920.png`, fullPage: false });
    await ctx.close();
  });

  test('auth 403 keeps board visible without setup gate', async ({ browser }) => {
    const { base } = urlsForMode('local');
    const recv =
      `${base}/receiver-demo/?mode=cloud&store=s120030&device=stb-01`;
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    await ctx.addInitScript(cloudSettingsInitScript());
    const receiver = await ctx.newPage();
    await receiver.route('**/devLogin', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'forbidden', message: 'no permission for this store' }),
      }),
    );
    await receiver.goto(recv);
    await expect(receiver.locator('[data-testid="rcv-setup-gate"]')).toBeHidden({ timeout: 10000 });
    await expect(receiver.locator('[data-testid="rcv-guest-stage"]')).toBeVisible();
    await expect(receiver.locator('#rcv-stage')).toHaveAttribute('data-auth-error', /forbidden|403|auth/);
    await assertBootNoDataBoard(receiver);
    await assertGuestBoardHasNoConnectionUi(receiver);
    await ctx.close();
  });
});
