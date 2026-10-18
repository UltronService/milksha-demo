import { test, expect } from '@playwright/test';
import { PORT_SITE, expandControllerZone } from './harness.mjs';

const CTRL = `http://127.0.0.1:${PORT_SITE}/controller/`;

test('POS add-ticket stays hidden until zones are expanded by user toggle', async ({ page }) => {
  await page.goto(CTRL);
  const addTicket = page.locator('[data-testid="btn-add-ticket"]');
  await expect(addTicket).toBeHidden();
  let clickFailed = false;
  try {
    await addTicket.click({ timeout: 2000 });
  } catch {
    clickFailed = true;
  }
  expect(clickFailed).toBe(true);
});

test('after expandControllerZone clicks, add-ticket is visible to the user', async ({ page }) => {
  await page.goto(CTRL);
  await expandControllerZone(page, 'sec-pos');
  await expect(page.locator('[data-testid="btn-add-ticket"]')).toBeVisible();
});
