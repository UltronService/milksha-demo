import { test, expect } from '@playwright/test';
import {
  urlsForMode,
  connectController,
  resetCloudState,
  freshContext,
  guestBoardStyleFingerprint,
  waitForReceiverOnline,
  expandControllerZone,
} from './harness.mjs';

const MODES = ['local', 'firestore'];

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {'local'|'firestore'} mode
 */
async function openSession(browser, mode, recvExtra = '') {
  await resetCloudState();
  const { recv, ctrl } = urlsForMode(mode);
  const ctx = await freshContext(browser);
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();
  await receiver.goto(recv + recvExtra);
  await receiver.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrl);
  await connectController(controller, mode);
  await waitForReceiverOnline(receiver, mode);
  if (mode === 'firestore') {
    await controller.waitForTimeout(1500);
  } else {
    await controller.waitForTimeout(800);
  }
  return { ctx, receiver, controller };
}

for (const mode of MODES) {
  const tag = mode === 'local' ? 'local' : 'firestore';

  test(`${tag} | connect and add preparing`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2101');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2101', {
      timeout: 15000,
    });
    await expect(controller.locator('#online-state')).toHaveAttribute('data-connected', '1');
    await ctx.close();
  });

  test(`${tag} | one-click ready and ring counter`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await receiver.evaluate(() => {
      window.__rcvTelemetry.ringCount = 0;
    });
    await controller.fill('#fld-no', '2201');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2201', { timeout: 15000 });
    await controller.click('#btn-one-ready');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2201', { timeout: 15000 });
    const rings = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
    expect(rings).toBeGreaterThanOrEqual(1);
    await ctx.close();
  });

  test(`${tag} | pickup scan removes ready`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2301');
    await controller.selectOption('#fld-status', 'ready');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2301', { timeout: 15000 });
    await controller.fill('#fld-pickup-scan', '2301');
    await controller.click('#btn-pickup-scan');
    await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '2301' })).toHaveCount(0, {
      timeout: 15000,
    });
    await ctx.close();
  });

  test(`${tag} | send empty list`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2401');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2401', { timeout: 15000 });
    await controller.click('#btn-clear-board');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2401' })).toHaveCount(0, {
      timeout: 15000,
    });
    await ctx.close();
  });

  test(`${tag} | tammy json and auto-generate`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.locator('#tammy-advanced').evaluate((el) => {
      el.open = true;
    });
    await controller.click('#btn-send-tammy');
    await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('1488', { timeout: 15000 });
    await controller.click('#btn-gen-normal');
    await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('1001', { timeout: 15000 });
    await controller.click('#btn-gen-peak');
    await expect(receiver.locator('.rcv-prep .rcv-num')).not.toHaveCount(0, { timeout: 15000 });
    await ctx.close();
  });

  test(`${tag} | bad signature store format`, async ({ browser }) => {
    const { ctx, controller } = await openSession(browser, mode);
    await controller.click('#btn-bad-sign');
    await expect(controller.locator('#log-list li').first()).toContainText(/失敗|簽章|isSuccess=false/, {
      timeout: 8000,
    });
    await controller.click('#btn-bad-store');
    await expect(controller.locator('#log-list li').first()).toContainText(/失敗|找不到|isSuccess=false/, {
      timeout: 8000,
    });
    await controller.click('#btn-bad-format');
    await expect(controller.locator('#log-list li').first()).toContainText(/失敗|格式|isSuccess=false/, {
      timeout: 8000,
    });
    await ctx.close();
  });

  test(`${tag} | network offline restore slow cable`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2501');
    await controller.click('#btn-add-ticket');
    const stylesBefore = await guestBoardStyleFingerprint(receiver);
    await controller.click('#btn-offline');
    await controller.waitForTimeout(1500);
    const stylesAfter = await guestBoardStyleFingerprint(receiver);
    expect(stylesAfter.stageSimulatedOffline).toBe('0');
    expect(stylesAfter.offlineClassNames).toEqual([]);
    expect(stylesAfter.stage).toEqual(stylesBefore.stage);
    expect(stylesAfter.board).toEqual(stylesBefore.board);
    const guestText = await receiver.locator('[data-testid="rcv-guest-stage"]').innerText();
    expect(guestText).not.toContain('尚未連線');
    expect(guestText).not.toContain('斷線');
    await controller.click('#btn-cable-pull');
    await expect(controller.locator('#log-list li').first()).toContainText('拔線', { timeout: 5000 });
    await controller.click('#btn-cable-restore');
    await controller.click('#btn-restore');
    await controller.click('#btn-slow');
    await expect(controller.locator('#log-list li').first()).toContainText('指令 slow', { timeout: 8000 });
    await ctx.close();
  });

  test(`${tag} | special clear reload dup late`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2601');
    await controller.click('#btn-add-ticket');
    await controller.click('#btn-dup-list');
    await controller.click('#btn-late-old');
    await controller.click('#btn-clear-now');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2601' })).toHaveCount(0, {
      timeout: 20000,
    });
    await controller.click('#btn-reload');
    await controller.waitForTimeout(4000);
    await ctx.close();
  });

  test(`${tag} | order number auto-increment`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    await controller.fill('#fld-no', '2001');
    await controller.selectOption('#fld-status', 'preparing');
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2001' })).toHaveCount(1, {
      timeout: 15000,
    });
    await controller.click('#btn-add-ticket');
    await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2002' })).toHaveCount(1, {
      timeout: 15000,
    });
    await expect(controller.locator('#fld-no')).toHaveValue('2003');
    await ctx.close();
  });

  test(`${tag} | order source badges`, async ({ browser }) => {
    const { ctx, receiver, controller } = await openSession(browser, mode);
    const cases = [
      { source: 'store', tag: '現場', no: '6201', status: 'preparing' },
      { source: 'fp', tag: '熊貓', no: '6202', status: 'preparing' },
      { source: 'uber', tag: 'Uber', no: '6203', status: 'ready' },
    ];
    for (const c of cases) {
      await controller.selectOption('#fld-source', c.source);
      await controller.fill('#fld-no', c.no);
      await controller.selectOption('#fld-status', c.status);
      await controller.click('#btn-add-ticket');
    }
    await expect(receiver.locator('.rcv-prep .rcv-tag', { hasText: '熊貓' })).toBeVisible({
      timeout: 15000,
    });
    await expect(receiver.locator('.rcv-ready .rcv-tag', { hasText: 'Uber' })).toBeVisible({
      timeout: 15000,
    });
    await ctx.close();
  });

  test(`${tag} | logs merge and export hooks`, async ({ browser }) => {
    const { ctx, controller } = await openSession(browser, mode);
    await controller.click('#btn-refresh-logs');
    await expect(controller.locator('#log-list li').first()).toBeVisible({ timeout: 8000 });
    await controller.fill('#log-filter', '連線');
    await expect(controller.locator('#log-list li').first()).toBeVisible();
    await ctx.close();
  });
}

test('controller | require connect inline reason', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const controller = await ctx.newPage();
  await controller.goto(`${urlsForMode('local').base}/controller/?mode=cloud`);
  await expandControllerZone(controller, 'sec-pos');
  await expect(controller.locator('#btn-add-ticket')).toBeDisabled();
  await expect(controller.locator('[data-testid="btn-add-ticket-block-reason"]')).toHaveText('請先按連線');
  await ctx.close();
});

test('board | no chime for ready while offline on reconnect', async ({ browser }) => {
  const { ctx, receiver, controller } = await openSession(browser, 'local');
  await receiver.evaluate(() => {
    window.__rcvTelemetry.ringCount = 0;
  });
  await controller.fill('#fld-no', '5501');
  await controller.selectOption('#fld-status', 'preparing');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '5501' })).toHaveCount(1, {
    timeout: 15000,
  });
  await controller.click('#btn-offline');
  await receiver.waitForFunction(
    () => window.receiverCloud && window.receiverCloud.isSimulatedOffline && window.receiverCloud.isSimulatedOffline(),
    { timeout: 10000 },
  );
  const ringsBefore = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  await controller.click('#btn-one-ready');
  await controller.waitForTimeout(2000);
  await controller.click('#btn-restore');
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '5501' })).toHaveCount(1, {
    timeout: 15000,
  });
  const ringsAfter = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  expect(ringsAfter).toBe(ringsBefore);
  await ctx.close();
});

test('board | cache after reload and no rechime on reconnect', async ({ browser }) => {
  const { ctx, receiver, controller } = await openSession(browser, 'local');
  await controller.fill('#fld-no', '2701');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2701', { timeout: 15000 });
  await receiver.reload();
  await expect(receiver.locator('.rcv-ready .rcv-num').first()).toHaveText('2701', { timeout: 15000 });
  const ringsBefore = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  await controller.click('#btn-offline');
  await controller.waitForTimeout(2000);
  await controller.click('#btn-restore');
  await controller.waitForTimeout(3000);
  const ringsAfter = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  expect(ringsAfter).toBe(ringsBefore);
  await ctx.close();
});

test('board | POS list exact removal and empty clears screen', async ({ browser }) => {
  const { ctx, receiver, controller } = await openSession(browser, 'local');
  await controller.fill('#fld-no', '2801');
  await controller.selectOption('#fld-status', 'preparing');
  await controller.click('#btn-add-ticket');
  await controller.fill('#fld-no', '2802');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2801' })).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '2802' })).toHaveCount(1, {
    timeout: 15000,
  });
  await controller.click('#btn-clear-board');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '2801' })).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '2802' })).toHaveCount(0, {
    timeout: 15000,
  });
  await ctx.close();
});

test('board | receiveBoard API and no Firebase SDK', async ({ browser }) => {
  const { ctx, receiver } = await openSession(browser, 'local');
  await receiver.evaluate(() => {
    const bd = window.QMS.Board.TodayBoard.taipeiBusinessDate();
    window.receiveBoard({
      seq: 99,
      storeId: 's120030',
      businessDate: bd,
      updatedAt: new Date().toISOString(),
      source: 'A',
      tickets: [{ no: '2811', status: 'preparing', updatedAt: new Date().toISOString() }],
    });
  });
  await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2811', { timeout: 8000 });
  const hasFb = await receiver.evaluate(() => typeof window.firebase !== 'undefined');
  expect(hasFb).toBe(false);
  await ctx.close();
});

test('board | clock shows Taipei when browser TZ is UTC', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  const page = await ctx.newPage();
  const { base } = urlsForMode('local');
  await page.goto(`${base}/receiver-demo/?store=s120030&device=stb-01`);
  const match = await page.evaluate(() => {
    const clock = document.getElementById('rcv-clock');
    const shown = clock ? clock.textContent : '';
    const expected = window.QMS.Board.TodayBoard.formatTaipeiClockHM();
    return { shown, expected };
  });
  expect(match.shown).toBe(match.expected);
  const utcHour = await page.evaluate(() => new Date().getUTCHours());
  const taipeiHour = Number(match.shown.split(':')[0]);
  if (utcHour <= 15) {
    expect(taipeiHour).toBeGreaterThanOrEqual(utcHour);
  }
  await ctx.close();
});

test('cloud | receiver setup gate without saved config', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${urlsForMode('local').base}/receiver-demo/?store=s120030&mode=cloud`);
  await expect(page.locator('[data-testid="rcv-setup-gate"]')).toBeVisible();
  await expect(page.locator('[data-testid="rcv-guest-stage"]')).toBeHidden();
  await ctx.close();
});

test('board | demo=1 query preserved', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(urlsForMode('local').recv + '&demo=1');
  await expect(page.locator('#rcv-demo-handle')).toBeVisible({ timeout: 8000 });
  await ctx.close();
});
