import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE } from './harness.mjs';

const LOCAL_CTRL = `http://127.0.0.1:${PORT_SITE}/controller/?mode=local`;
const PUBLIC_CTRL = 'https://ultronservice.github.io/milksha-demo/controller/';

const ZONE_TOGGLES = [
  { testId: 'zone-toggle-connect', title: '1. 連線與狀態', bodyTestId: 'fld-store' },
  { testId: 'zone-toggle-pos', title: '2. 模擬 POS', bodyTestId: 'btn-add-ticket' },
  { testId: 'zone-toggle-net', title: '3. 模擬網路', bodyTestId: 'btn-offline' },
  { testId: 'zone-toggle-special', title: '4. 特殊狀況', bodyTestId: 'btn-clear-now' },
  { testId: 'zone-toggle-log', title: '5. 紀錄', bodyTestId: 'log-list' },
];

async function assertControllerZones(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="btn-send-numbers"]', { timeout: 15000 });

  const sendBox = await page.locator('#sec-quick-send').boundingBox();
  expect(sendBox).not.toBeNull();

  for (const z of ZONE_TOGGLES) {
    const toggle = page.locator(`[data-testid="${z.testId}"]`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText(z.title);
    const zoneBox = await toggle.boundingBox();
    expect(zoneBox).not.toBeNull();
    expect(zoneBox.y).toBeGreaterThan(sendBox.y + sendBox.height - 4);
    await expect(page.locator(`[data-testid="${z.bodyTestId}"]`)).toBeHidden();
    await toggle.click();
    await expect(page.locator(`[data-testid="${z.bodyTestId}"]`)).toBeVisible();
    await toggle.click();
    await expect(page.locator(`[data-testid="${z.bodyTestId}"]`)).toBeHidden();
  }

  const stack = page.locator('[data-testid="controller-zone-stack"]');
  await expect(stack).toBeVisible();
}

test('controller zones stacked under quick send at 1440', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await assertControllerZones(page, { width: 1440, height: 900 });
  await ctx.close();
});

test('controller zones stacked under quick send at 1920', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await assertControllerZones(page, { width: 1920, height: 1080 });
  await ctx.close();
});

test('public controller shows five zone titles (fresh context)', async ({ browser }) => {
  test.skip(!process.env.RUN_PUBLIC_E2E, 'Set RUN_PUBLIC_E2E=1 to verify GitHub Pages after deploy');
  test.setTimeout(120000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PUBLIC_CTRL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="btn-send-numbers"]', { timeout: 30000 });
  for (const z of ZONE_TOGGLES) {
    await expect(page.locator(`[data-testid="${z.testId}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`[data-testid="${z.testId}"]`)).toContainText(z.title);
  }
  await ctx.close();
});
