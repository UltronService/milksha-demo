import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

const ZONE_TOGGLES = [
  'zone-toggle-connect',
  'zone-toggle-pos',
  'zone-toggle-net',
  'zone-toggle-special',
  'zone-toggle-log',
];

async function openLocalPocController(browser) {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(
    () =>
      Boolean(
        window.QMS &&
          window.QMS.runtime &&
          typeof window.QMS.runtime.applyPayload === 'function' &&
          window.receiverCloud,
      ),
    { timeout: 25000 },
  );
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');
  return { ctx, board, controller };
}

async function expandAllZones(page) {
  for (const id of ZONE_TOGGLES) {
    const toggle = page.locator(`[data-testid="${id}"]`);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
  }
}

async function logCount(page) {
  return page.locator('[data-testid="log-list"] li').count();
}

async function expectWorksOrVisibleReason(page, testId) {
  const btn = page.locator(`[data-testid="${testId}"]`);
  if (!(await btn.isVisible())) {
    return { status: 'works', testId, note: 'hidden in local mode' };
  }
  await expect(btn).toBeVisible();
  const disabled = await btn.isDisabled();
  if (disabled) {
    const reason = page.locator(`[data-testid="${testId}-block-reason"]`);
    await expect(reason).toBeVisible();
    await expect(reason).not.toHaveText('');
    return { status: 'disabled', testId };
  }
  const before = await logCount(page);
  const banner = page.locator('[data-testid="user-banner"]');
  if (testId === 'btn-export-json' || testId === 'btn-export-csv') {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      btn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/controller-logs\.(json|csv)/);
    return { status: 'works', testId, note: 'download' };
  }
  await btn.click();
  await page.waitForTimeout(400);
  const after = await logCount(page);
  const bannerVisible = await banner.isVisible();
  const bannerText = bannerVisible ? (await banner.textContent())?.trim() : '';
  const alertVisible = await page.locator('[data-testid="command-error-alert"]').isVisible();
  const connected = (await page.locator('#online-state').getAttribute('data-connected')) === '1';
  const boardUrl = await page.locator('[data-testid="fld-board-simple-url"]').inputValue().catch(() => '');
  const effect =
    after !== before ||
    bannerVisible ||
    alertVisible ||
    (testId === 'btn-gen-board-link' && boardUrl.length > 10) ||
    (testId === 'btn-connect' && connected);
  if (effect) {
    return { status: 'works', testId, logDelta: after - before, banner: bannerText };
  }
  throw new Error(`Button ${testId} had no visible effect and was not disabled with reason`);
}

test('local-link: section buttons work or show inline block reason', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, controller } = await openLocalPocController(browser);
  await expandAllZones(controller);

  await controller.locator('#tammy-advanced summary').click();

  const sectionButtons = [
    'btn-connect',
    'btn-add-ticket',
    'btn-one-ready',
    'btn-send-board',
    'btn-clear-board',
    'btn-gen-normal',
    'btn-gen-peak',
    'btn-send-tammy',
    'btn-bad-sign',
    'btn-bad-store',
    'btn-bad-format',
    'btn-offline',
    'btn-restore',
    'btn-slow',
    'btn-clear-now',
    'btn-reload',
    'btn-reboot',
    'btn-dup-list',
    'btn-late-old',
    'btn-refresh-logs',
    'btn-export-json',
    'btn-export-csv',
    'btn-clear-log',
  ];

  const results = [];
  for (const testId of sectionButtons) {
    results.push(await expectWorksOrVisibleReason(controller, testId));
  }

  await controller.fill('[data-testid="fld-pickup-scan"]', '9999');
  results.push(await expectWorksOrVisibleReason(controller, 'btn-pickup-scan'));

  for (const r of results) {
    expect(['works', 'disabled']).toContain(r.status);
  }

  await ctx.close();
});

test('local-link: cable pull disables outbound actions with visible reason', async ({ browser }) => {
  const { ctx, controller } = await openLocalPocController(browser);
  await expandAllZones(controller);
  await controller.click('[data-testid="btn-cable-pull"]');
  await expect(controller.locator('[data-testid="user-banner"]')).toContainText('拔線測試');
  const add = controller.locator('[data-testid="btn-add-ticket"]');
  await expect(add).toBeDisabled();
  await expect(controller.locator('[data-testid="btn-add-ticket-block-reason"]')).toContainText('拔線測試');
  await controller.click('[data-testid="btn-cable-restore"]');
  await expect(add).toBeEnabled();
  await ctx.close();
});

test('local-link: empty pickup scan shows banner reason', async ({ browser }) => {
  const { ctx, controller } = await openLocalPocController(browser);
  await expandAllZones(controller);
  await controller.click('[data-testid="btn-pickup-scan"]');
  await expect(controller.locator('[data-testid="user-banner"]')).toContainText('請輸入');
  await ctx.close();
});
