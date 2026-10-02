/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'tests/e2e',
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  globalSetup: 'tests/e2e/global-setup.mjs',
  globalTeardown: 'tests/e2e/global-teardown.mjs',
  use: {
    headless: true,
  },
};
