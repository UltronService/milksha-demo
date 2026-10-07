import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';

const LEGACY_SEED = () => {
  if (localStorage.getItem('__legacy_seed_once')) {
    return;
  }
  localStorage.setItem('__legacy_seed_once', '1');
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'legacy-key',
      accessCode: 'legacy-code',
      region: 'asia-east1',
    }),
  );
  localStorage.setItem(
    'milksha:local:poc-target',
    JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', pinnedAt: Date.now() }),
  );
  localStorage.setItem(
    'milksha:receiver-cache:s120030',
    JSON.stringify({ seq: 9999, numberContent: [{ number: '9999' }], businessDate: '2099-01-01' }),
  );
  try {
    sessionStorage.setItem('__legacy_seed_cloud_settings', localStorage.getItem('milksha:cloud-settings'));
  } catch {
    /* ignore */
  }
};

test.describe('legacy localStorage cloud settings', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('legacy-key seed auto-migrates and board connects in cloud mode', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(LEGACY_SEED);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const after = await board.evaluate(() => ({
      before: sessionStorage.getItem('__legacy_seed_cloud_settings'),
      settings: localStorage.getItem('milksha:cloud-settings'),
      deviceId: localStorage.getItem('milksha:deviceId'),
      poc: localStorage.getItem('milksha:local:poc-target'),
    }));
    expect(after.before).toContain('legacy-key');
    expect(after.settings).toContain('fake-api-key-for-emulator');
    expect(after.settings).not.toContain('legacy-key');
    expect(after.deviceId).toBe('stb-01');
    expect(after.poc).toBeNull();
    await ctx.close();
  });
});
