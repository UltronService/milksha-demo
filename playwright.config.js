/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'tests/e2e',
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  use: {
    headless: true,
  },
};
