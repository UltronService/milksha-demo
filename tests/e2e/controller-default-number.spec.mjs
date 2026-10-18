import { test, expect } from '@playwright/test';
import { PORT_SITE } from './harness.mjs';

const LOCAL_CTRL = `http://127.0.0.1:${PORT_SITE}/controller/?mode=local`;

test('switching source fills default and selects all', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="fld-quick-source"]');
  await page.selectOption('[data-testid="fld-quick-source"]', 'uber');
  const input = page.locator('[data-testid="fld-quick-no"]');
  await expect(input).toHaveValue('AB12C');
  const selected = await input.evaluate((el) => {
    return {
      start: el.selectionStart,
      end: el.selectionEnd,
      len: el.value.length,
    };
  });
  expect(selected.start).toBe(0);
  expect(selected.end).toBe(selected.len);
  await ctx.close();
});

test('B5: invalid after switch shows error in rule note, red border, disabled send', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.waitForSelector('[data-testid="fld-quick-no"]');
  await page.fill('[data-testid="fld-quick-no"]', '12');
  await page.selectOption('[data-testid="fld-quick-source"]', 'uber');
  await expect(page.locator('[data-testid="fld-quick-no"]')).toHaveValue('12');
  const note = page.locator('[data-testid="quick-send-rule-note"]');
  await expect(note).toHaveClass(/is-error/);
  await expect(note).toContainText(/5 位十六進位/);
  await expect(page.locator('[data-testid="fld-quick-no"]')).toHaveClass(/is-invalid/);
  const sendBtn = page.locator('[data-testid="btn-send-numbers"]');
  await expect(sendBtn).toBeDisabled();
  await expect(sendBtn).not.toHaveAttribute('title', /.+/);
  await ctx.close();
});

test('foodpanda default shows rule note to the right on wide viewport', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(LOCAL_CTRL);
  await page.selectOption('[data-testid="fld-quick-source"]', 'fp');
  const note = page.locator('[data-testid="quick-send-rule-note"]');
  await expect(note).toContainText('# 與 4 位數字');
  const layout = await page.locator('[data-testid="quick-send-number-row"]').evaluate((row) => {
    const input = row.querySelector('#fld-quick-no');
    const noteEl = row.querySelector('#quick-send-rule-note');
    const inputBox = input.getBoundingClientRect();
    const noteBox = noteEl.getBoundingClientRect();
    return {
      noteRightOfInput: noteBox.left >= inputBox.right - 2,
      sameRow: Math.abs(noteBox.top - inputBox.top) < inputBox.height,
    };
  });
  expect(layout.noteRightOfInput).toBe(true);
  expect(layout.sameRow).toBe(true);
  await ctx.close();
});
