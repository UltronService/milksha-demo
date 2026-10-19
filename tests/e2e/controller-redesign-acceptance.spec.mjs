import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, expandControllerZone, homeBoardUrl, HOME_BOARD_QA_STORE } from './harness.mjs';

const DISCONNECTED_CTRL = `http://127.0.0.1:${PORT_SITE}/controller/?mode=cloud&noCloudWarm=1`;
const LOCAL_CTRL = `http://127.0.0.1:${PORT_SITE}/controller/?mode=local&store=${HOME_BOARD_QA_STORE}`;

async function expandTestTools(page) {
  await expandControllerZone(page, 'sec-test-tools');
}

test('redesign: store selector above send; disconnected pill and disabled send', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(DISCONNECTED_CTRL);
  await page.waitForSelector('[data-testid="fld-store"]', { timeout: 15000 });
  const storeBox = await page.locator('[data-testid="sec-store-top"]').boundingBox();
  const sendBox = await page.locator('#sec-quick-send').boundingBox();
  expect(storeBox).not.toBeNull();
  expect(sendBox).not.toBeNull();
  expect(storeBox.y).toBeLessThan(sendBox.y);
  await expect(page.locator('[data-testid="connection-status-pill-label"]')).toHaveText('未連線');
  await expect(page.locator('[data-testid="btn-send-numbers"]')).toBeDisabled();
  await ctx.close();
});

test('redesign: local store options limited to c030020 and a17', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="fld-store"]');
  const values = await page.locator('#fld-store option').evaluateAll((opts) =>
    opts.map((o) => o.value).sort(),
  );
  expect(values).toEqual(['a17', 'c030020']);
  await ctx.close();
});

test('redesign: clear modal cancel vs confirm', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const page = await ctx.newPage();
  const base = `http://127.0.0.1:${PORT_SITE}`;
  await board.goto(homeBoardUrl(base, 'mode=local'));
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 20000 });
  await page.locator('[data-testid="btn-clear-board-main"]').click();
  await expect(page.locator('[data-testid="clear-board-modal"]')).toBeVisible();
  await expect(page.locator('[data-testid="clear-board-modal-store"]')).not.toHaveText('');
  await page.locator('[data-testid="btn-clear-cancel"]').click();
  await expect(page.locator('[data-testid="clear-board-modal"]')).toBeHidden();
  await page.locator('[data-testid="btn-clear-board-main"]').click();
  await page.locator('[data-testid="btn-clear-confirm"]').click();
  await expect(page.locator('[data-testid="clear-board-modal"]')).toBeHidden();
  await ctx.close();
});

test('redesign: successful send shows success bar without top error alert', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const page = await ctx.newPage();
  const base = `http://127.0.0.1:${PORT_SITE}`;
  await board.goto(homeBoardUrl(base, 'mode=local'));
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
  await page.locator('[data-testid="btn-send-numbers"]').click();
  await expect(page.locator('[data-testid="quick-send-success"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="quick-send-error"]')).toBeHidden();
  await expect(page.locator('[data-testid="command-error-alert"]')).toBeHidden();
  await ctx.close();
});

test('redesign: failed send shows error in send area only', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="btn-send-numbers"]');
  await page.selectOption('[data-testid="fld-quick-source"]', 'store');
  await page.fill('[data-testid="fld-quick-no"]', '12');
  await page.locator('[data-testid="btn-send-numbers"]').click();
  await expect(page.locator('[data-testid="quick-send-error"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="quick-send-success"]')).toBeHidden();
  await ctx.close();
});

test('redesign: test tools collapsed; zones inside expand', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="zone-toggle-test-tools"]');
  await expect(page.locator('[data-testid="controller-zone-stack"]')).toBeHidden();
  await expandTestTools(page);
  await expect(page.locator('[data-testid="zone-toggle-connect"]')).toBeVisible();
  await ctx.close();
});
