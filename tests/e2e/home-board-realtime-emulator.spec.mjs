import { test, expect } from '@playwright/test';
import { restartCloud, startSite, resetCloudState } from './harness.mjs';
import { openRealtimeBoard } from './realtime-emulator-harness.mjs';

test.describe('home board fake-cloud (poll; no browser Firebase Auth)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('default firestore gateway: boardListen false (poll path)', async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await openRealtimeBoard(browser);
    await page.waitForTimeout(4000);
    const stats = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
    test.info().annotations.push({
      type: 'mode',
      description: stats.boardListen ? 'realtime' : 'poll',
    });
    expect(stats.boardListen).toBe(false);
    expect(stats.commandMode).toBe('poll');
    await ctx.close();
  });

  test('?realtime=0 forces poll same as main', async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await openRealtimeBoard(browser, { realtime: '0' });
    await page.waitForTimeout(3000);
    const stats = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
    test.info().annotations.push({ type: 'mode', description: 'poll' });
    expect(stats.boardListen).toBe(false);
    expect(stats.realtimeDisabled).toBe(true);
    await ctx.close();
  });
});
