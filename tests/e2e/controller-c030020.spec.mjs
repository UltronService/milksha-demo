import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, expandControllerZone } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test('controller store list includes c030020 and default board link uses home /?store=', async ({
  browser,
}) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/controller/?store=c030020&mode=cloud`);
  const values = await page.locator('#fld-store option').evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, text: o.textContent || '' })),
  );
  expect(values.some((o) => o.value === 'c030020')).toBe(true);
  await expandControllerZone(page, 'sec-connect');
  await page.evaluate(() => {
    const block = document.getElementById('board-link-block');
    if (block) {
      block.hidden = false;
    }
    document.getElementById('btn-gen-board-link')?.click();
  });
  const url = await page.locator('[data-testid="fld-board-simple-url"]').inputValue();
  expect(url).toMatch(/\?store=c030020/);
  expect(url).not.toContain('receiver-demo');
  await ctx.close();
});
